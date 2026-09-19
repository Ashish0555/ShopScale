from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from app.schemas import ProductResponse, PublicUser
from app.services import payment_payload


def test_public_user_uses_frontend_field_names():
    user = SimpleNamespace(id=uuid4(), email="user@example.com", name="User", role="CUSTOMER", created_at=datetime.now(UTC))
    result = PublicUser.model_validate({"id": user.id, "email": user.email, "name": user.name, "role": user.role, "created_at": user.created_at}).model_dump(by_alias=True)
    assert "createdAt" in result
    assert "created_at" not in result


def test_product_response_preserves_nested_category_and_camel_case():
    product_id = uuid4()
    result = ProductResponse.model_validate(SimpleNamespace(id=product_id, sku="SKU-1", slug="product-1", name="Product", description=None, price_cents=100, currency="USD", is_active=True, category_id=None, category=SimpleNamespace(id=uuid4(), name="Category", slug="category"), created_at=datetime.now(UTC), updated_at=datetime.now(UTC))).model_dump(by_alias=True)
    assert result["priceCents"] == 100
    assert result["category"]["slug"] == "category"


def test_payment_payload_preserves_original_contract():
    payment = SimpleNamespace(id=uuid4(), user_id=uuid4(), order_id=uuid4(), amount_cents=100, currency="USD", state="SUCCESS", provider_ref="sim-1", failure_reason=None, created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
    result = payment_payload(payment)
    assert result["userId"] == payment.user_id
    assert result["amountCents"] == 100
    assert "createdAt" in result
