import base64
import hashlib
import hmac
import json
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError
from app.models import User


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=64)
    return f"scrypt:64:{_b64(salt)}:{_b64(derived)}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, key_length, salt, expected = stored_hash.split(":")
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(password.encode(), salt=_unb64(salt), n=16384, r=8, p=1, dklen=int(key_length))
        return hmac.compare_digest(actual, _unb64(expected))
    except (ValueError, TypeError):
        return False


def _sign(message: str) -> str:
    return _b64(hmac.new(settings.jwt_access_secret.encode(), message.encode(), hashlib.sha256).digest())


def create_access_token(user: User) -> str:
    now = int(time.time())
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64(json.dumps({"sub": str(user.id), "email": user.email, "role": user.role.value, "type": "access", "iat": now, "exp": now + 900, "jti": str(uuid.uuid4())}, separators=(",", ":")).encode())
    return f"{header}.{payload}.{_sign(f'{header}.{payload}')}"


def verify_access_token(token: str) -> dict[str, str]:
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
        expected = _sign(f"{encoded_header}.{encoded_payload}")
        if not hmac.compare_digest(encoded_signature, expected):
            raise ValueError
        header = json.loads(_unb64(encoded_header))
        payload = json.loads(_unb64(encoded_payload))
        if header != {"alg": "HS256", "typ": "JWT"} or payload["type"] != "access" or int(payload["exp"]) <= int(time.time()):
            raise ValueError
        return {"id": payload["sub"], "email": payload["email"], "role": payload["role"]}
    except (ValueError, KeyError, json.JSONDecodeError, UnicodeDecodeError):
        raise ApiError(401, "Invalid access token") from None


def new_refresh_token() -> tuple[str, str, datetime]:
    token = _b64(secrets.token_bytes(48))
    expires_at = datetime.now(UTC) + timedelta(days=30)
    token_hash = _b64(hmac.new(settings.jwt_refresh_secret.encode(), token.encode(), hashlib.sha256).digest())
    return token, token_hash, expires_at


def get_current_user(authorization: str | None, db: Session) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, "Bearer access token is required")
    token_user = verify_access_token(authorization.removeprefix("Bearer ").strip())
    user = db.scalar(select(User).where(User.id == token_user["id"], User.is_active.is_(True)))
    if not user:
        raise ApiError(401, "Invalid access token")
    return user


def require_admin(user: User) -> User:
    if user.role.value != "ADMIN":
        raise ApiError(403, "Insufficient permissions")
    return user
