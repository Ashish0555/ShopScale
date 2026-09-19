from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.models import User
from app.cache.redis_store import cache
from app.core.config import settings
from app.core.errors import ApiError


def current_user(db: Annotated[Session, Depends(get_db)], authorization: Annotated[str | None, Header()] = None) -> User:
    return get_current_user(authorization, db)


def admin_user(user: Annotated[User, Depends(current_user)]) -> User:
    from app.core.security import require_admin
    return require_admin(user)


def rate_limit(prefix: str, limit: int):
    def dependency(request: Request) -> None:
        identity = request.client.host if request.client else "unknown"
        count = cache.increment_window(f"rate:{prefix}:{identity}", settings.rate_limit_window_seconds)
        if count > limit:
            raise ApiError(429, "Too many requests")

    return dependency


login_rate_limit = rate_limit("login", settings.rate_limit_login_max)
order_rate_limit = rate_limit("orders", settings.rate_limit_order_max)
payment_rate_limit = rate_limit("payments", settings.rate_limit_payment_max)
