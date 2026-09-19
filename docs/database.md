# Database

PostgreSQL is the system of record because ShopScale needs transactions, row-level consistency, constraints, indexes, and relational reporting.

## Implemented

- SQLAlchemy configured for PostgreSQL
- Alembic migration creates the application schema
- `/ready` uses SQLAlchemy to execute `SELECT 1`
- `users` table with unique email, hashed password, active flag, and `CUSTOMER`/`ADMIN` role
- `refresh_tokens` table storing hashed opaque refresh tokens with expiry, revocation, and replacement tracking
- `categories` table with unique slug, active flag, timestamps, and indexes
- `products` table with unique SKU/slug, price in cents, active flag, optional category relationship, and indexes for catalog queries
- `inventory` table keyed by product with available/reserved quantities and version
- `carts` table keyed by user
- `cart_items` table with unique cart/product pairs and positive quantities
- `orders` table with user, state, totals, cancellation timestamp, and query indexes
- `order_items` table snapshotting purchased SKU/name/price at order time
- `inventory_reservations` table tracking reserved quantities and release status
- `payments` table with simulated provider references, user/order ownership, amount, currency, and state
- `idempotency_keys` table storing request hashes and replayable response payloads

Business schema migrations are added as each module is implemented so schema changes stay tied to functional code.

## Planned Tables

- `notifications`
- `audit_logs`
- `outbox_events`

Money will be stored as integer minor units such as cents, not floating-point values.
