# Testing

## Implemented

Backend health route tests cover:

- liveness response
- readiness response with injected dependency
- consistent 404 error response with request ID
- customer registration
- duplicate email rejection
- login success and invalid-password rejection
- protected user identity lookup
- refresh token rotation and replay rejection
- logout refresh-token revocation
- admin-only RBAC
- validation errors
- public product/category reads
- admin-only product/category writes
- product pagination, search, filtering, and sorting
- product validation and missing-category rejection
- authenticated cart reads
- cart add, update, remove, and clear flows
- cart rejection for missing products, inactive products, invalid quantities, and insufficient stock
- cart item IDOR protection
- order state machine rules
- order creation from cart
- user-scoped order history and details
- cancellation with inventory release
- empty-cart and insufficient-stock order failures
- concurrent stock `1` purchase attempts where successful purchases are less than or equal to stock and inventory is never negative
- first payment request
- repeated idempotent payment replay
- idempotency-key conflict with changed body
- failed payment replay
- payment IDOR protection
- concurrent duplicate payment requests

## Planned Coverage

Unit tests:

- authentication services
- inventory reservation logic
- rate limiting helpers

Integration tests:

- cart
- payment flow

Messaging tests:

- duplicate Kafka events do not create duplicate side effects
