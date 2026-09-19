import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://shopscale:shopscale@localhost:5432/shopscale")
os.environ.setdefault("JWT_ACCESS_SECRET", "test-access-secret-that-is-long-enough")
os.environ.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret-that-is-long-enough")

from app.core.security import hash_password, verify_password


def test_scrypt_password_round_trip() -> None:
    stored = hash_password("correct horse battery staple")
    assert stored.startswith("scrypt:64:")
    assert verify_password("correct horse battery staple", stored)
    assert not verify_password("wrong password", stored)
