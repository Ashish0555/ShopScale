from datetime import datetime
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

from app.models import OrderState, PaymentState, UserRole


class PublicUser(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: UUID
    email: str
    name: str
    role: UserRole
    created_at: datetime = Field(alias="createdAt", validation_alias=AliasChoices("created_at", "createdAt"))


class AuthRequest(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class RegisterRequest(AuthRequest):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class RefreshRequest(BaseModel):
    refresh_token: str = Field(alias="refreshToken", min_length=32, max_length=512)
    model_config = ConfigDict(populate_by_name=True)


class AuthResponse(BaseModel):
    user: PublicUser
    access_token: str = Field(alias="accessToken")
    refresh_token: str = Field(alias="refreshToken")
    token_type: str = Field(alias="tokenType")
    expires_in: int = Field(alias="expiresIn")
    model_config = ConfigDict(populate_by_name=True)


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str
    description: str | None
    is_active: bool = Field(alias="isActive", validation_alias=AliasChoices("is_active", "isActive"))
    created_at: datetime = Field(alias="createdAt", validation_alias=AliasChoices("created_at", "createdAt"))
    updated_at: datetime = Field(alias="updatedAt", validation_alias=AliasChoices("updated_at", "updatedAt"))


class ProductCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=160)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    price_cents: int = Field(alias="priceCents", ge=0, le=100_000_000, validation_alias=AliasChoices("price_cents", "priceCents"))
    currency: str = Field(default="USD", min_length=3, max_length=3)
    category_id: UUID | None = Field(default=None, alias="categoryId")
    is_active: bool | None = None
    model_config = ConfigDict(populate_by_name=True)

    @field_validator("sku", "name", "currency")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return value.strip().upper() if value == value.upper() else value.strip()


class ProductUpdate(BaseModel):
    sku: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    price_cents: int | None = Field(default=None, alias="priceCents", ge=0, le=100_000_000, validation_alias=AliasChoices("price_cents", "priceCents"))
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    category_id: UUID | None = Field(default=None, alias="categoryId")
    is_active: bool | None = None
    model_config = ConfigDict(populate_by_name=True)


class CategorySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    sku: str
    slug: str
    name: str
    description: str | None
    price_cents: int = Field(alias="priceCents", validation_alias=AliasChoices("price_cents", "priceCents"))
    currency: str
    is_active: bool = Field(alias="isActive", validation_alias=AliasChoices("is_active", "isActive"))
    category_id: UUID | None = Field(alias="categoryId", validation_alias=AliasChoices("category_id", "categoryId"))
    category: CategorySummary | None = None
    created_at: datetime = Field(alias="createdAt", validation_alias=AliasChoices("created_at", "createdAt"))
    updated_at: datetime = Field(alias="updatedAt", validation_alias=AliasChoices("updated_at", "updatedAt"))


class CartItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    product_id: UUID = Field(alias="productId", validation_alias=AliasChoices("product_id", "productId"))
    quantity: int
    product: ProductResponse
    created_at: datetime = Field(alias="createdAt", validation_alias=AliasChoices("created_at", "createdAt"))
    updated_at: datetime = Field(alias="updatedAt", validation_alias=AliasChoices("updated_at", "updatedAt"))


class CartResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID = Field(alias="userId", validation_alias=AliasChoices("user_id", "userId"))
    items: list[CartItemResponse]
    created_at: datetime = Field(alias="createdAt", validation_alias=AliasChoices("created_at", "createdAt"))
    updated_at: datetime = Field(alias="updatedAt", validation_alias=AliasChoices("updated_at", "updatedAt"))


class CartItemRequest(BaseModel):
    product_id: UUID = Field(alias="productId", validation_alias=AliasChoices("product_id", "productId"))
    quantity: int = Field(ge=1, le=100)
    model_config = ConfigDict(populate_by_name=True)


class QuantityRequest(BaseModel):
    quantity: int = Field(ge=1, le=100)


class OrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    product_id: UUID = Field(alias="productId", validation_alias=AliasChoices("product_id", "productId"))
    sku: str
    name: str
    quantity: int
    unit_price_cents: int = Field(alias="unitPriceCents", validation_alias=AliasChoices("unit_price_cents", "unitPriceCents"))
    line_total_cents: int = Field(alias="lineTotalCents", validation_alias=AliasChoices("line_total_cents", "lineTotalCents"))


class ReservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    product_id: UUID = Field(alias="productId", validation_alias=AliasChoices("product_id", "productId"))
    quantity: int
    released_at: datetime | None = Field(alias="releasedAt", validation_alias=AliasChoices("released_at", "releasedAt"))
    created_at: datetime = Field(alias="createdAt", validation_alias=AliasChoices("created_at", "createdAt"))


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID = Field(alias="userId", validation_alias=AliasChoices("user_id", "userId"))
    state: OrderState
    total_cents: int = Field(alias="totalCents", validation_alias=AliasChoices("total_cents", "totalCents"))
    currency: str
    items: list[OrderItemResponse]
    reservations: list[ReservationResponse]
    cancelled_at: datetime | None = Field(alias="cancelledAt", validation_alias=AliasChoices("cancelled_at", "cancelledAt"))
    created_at: datetime = Field(alias="createdAt", validation_alias=AliasChoices("created_at", "createdAt"))
    updated_at: datetime = Field(alias="updatedAt", validation_alias=AliasChoices("updated_at", "updatedAt"))


class PaymentRequest(BaseModel):
    order_id: UUID = Field(alias="orderId", validation_alias=AliasChoices("order_id", "orderId"))
    simulate_failure: bool = Field(default=False, alias="simulateFailure")
    model_config = ConfigDict(populate_by_name=True)


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID = Field(alias="userId", validation_alias=AliasChoices("user_id", "userId"))
    order_id: UUID = Field(alias="orderId", validation_alias=AliasChoices("order_id", "orderId"))
    amount_cents: int = Field(alias="amountCents", validation_alias=AliasChoices("amount_cents", "amountCents"))
    currency: str
    state: PaymentState
    provider_ref: str = Field(alias="providerRef", validation_alias=AliasChoices("provider_ref", "providerRef"))
    failure_reason: str | None = Field(alias="failureReason", validation_alias=AliasChoices("failure_reason", "failureReason"))
    created_at: datetime = Field(alias="createdAt", validation_alias=AliasChoices("created_at", "createdAt"))
    updated_at: datetime = Field(alias="updatedAt", validation_alias=AliasChoices("updated_at", "updatedAt"))
