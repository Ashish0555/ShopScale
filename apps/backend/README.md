# ShopScale Python backend

This is the FastAPI/SQLAlchemy backend for ShopScale.

## Run locally

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m alembic upgrade head
PYTHONPATH=. python -m uvicorn app.main:asgi_app --reload --port 4000
```

The API preserves the existing root health endpoints and `/api` routes. Socket.IO remains mounted through the ASGI application so the existing Next.js order page can continue to use `socket.io-client`.

## Tests

```bash
PYTHONPATH=. python -m pytest -q tests
```

## Docker

The root `docker-compose.yml` now builds this backend. Run:

```bash
docker compose up --build
```

## Migration map

| TypeScript | Python |
| --- | --- |
| Backend entrypoint and middleware | `app/main.py`, `app/core/` |
| Auth and authorization | `app/core/security.py`, `app/api/routes/http.py` |
| Products and categories | `app/api/routes/http.py`, `app/services.py`, `app/schemas.py` |
| Cart | `app/api/routes/http.py`, `app/services.py` |
| Orders and inventory | `app/api/routes/http.py`, `app/services.py`, `app/order_state.py` |
| Payments and idempotency | `app/api/routes/http.py`, `app/services.py` |
| Admin and audit | `app/api/routes/http.py`, `app/models.py` |
| Database schema | `app/models.py` and Alembic |
| Kafka outbox | `app/messaging/outbox.py`, `app/messaging/kafka.py` |
| Socket.IO realtime | `app/websocket/socketio.py` |
| Jest/Supertest | `tests/` with Pytest and FastAPI TestClient |

## Important compatibility details

- Access tokens use the existing HS256 payload shape and 15-minute TTL.
- Refresh tokens remain opaque HMAC-SHA256 tokens with rotation.
- Password hashes retain the Node `scrypt:64:salt:hash` format.
- Product/order/payment JSON uses the existing camelCase field names.
- Order creation updates inventory atomically with `available_quantity >= quantity` in the same transaction as the order, reservations, cart clearing, and outbox rows.
- Payment idempotency remains PostgreSQL-backed and keyed by user, request key, method, and path.
- Kafka startup failure does not prevent HTTP startup, matching the existing server behavior.
