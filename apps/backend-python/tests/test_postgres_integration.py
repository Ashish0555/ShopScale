"""Opt-in PostgreSQL tests for behavior that SQLite cannot model faithfully.

Run with a disposable PostgreSQL database:
RUN_POSTGRES_TESTS=1 TEST_DATABASE_URL=postgresql+psycopg://... python -m pytest -q tests
"""

import os
import threading
import uuid

import pytest

if os.getenv("RUN_POSTGRES_TESTS") != "1":
    pytest.skip("Set RUN_POSTGRES_TESTS=1 with a disposable PostgreSQL database", allow_module_level=True)

from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ApiError
from app.db.base import Base
from app.models import Cart, CartItem, IdempotencyKey, Inventory, InventoryReservation, Order, OutboxEvent, Payment, Product, User
from app.services import create_order, create_payment


engine = create_engine(os.environ["TEST_DATABASE_URL"], pool_pre_ping=True)
SessionFactory = sessionmaker(bind=engine, expire_on_commit=False)


@pytest.fixture(scope="module", autouse=True)
def database_schema():
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


def _seed_cart(db: Session, quantity: int = 1, stock: int = 1):
    user = User(id=uuid.uuid4(), email=f"{uuid.uuid4()}@example.com", name="Test User", password_hash="unused")
    product = Product(id=uuid.uuid4(), sku=f"SKU-{uuid.uuid4().hex[:8]}", slug=f"product-{uuid.uuid4().hex[:8]}", name="Test Product", price_cents=1000, currency="USD")
    inventory = Inventory(product_id=product.id, available_quantity=stock, reserved_quantity=0, version=0)
    cart = Cart(id=uuid.uuid4(), user_id=user.id)
    db.add_all([user, product, inventory, cart, CartItem(cart_id=cart.id, product_id=product.id, quantity=quantity)])
    db.commit()
    return user, product


def _cleanup(db: Session) -> None:
    db.execute(delete(OutboxEvent))
    db.execute(delete(IdempotencyKey))
    db.execute(delete(Payment))
    db.execute(delete(InventoryReservation))
    db.execute(delete(CartItem))
    db.execute(delete(Order))
    db.execute(delete(Inventory))
    db.execute(delete(Cart))
    db.execute(delete(Product))
    db.execute(delete(User))
    db.commit()


def test_concurrent_orders_reserve_stock_once_and_write_outbox():
    setup = SessionFactory()
    first_user, product = _seed_cart(setup, stock=1)
    second_user = User(id=uuid.uuid4(), email=f"{uuid.uuid4()}@example.com", name="Second User", password_hash="unused")
    second_cart = Cart(id=uuid.uuid4(), user_id=second_user.id)
    setup.add_all([second_user, second_cart, CartItem(cart_id=second_cart.id, product_id=product.id, quantity=1)])
    setup.commit()
    setup.close()

    results: list[Order] = []
    errors: list[Exception] = []
    barrier = threading.Barrier(2)

    def place_order(user_id):
        db = SessionFactory()
        try:
            barrier.wait()
            results.append(create_order(db, user_id))
        except Exception as error:
            errors.append(error)
        finally:
            db.close()

    threads = [threading.Thread(target=place_order, args=(first_user.id,)), threading.Thread(target=place_order, args=(second_user.id,))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    check = SessionFactory()
    inventory = check.get(Inventory, product.id)
    assert len(results) == 1
    assert any(isinstance(error, ApiError) and error.status_code == 409 for error in errors)
    assert inventory.available_quantity == 0
    assert inventory.reserved_quantity == 1
    assert check.scalar(select(func.count(Order.id))) == 1
    assert check.scalar(select(func.count(OutboxEvent.id))) == 2
    _cleanup(check)
    check.close()


def test_order_failure_rolls_back_inventory_and_outbox():
    db = SessionFactory()
    user, _product = _seed_cart(db, stock=0)
    with pytest.raises(ApiError) as error:
        create_order(db, user.id)
    assert error.value.status_code == 409
    assert db.scalar(select(func.count(Order.id))) == 0
    assert db.scalar(select(func.count(OutboxEvent.id))) == 0
    _cleanup(db)
    db.close()


def test_payment_idempotency_replays_same_response():
    db = SessionFactory()
    user, _product = _seed_cart(db, stock=1)
    order = create_order(db, user.id)
    body = {"order_id": str(order.id), "simulate_failure": False}
    first = create_payment(db, user.id, "same-key", "POST", "/payments", body)
    second = create_payment(db, user.id, "same-key", "POST", "/payments", body)
    assert first[0] == second[0] == 201
    assert first[1] == second[1]
    assert second[2] is True
    assert db.scalar(select(func.count(Payment.id))) == 1
    assert db.scalar(select(func.count(IdempotencyKey.id))) == 1
    _cleanup(db)
    db.close()
