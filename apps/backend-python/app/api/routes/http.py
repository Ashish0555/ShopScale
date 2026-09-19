import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.dependencies import admin_user, current_user, login_rate_limit, order_rate_limit, payment_rate_limit
from app.core.config import settings
from app.core.errors import ApiError
from app.db.database import get_db
from app.models import AuditLog, Category, Order, Payment, Product, User
from app.schemas import (
    AuthResponse, AuthRequest, CartItemRequest, CartResponse, CategoryCreate, CategoryResponse, CategoryUpdate,
    OrderResponse, PaymentRequest, PaymentResponse, ProductCreate, ProductResponse, ProductUpdate, QuantityRequest,
    PublicUser, RefreshRequest, RegisterRequest,
)
from app import services
from app.cache.redis_store import cache

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Current = Annotated[User, Depends(current_user)]
Admin = Annotated[User, Depends(admin_user)]


def body(model: object) -> dict:
    if hasattr(model, "model_dump"):
        return model.model_dump(by_alias=True, mode="json")
    return model


def serialize(value: object, model: type) -> dict:
    return model.model_validate(value).model_dump(by_alias=True, mode="json")


def serialize_page(value: dict, model: type) -> dict:
    return {**value, "items": [serialize(item, model) for item in value["items"]]}


@router.get("/health")
def health() -> dict[str, str]:
    from datetime import UTC, datetime
    return {"status": "ok", "service": "shopscale-backend", "timestamp": datetime.now(UTC).isoformat()}


@router.get("/ready")
def ready(db: Db) -> dict[str, object]:
    db.execute(select(1))
    from datetime import UTC, datetime
    return {"status": "ready", "checks": {"database": "ok"}, "timestamp": datetime.now(UTC).isoformat()}


@router.post("/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: Db) -> dict:
    return services.register(db, data.email, data.name, data.password)


@router.post("/auth/login", response_model=AuthResponse)
def login(data: AuthRequest, db: Db, _limited: None = Depends(login_rate_limit)) -> dict:
    return services.login(db, data.email, data.password)


@router.post("/auth/refresh", response_model=AuthResponse)
def refresh(data: RefreshRequest, db: Db) -> dict:
    return services.refresh(db, data.refresh_token)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(data: RefreshRequest, db: Db) -> Response:
    services.logout(db, data.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users/me")
def me(user: Current) -> dict:
    return {"user": serialize(services.user_payload(user), PublicUser)}


@router.get("/users")
def users(admin: Admin, db: Db) -> dict:
    return {"users": [serialize(services.user_payload(user), PublicUser) for user in db.scalars(select(User).order_by(User.created_at.desc())).all()]}


@router.get("/categories")
def categories(db: Db, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize"), search: str | None = Query(None, min_length=1, max_length=100), is_active: bool | None = Query(None, alias="isActive")) -> dict:
    return serialize_page(services.list_categories(db, page, page_size, search, is_active), CategoryResponse)


@router.get("/categories/{category_id}", response_model=dict)
def category(category_id: uuid.UUID, db: Db) -> dict:
    value = db.get(Category, category_id)
    if not value:
        raise ApiError(404, "Category not found")
    return {"category": serialize(value, CategoryResponse)}


@router.post("/categories", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryCreate, admin: Admin, db: Db) -> dict:
    return {"category": serialize(services.create_category(db, data), CategoryResponse)}


@router.patch("/categories/{category_id}", response_model=dict)
def patch_category(category_id: uuid.UUID, data: CategoryUpdate, admin: Admin, db: Db) -> dict:
    return {"category": serialize(services.update_category(db, category_id, data), CategoryResponse)}


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: uuid.UUID, admin: Admin, db: Db) -> Response:
    value = db.get(Category, category_id)
    if not value:
        raise ApiError(404, "Category not found")
    db.delete(value)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/products")
def products(db: Db, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize"), search: str | None = Query(None, min_length=1, max_length=100), category_id: uuid.UUID | None = Query(None, alias="categoryId"), is_active: bool | None = Query(None, alias="isActive"), sort_by: str = Query("createdAt", alias="sortBy", pattern="^(createdAt|name|priceCents)$"), sort_direction: str = Query("desc", alias="sortDirection", pattern="^(asc|desc)$")) -> dict:
    return serialize_page(services.list_products(db, page, page_size, search, category_id, is_active, sort_by, sort_direction), ProductResponse)


@router.get("/products/{product_id}", response_model=dict)
def product(product_id: uuid.UUID, db: Db) -> dict:
    cached = cache.get_json(f"product:{product_id}")
    if cached:
        return {"product": cached}
    value = db.get(Product, product_id)
    if not value:
        raise ApiError(404, "Product not found")
    result = serialize(value, ProductResponse)
    cache.set_json(f"product:{product_id}", result, settings.product_cache_ttl_seconds)
    return {"product": result}


@router.post("/products", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_product(data: ProductCreate, admin: Admin, db: Db) -> dict:
    return {"product": serialize(services.create_product(db, data), ProductResponse)}


@router.patch("/products/{product_id}", response_model=dict)
def patch_product(product_id: uuid.UUID, data: ProductUpdate, admin: Admin, db: Db) -> dict:
    value = services.update_product(db, product_id, data)
    cache.delete(f"product:{product_id}")
    return {"product": serialize(value, ProductResponse)}


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: uuid.UUID, admin: Admin, db: Db) -> Response:
    value = db.get(Product, product_id)
    if not value:
        raise ApiError(404, "Product not found")
    db.delete(value)
    db.commit()
    cache.delete(f"product:{product_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/cart")
def get_cart(user: Current, db: Db) -> dict:
    return {"cart": serialize(services.cart_with_items(db, user.id), CartResponse)}


@router.post("/cart/items")
def add_cart(data: CartItemRequest, user: Current, db: Db) -> dict:
    return {"cart": serialize(services.add_cart_item(db, user.id, data.product_id, data.quantity), CartResponse)}


@router.patch("/cart/items/{item_id}")
def patch_cart(item_id: uuid.UUID, data: QuantityRequest, user: Current, db: Db) -> dict:
    return {"cart": serialize(services.update_cart_item(db, user.id, item_id, data.quantity), CartResponse)}


@router.delete("/cart/items/{item_id}")
def delete_cart_item(item_id: uuid.UUID, user: Current, db: Db) -> dict:
    return {"cart": serialize(services.remove_cart_item(db, user.id, item_id), CartResponse)}


@router.delete("/cart")
def clear_cart(user: Current, db: Db) -> dict:
    cart = services.get_or_create_cart(db, user.id)
    for item in list(cart.items):
        db.delete(item)
    db.commit()
    return {"cart": serialize(services.cart_with_items(db, user.id), CartResponse)}


@router.post("/orders", status_code=status.HTTP_201_CREATED)
def create_order(user: Current, db: Db, _limited: None = Depends(order_rate_limit)) -> dict:
    return {"order": serialize(services.create_order(db, user.id), OrderResponse)}


@router.get("/orders")
def list_orders(user: Current, db: Db, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize")) -> dict:
    total = db.scalar(select(func.count(Order.id)).where(Order.user_id == user.id)) or 0
    rows = db.scalars(select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return serialize_page(services.paginate(rows, total, page, page_size), OrderResponse)


@router.get("/orders/{order_id}")
def get_order(order_id: uuid.UUID, user: Current, db: Db) -> dict:
    return {"order": serialize(services.get_order(db, order_id, user.id), OrderResponse)}


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: uuid.UUID, user: Current, db: Db) -> dict:
    return {"order": serialize(services.cancel_order(db, order_id, user.id), OrderResponse)}


@router.post("/payments")
def create_payment(data: PaymentRequest, user: Current, db: Db, idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None, _limited: None = Depends(payment_rate_limit)) -> Response:
    if not idempotency_key:
        raise ApiError(400, "Idempotency-Key header is required")
    if len(idempotency_key.strip()) > 255:
        raise ApiError(400, "Idempotency-Key header is too long")
    status_code, result, replayed = services.create_payment(db, user.id, idempotency_key.strip(), "POST", "/payments", {"order_id": str(data.order_id), "simulate_failure": data.simulate_failure})
    headers = {"Idempotency-Replayed": "true"} if replayed else {}
    import json
    return Response(content=json.dumps(result, default=str), status_code=status_code, media_type="application/json", headers=headers)


@router.get("/payments/{payment_id}")
def get_payment(payment_id: uuid.UUID, user: Current, db: Db) -> dict:
    payment = db.scalar(select(Payment).where(Payment.id == payment_id, Payment.user_id == user.id))
    if not payment:
        raise ApiError(404, "Payment not found")
    return {"payment": services.payment_payload(payment)}


@router.get("/admin/orders")
def admin_orders(admin: Admin, db: Db, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize")) -> dict:
    total = db.scalar(select(func.count(Order.id))) or 0
    rows = db.scalars(select(Order).order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [{"id": order.id, "userId": order.user_id, "state": order.state, "totalCents": order.total_cents, "currency": order.currency, "createdAt": order.created_at, "updatedAt": order.updated_at} for order in rows], "total": total, "page": page, "pageSize": page_size, "totalPages": (total + page_size - 1) // page_size if total else 0}


@router.patch("/admin/orders/{order_id}/status")
def admin_status(order_id: uuid.UUID, data: dict, admin: Admin, db: Db) -> dict:
    try:
        state = data["state"]
        next_state = __import__("app.models", fromlist=["OrderState"]).OrderState(state)
    except (KeyError, ValueError):
        raise ApiError(400, "Invalid request") from None
    order = services.transition_order(db, order_id, next_state)
    db.add(AuditLog(actor_user_id=admin.id, action="ORDER_STATUS_CHANGED", entity_type="order", entity_id=str(order.id), metadata_json={"state": state}))
    db.commit()
    return {"order": serialize(order, OrderResponse)}


@router.get("/admin/inventory")
def admin_inventory(admin: Admin, db: Db) -> dict:
    from app.models import Inventory
    rows = db.execute(select(Inventory, Product).join(Product, Product.id == Inventory.product_id).order_by(Inventory.updated_at.desc())).all()
    return {"items": [{"productId": inventory.product_id, "sku": product.sku, "name": product.name, "availableQuantity": inventory.available_quantity, "reservedQuantity": inventory.reserved_quantity, "version": inventory.version} for inventory, product in rows]}


@router.get("/admin/audit")
def admin_audit(admin: Admin, db: Db, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100, alias="pageSize")) -> dict:
    total = db.scalar(select(func.count(AuditLog.id))) or 0
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    items = [{"id": row.id, "actorUserId": row.actor_user_id, "action": row.action, "entityType": row.entity_type, "entityId": row.entity_id, "metadata": row.metadata_json, "createdAt": row.created_at} for row in rows]
    return {"items": items, "total": total, "page": page, "pageSize": page_size, "totalPages": (total + page_size - 1) // page_size if total else 0}
