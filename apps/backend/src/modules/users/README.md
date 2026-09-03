# Users Module

Implemented in Step 2:

- Prisma-backed user persistence
- `CUSTOMER` and `ADMIN` roles
- authenticated `GET /api/users/me`
- admin-only `GET /api/users`

Product, cart, order, and admin workflows will reuse the auth middleware rather than accepting caller-supplied user IDs or roles.
