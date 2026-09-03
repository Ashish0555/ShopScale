# Decisions

## Express For The Backend

Express keeps the scaffold small and readable while still allowing production-style boundaries through routers, services, middleware, and infrastructure adapters.

## Modular Monolith First

ShopScale starts as a modular monolith because the hardest early problems are transactional: inventory, orders, payments, idempotency, and outbox consistency. Splitting services too early would add distributed failure modes before the core rules are proven.

## Prisma And PostgreSQL

Prisma gives typed database access and migrations. PostgreSQL is used for relational consistency, transactions, constraints, and concurrency controls.

## Redis

Redis is reserved for data that benefits from fast shared state: product cache entries and distributed rate-limit counters.

## Kafka

Kafka is reserved for asynchronous domain events and consumer workflows. It is included in Compose from Step 1, but business events will be added with the outbox implementation to avoid dual-write bugs.

## Configuration

Configuration is read from environment variables and validated at startup. Secrets are required through env vars and are never committed as real values.

## Authentication And RBAC

Problem: private commerce workflows need server-controlled identity and authorization.

Decision: access tokens are short-lived JWTs signed with HS256, while refresh tokens are opaque random tokens stored only as HMAC hashes. User roles are persisted in PostgreSQL and reloaded by middleware on every protected request.

Alternatives: cookie sessions would simplify invalidation but make API clients less explicit; long-lived JWT-only auth would remove server storage but makes logout and token theft harder to contain.

Tradeoffs: JWT access tokens are fast to validate, but role changes only become authoritative because the middleware reloads the user from the database. Refresh token storage adds a table, but gives logout and rotation.

Reasoning: this keeps the portfolio API stateless for normal requests while still demonstrating secure invalidation and never trusting user IDs or roles supplied by the frontend.

## Password Hashing

Problem: stored passwords must remain resistant to offline attacks if the database is exposed.

Decision: passwords are hashed with Node.js `scrypt` using a per-password random salt. Plaintext passwords are accepted only in auth requests and are never logged or returned.

Alternatives: bcrypt or Argon2 are strong choices, but would add a native/runtime dependency at this phase.

Tradeoffs: `scrypt` from Node's standard library keeps setup simple and memory-hard, while Argon2id would be a stronger future upgrade for production hardening.

Reasoning: using a built-in memory-hard KDF is secure enough for this portfolio phase and avoids dependency churn before product/order work begins.

## Refresh Token Rotation

Problem: refresh tokens need replay protection and logout invalidation.

Decision: `/api/auth/refresh` creates a replacement refresh token and revokes the old token in one Prisma transaction. A conditional update ensures only one concurrent rotation can succeed.

Alternatives: reusable refresh tokens are simpler but weaker after theft; storing raw refresh tokens would simplify lookup but increases blast radius.

Tradeoffs: rotation requires persistent token state and client handling of the latest token. In return, old tokens become unusable immediately.

Reasoning: token rotation is explainable, testable, and matches the project's broader focus on correctness under concurrent requests.

## Product Catalog Search

Problem: product browsing needs useful filtering and search without introducing unnecessary infrastructure.

Decision: Step 3 uses PostgreSQL-backed filtering, sorting, pagination, and trigram indexes for product/category search.

Alternatives: Elasticsearch/OpenSearch would provide richer relevance and analytics, but adds infrastructure that is not needed for this portfolio phase.

Tradeoffs: PostgreSQL search is simpler and transactional with the catalog data, but ranking and typo handling are limited compared with a dedicated search engine.

Reasoning: the project already uses PostgreSQL as the source of record, and catalog search volume is not yet high enough to justify a second datastore.

## Cart Stock Checks

Problem: users should not add inactive, missing, invalid, or clearly unavailable items to a cart.

Decision: cart mutations validate product existence, active status, quantity bounds, and current inventory availability before saving cart items.

Alternatives: allowing any cart quantity and failing only at checkout is simpler, but creates a worse user experience and hides obvious stock problems.

Tradeoffs: cart stock checks are advisory because inventory can change before checkout. They reduce invalid carts but do not replace order-time transactional reservation.

Reasoning: Step 4 gives immediate feedback while Step 5 remains responsible for the hard concurrency guarantee that prevents overselling.

## Inventory Reservation

Problem: if stock is `1` and many users attempt checkout at the same time, only one order can reserve the item and inventory must never become negative.

Decision: order creation reserves each item with a PostgreSQL atomic conditional update inside a transaction: decrement available stock only where `available_quantity >= quantity`, increment reserved stock, and increment a version field.

Alternatives: row-level `SELECT ... FOR UPDATE` would also work but requires a read-lock-update sequence; optimistic locking with version checks is useful when clients edit records but still needs retry logic.

Tradeoffs: atomic updates are compact and avoid stale application checks, but multi-item carts reserve items sequentially inside one transaction and can experience contention on popular rows.

Reasoning: PostgreSQL enforces the predicate and update as one operation. If no row is updated, the service returns a conflict and the transaction rolls back, proving the key interview guarantee: successful purchases stay within available stock and inventory remains non-negative.

## Payment Idempotency

Problem: clients may retry payment requests after timeouts, double-clicks, or network errors, and retries must not create duplicate payments.

Decision: `POST /api/payments` requires an `Idempotency-Key`. The backend stores a hash of the request body and the completed response under a unique `(user_id, key, method, path)` constraint. Matching retries replay the stored response; mismatched bodies return `409`.

Alternatives: client-only duplicate prevention is not reliable; unique payment-per-order constraints prevent some duplicates but do not safely replay the exact previous response.

Tradeoffs: idempotency storage adds persistence and cleanup needs. In return, payment creation becomes safe to retry and concurrent duplicate requests converge on one stored result.

Reasoning: HTTP idempotency is a common production pattern and demonstrates the same correctness mindset as inventory reservation without adding an external payment provider.

## Next.js Build Mode

The frontend uses Next.js 16 for current security fixes. The build script uses `next build --webpack` because the default Turbopack build hit a local worker port-binding failure in this development environment. This can be revisited when Turbopack is stable on the deployment host.
