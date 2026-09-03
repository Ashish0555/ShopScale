# Architecture

ShopScale starts as a modular monolith. The goal is to keep transactions and business rules simple while still giving each domain a clear boundary.

```mermaid
flowchart LR
  Client[Next.js frontend] --> API[Express REST API]
  API --> Modules[Domain modules]
  Modules --> Prisma[Prisma client]
  Prisma --> Postgres[(PostgreSQL)]
  API --> Redis[(Redis)]
  Modules --> Outbox[(Outbox events)]
  Outbox --> Kafka[(Kafka)]
  API --> Socket[Socket.IO]
```

## Implemented

- Monorepo with `apps/backend` and `apps/frontend`
- Backend module folders for auth, users, products, cart, orders, inventory, payments, notifications, admin, audit, and health
- Infrastructure folders for database, Redis, Kafka, WebSockets, and logging
- Express app factory with middleware, liveness, readiness, and centralized error handling
- Prisma-backed PostgreSQL readiness check
- Next.js shell with core routes
- Docker Compose environment with PostgreSQL, Redis, Kafka, Zookeeper, backend, and frontend
- Auth and user modules with thin HTTP routes, service-owned business rules, Prisma repository persistence, JWT access tokens, refresh token rotation, and RBAC middleware

## Planned Module Flow

Domain logic should live in module services, not route handlers. Route handlers will parse HTTP input, call services, and translate service results into API responses.

The order flow will use PostgreSQL transactions for inventory correctness. Kafka publishing should be driven through an outbox table so database writes and event creation are committed together.
