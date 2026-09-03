# API

The backend exposes REST endpoints under `/api` and keeps liveness/readiness available at root for infrastructure probes.

## Implemented

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness probe |
| GET | `/ready` | Readiness probe with PostgreSQL check |
| GET | `/api/health` | API-prefixed liveness probe |
| GET | `/api/ready` | API-prefixed readiness probe |
| POST | `/api/auth/register` | Register a customer account and return tokens |
| POST | `/api/auth/login` | Authenticate with email/password and return tokens |
| POST | `/api/auth/refresh` | Rotate a refresh token and return a new token pair |
| POST | `/api/auth/logout` | Revoke a refresh token |
| GET | `/api/users/me` | Return the authenticated user's profile |
| GET | `/api/users` | Admin-only user list for RBAC verification |
| GET | `/api/categories` | List categories with pagination/search/active filtering |
| GET | `/api/categories/:id` | Get one category |
| POST | `/api/categories` | Admin-only category creation |
| PATCH | `/api/categories/:id` | Admin-only category update |
| DELETE | `/api/categories/:id` | Admin-only category delete |
| GET | `/api/products` | List products with pagination/search/filtering/sorting |
| GET | `/api/products/:id` | Get one product |
| POST | `/api/products` | Admin-only product creation |
| PATCH | `/api/products/:id` | Admin-only product update |
| DELETE | `/api/products/:id` | Admin-only product delete |
| GET | `/api/cart` | Return the authenticated user's cart |
| POST | `/api/cart/items` | Add or replace a cart item quantity |
| PATCH | `/api/cart/items/:itemId` | Update a cart item quantity |
| DELETE | `/api/cart/items/:itemId` | Remove one cart item |
| DELETE | `/api/cart` | Clear the authenticated user's cart |
| POST | `/api/orders` | Create an order from the authenticated user's cart |
| GET | `/api/orders` | List the authenticated user's order history |
| GET | `/api/orders/:id` | Get one authenticated-user order |
| POST | `/api/orders/:id/cancel` | Cancel an order and release reservations when allowed |
| POST | `/api/payments` | Create a simulated payment with required `Idempotency-Key` |
| GET | `/api/payments/:id` | Get one authenticated-user payment |
| GET | `/api/admin/orders` | Admin order list |
| PATCH | `/api/admin/orders/:id/status` | Admin order state transition with audit record |
| GET | `/api/admin/inventory` | Admin inventory visibility |
| GET | `/api/admin/audit` | Admin audit log list |
| GET | `/metrics` | Basic application counters |

Error responses follow this shape:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Route GET /missing was not found",
    "requestId": "..."
  }
}
```

## Auth Response

```json
{
  "user": {
    "id": "...",
    "email": "buyer@example.com",
    "name": "Buyer",
    "role": "CUSTOMER",
    "createdAt": "..."
  },
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

Clients send access tokens with:

```http
Authorization: Bearer <accessToken>
```

Refresh tokens are opaque random values. The backend stores only HMAC hashes of refresh tokens and revokes the old token whenever `/api/auth/refresh` succeeds.

## Payment Idempotency

`POST /api/payments` requires:

```http
Idempotency-Key: <client-generated-key>
```

The first matching request stores its response. Repeated requests with the same authenticated user, method, path, key, and body replay the stored response with `Idempotency-Replayed: true`. Reusing the same key with a different request body returns `409`.

