import hashlib
import json
import re
import uuid
from datetime import UTC, datetime
from math import ceil
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import ApiError
from app.core.security import create_access_token, hash_password, new_refresh_token, verify_password
from app.models import (
    AuditLog, Cart, CartItem, Category, IdempotencyKey, Inventory, InventoryReservation,
    Order, OrderItem, OrderState, OutboxEvent, Payment, PaymentState, Product, RefreshToken,
    User, UserRole,
)
from app.order_state import can_transition
from app.schemas import CategoryCreate, CategoryUpdate, ProductCreate, ProductUpdate


def _slug(value: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-")


def user_payload(user: User) -> dict[str, Any]:
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role, "created_at": user.created_at}


def auth_response(db: Session, user: User) -> dict[str, Any]:
    token, token_hash, expires_at = new_refresh_token()
    db.add(RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
    db.commit()
    return {"user": user_payload(user), "accessToken": create_access_token(user), "refreshToken": token, "tokenType": "Bearer", "expiresIn": 900}


def register(db: Session, email: str, name: str, password: str) -> dict[str, Any]:
    if db.scalar(select(User).where(User.email == email)):
        raise ApiError(409, "A user with this email already exists")
    user = User(email=email, name=name.strip(), password_hash=hash_password(password), role=UserRole.CUSTOMER)
    db.add(user)
    try:
        db.flush()
        return auth_response(db, user)
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "A user with this email already exists") from None


def login(db: Session, email: str, password: str) -> dict[str, Any]:
    user = db.scalar(select(User).where(User.email == email))
    if not user or not user.is_active or not verify_password(password, user.password_hash):
        raise ApiError(401, "Invalid email or password")
    return auth_response(db, user)


def refresh(db: Session, raw_token: str) -> dict[str, Any]:
    token_hash = _refresh_hash(raw_token)
    record = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update())
    now = datetime.now(UTC)
    if not record or record.revoked_at or record.expires_at <= now:
        raise ApiError(401, "Invalid refresh token")
    user = db.get(User, record.user_id)
    if not user or not user.is_active:
        raise ApiError(401, "Invalid refresh token")
    next_token, next_hash, expires_at = new_refresh_token()
    replacement = RefreshToken(user_id=user.id, token_hash=next_hash, expires_at=expires_at)
    db.add(replacement)
    db.flush()
    record.revoked_at = now
    record.replaced_by_token_id = replacement.id
    db.commit()
    return {"user": user_payload(user), "accessToken": create_access_token(user), "refreshToken": next_token, "tokenType": "Bearer", "expiresIn": 900}


def logout(db: Session, raw_token: str) -> None:
    record = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _refresh_hash(raw_token)))
    if record and not record.revoked_at:
        record.revoked_at = datetime.now(UTC)
        db.commit()


def _refresh_hash(token: str) -> str:
    import hmac
    from app.core.config import settings
    from app.core.security import _b64
    return _b64(hmac.new(settings.jwt_refresh_secret.encode(), token.encode(), hashlib.sha256).digest())


def paginate(items: list[Any], total: int, page: int, page_size: int) -> dict[str, Any]:
    return {"items": items, "total": total, "page": page, "pageSize": page_size, "totalPages": ceil(total / page_size) if total else 0}


def list_categories(db: Session, page: int, page_size: int, search: str | None, is_active: bool | None) -> dict[str, Any]:
    query = select(Category)
    count = select(func.count(Category.id))
    if search:
        category_filter = Category.name.ilike(f"%{search}%") | Category.description.ilike(f"%{search}%")
        query = query.where(category_filter)
        count = count.where(category_filter)
    if is_active is not None:
        query = query.where(Category.is_active.is_(is_active))
        count = count.where(Category.is_active.is_(is_active))
    total = db.scalar(count) or 0
    rows = db.scalars(query.order_by(Category.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return paginate(rows, total, page, page_size)


def create_category(db: Session, data: CategoryCreate) -> Category:
    category = Category(name=data.name.strip(), slug=data.slug or _slug(data.name), description=data.description, is_active=True if data.is_active is None else data.is_active)
    db.add(category)
    try:
        db.commit()
        db.refresh(category)
        return category
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "Category slug already exists") from None


def update_category(db: Session, category_id: uuid.UUID, data: CategoryUpdate) -> Category:
    category = db.get(Category, category_id)
    if not category:
        raise ApiError(404, "Category not found")
    values = data.model_dump(exclude_unset=True)
    if not values:
        raise ApiError(400, "Invalid request")
    if values.get("name") and "slug" not in values:
        values["slug"] = _slug(values["name"])
    for key, value in values.items():
        setattr(category, key, value)
    try:
        db.commit()
        db.refresh(category)
        return category
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "A category with this slug already exists") from None


def list_products(db: Session, page: int, page_size: int, search: str | None, category_id: uuid.UUID | None, is_active: bool | None, sort_by: str, sort_direction: str) -> dict[str, Any]:
    query = select(Product)
    count = select(func.count(Product.id))
    filters = []
    if search:
        filters.append(Product.name.ilike(f"%{search}%") | Product.description.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%"))
    if category_id:
        filters.append(Product.category_id == category_id)
    if is_active is not None:
        filters.append(Product.is_active.is_(is_active))
    if filters:
        query = query.where(*filters)
        count = count.where(*filters)
    column = {"createdAt": Product.created_at, "name": Product.name, "priceCents": Product.price_cents}[sort_by]
    total = db.scalar(count) or 0
    rows = db.scalars(query.order_by(column.asc() if sort_direction == "asc" else column.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return paginate(rows, total, page, page_size)


def create_product(db: Session, data: ProductCreate) -> Product:
    if data.category_id and not db.get(Category, data.category_id):
        raise ApiError(400, "Category does not exist")
    product = Product(sku=data.sku.strip().upper(), name=data.name.strip(), slug=data.slug or _slug(data.name), description=data.description, price_cents=data.price_cents, currency=data.currency.upper(), category_id=data.category_id, is_active=True if data.is_active is None else data.is_active)
    db.add(product)
    try:
        db.commit()
        db.refresh(product)
        return product
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "Product SKU or slug already exists") from None


def update_product(db: Session, product_id: uuid.UUID, data: ProductUpdate) -> Product:
    product = db.get(Product, product_id)
    if not product:
        raise ApiError(404, "Product not found")
    values = data.model_dump(exclude_unset=True, by_alias=False)
    if not values:
        raise ApiError(400, "Invalid request")
    if values.get("category_id") and not db.get(Category, values["category_id"]):
        raise ApiError(400, "Category does not exist")
    if values.get("name") and "slug" not in values:
        values["slug"] = _slug(values["name"])
    for key, value in values.items():
        setattr(product, key, value.upper() if key in {"sku", "currency"} and isinstance(value, str) else value)
    try:
        db.commit()
        db.refresh(product)
        return product
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "A product with this SKU or slug already exists") from None


def get_or_create_cart(db: Session, user_id: uuid.UUID) -> Cart:
    cart = db.scalar(select(Cart).where(Cart.user_id == user_id).options(selectinload(Cart.items).selectinload(CartItem.product)))
    if not cart:
        cart = Cart(user_id=user_id)
        db.add(cart)
        db.commit()
        db.refresh(cart)
    return cart


def cart_with_items(db: Session, user_id: uuid.UUID) -> Cart:
    return get_or_create_cart(db, user_id)


def add_cart_item(db: Session, user_id: uuid.UUID, product_id: uuid.UUID, quantity: int) -> Cart:
    product = db.get(Product, product_id)
    if not product:
        raise ApiError(404, "Product not found")
    if not product.is_active:
        raise ApiError(400, "Product is not active")
    inventory = db.get(Inventory, product_id)
    if not inventory or inventory.available_quantity < quantity:
        raise ApiError(409, "Insufficient stock")
    cart = get_or_create_cart(db, user_id)
    item = db.scalar(select(CartItem).where(CartItem.cart_id == cart.id, CartItem.product_id == product_id))
    if item:
        item.quantity = quantity
    else:
        db.add(CartItem(cart_id=cart.id, product_id=product_id, quantity=quantity))
    db.commit()
    return cart_with_items(db, user_id)


def update_cart_item(db: Session, user_id: uuid.UUID, item_id: uuid.UUID, quantity: int) -> Cart:
    item = db.scalar(select(CartItem).join(Cart).where(Cart.user_id == user_id, CartItem.id == item_id).options(selectinload(CartItem.product)))
    if not item:
        raise ApiError(404, "Cart item not found")
    if not item.product.is_active:
        raise ApiError(400, "Product is not active")
    inventory = db.get(Inventory, item.product_id)
    if not inventory or inventory.available_quantity < quantity:
        raise ApiError(409, "Insufficient stock")
    item.quantity = quantity
    db.commit()
    return cart_with_items(db, user_id)


def remove_cart_item(db: Session, user_id: uuid.UUID, item_id: uuid.UUID) -> Cart:
    item = db.scalar(select(CartItem).join(Cart).where(Cart.user_id == user_id, CartItem.id == item_id))
    if not item:
        raise ApiError(404, "Cart item not found")
    cart_id = item.cart_id
    db.delete(item)
    db.commit()
    cart = db.get(Cart, cart_id)
    return cart_with_items(db, user_id)


def create_order(db: Session, user_id: uuid.UUID) -> Order:
    cart = db.scalar(select(Cart).where(Cart.user_id == user_id).options(selectinload(Cart.items).selectinload(CartItem.product)))
    if not cart or not cart.items:
        raise ApiError(400, "Cart is empty")
    currency = cart.items[0].product.currency
    if any(not item.product.is_active for item in cart.items):
        inactive = next(item for item in cart.items if not item.product.is_active)
        raise ApiError(400, f"Product {inactive.product_id} is not active")
    if any(item.product.currency != currency for item in cart.items):
        raise ApiError(400, "Cart contains multiple currencies")
    for item in cart.items:
        changed = db.execute(update(Inventory).where(Inventory.product_id == item.product_id, Inventory.available_quantity >= item.quantity).values(available_quantity=Inventory.available_quantity - item.quantity, reserved_quantity=Inventory.reserved_quantity + item.quantity, version=Inventory.version + 1))
        if changed.rowcount != 1:
            db.rollback()
            raise ApiError(409, "Insufficient stock")
    order = Order(user_id=user_id, state=OrderState.PLACED, total_cents=sum(item.product.price_cents * item.quantity for item in cart.items), currency=currency)
    db.add(order)
    db.flush()
    for item in cart.items:
        db.add(OrderItem(order_id=order.id, product_id=item.product_id, sku=item.product.sku, name=item.product.name, quantity=item.quantity, unit_price_cents=item.product.price_cents, line_total_cents=item.product.price_cents * item.quantity))
        db.add(InventoryReservation(order_id=order.id, product_id=item.product_id, quantity=item.quantity))
        add_outbox(db, "InventoryReserved", "order", str(order.id), {"orderId": str(order.id), "productId": str(item.product_id), "quantity": item.quantity})
    add_outbox(db, "OrderCreated", "order", str(order.id), {"orderId": str(order.id), "userId": str(user_id), "totalCents": order.total_cents, "currency": currency})
    db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
    db.commit()
    return get_order(db, order.id, user_id)


def get_order(db: Session, order_id: uuid.UUID, user_id: uuid.UUID | None = None) -> Order:
    query = select(Order).where(Order.id == order_id).options(selectinload(Order.items), selectinload(Order.reservations))
    if user_id:
        query = query.where(Order.user_id == user_id)
    order = db.scalar(query)
    if not order:
        raise ApiError(404, "Order not found")
    return order


def cancel_order(db: Session, order_id: uuid.UUID, user_id: uuid.UUID) -> Order:
    order = get_order(db, order_id, user_id)
    if not can_transition(order.state, OrderState.CANCELLED):
        raise ApiError(409, f"Cannot cancel order in {order.state.value} state")
    for reservation in order.reservations:
        if reservation.released_at is None:
            db.execute(update(Inventory).where(Inventory.product_id == reservation.product_id).values(available_quantity=Inventory.available_quantity + reservation.quantity, reserved_quantity=Inventory.reserved_quantity - reservation.quantity, version=Inventory.version + 1))
            reservation.released_at = datetime.now(UTC)
            add_outbox(db, "InventoryReleased", "order", str(order.id), {"orderId": str(order.id), "productId": str(reservation.product_id), "quantity": reservation.quantity})
    order.state = OrderState.CANCELLED
    order.cancelled_at = datetime.now(UTC)
    add_outbox(db, "OrderCancelled", "order", str(order.id), {"orderId": str(order.id), "userId": str(user_id)})
    db.commit()
    return get_order(db, order_id, user_id)


def transition_order(db: Session, order_id: uuid.UUID, next_state: OrderState) -> Order:
    order = get_order(db, order_id)
    if not can_transition(order.state, next_state):
        raise ApiError(409, f"Cannot transition order from {order.state.value} to {next_state.value}")
    order.state = next_state
    db.commit()
    return get_order(db, order_id)


def add_outbox(db: Session, event_type: str, aggregate_type: str, aggregate_id: str, payload: dict[str, Any]) -> None:
    event_id = str(uuid.uuid4())
    event = {"id": event_id, "type": event_type, "aggregateType": aggregate_type, "aggregateId": aggregate_id, "payload": payload, "occurredAt": datetime.now(UTC).isoformat()}
    db.add(OutboxEvent(id=uuid.UUID(event_id), event_type=event_type, aggregate_type=aggregate_type, aggregate_id=aggregate_id, payload=event))


def hash_payment_body(body: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def create_payment(db: Session, user_id: uuid.UUID, key: str, method: str, path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any], bool]:
    existing = db.scalar(select(IdempotencyKey).where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key, IdempotencyKey.method == method, IdempotencyKey.path == path))
    request_hash = hash_payment_body(body)
    if existing:
        if existing.request_hash != request_hash:
            raise ApiError(409, "Idempotency key was already used with a different request")
        return existing.response_status, existing.response_body, True
    order = db.scalar(select(Order).where(Order.id == body["order_id"], Order.user_id == user_id))
    if not order:
        raise ApiError(404, "Order not found")
    if order.state == OrderState.CANCELLED:
        raise ApiError(409, "Cannot pay for a cancelled order")
    failed = body.get("simulate_failure", False)
    payment = Payment(user_id=user_id, order_id=order.id, amount_cents=order.total_cents, currency=order.currency, state=PaymentState.FAILED if failed else PaymentState.SUCCESS, provider_ref=f"sim_{uuid.uuid4()}", failure_reason="Simulated payment failure" if failed else None)
    db.add(payment)
    db.flush()
    response = {"payment": payment_payload(payment)}
    status = 402 if failed else 201
    payment_payload_data = {"paymentId": str(payment.id), "orderId": str(order.id), "userId": str(user_id), "amountCents": payment.amount_cents}
    if failed:
        payment_payload_data["reason"] = payment.failure_reason or "Payment failed"
    add_outbox(db, "PaymentFailed" if failed else "PaymentSucceeded", "payment", str(payment.id), payment_payload_data)
    db.add(IdempotencyKey(user_id=user_id, key=key, method=method, path=path, request_hash=request_hash, response_status=status, response_body=response))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        replay = db.scalar(select(IdempotencyKey).where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key, IdempotencyKey.method == method, IdempotencyKey.path == path))
        if replay and replay.request_hash == request_hash:
            return replay.response_status, replay.response_body, True
        raise ApiError(409, "Idempotency key conflict") from None
    return status, response, False


def payment_payload(payment: Payment) -> dict[str, Any]:
    return {"id": payment.id, "userId": payment.user_id, "orderId": payment.order_id, "amountCents": payment.amount_cents, "currency": payment.currency, "state": payment.state, "providerRef": payment.provider_ref, "failureReason": payment.failure_reason, "createdAt": payment.created_at, "updatedAt": payment.updated_at}
