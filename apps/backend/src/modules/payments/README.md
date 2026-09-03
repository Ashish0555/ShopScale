# Payments Module

Implemented in Step 6:

- simulated payment creation
- `PENDING`, `SUCCESS`, `FAILED`, and `REFUNDED` payment states
- required `Idempotency-Key` for payment creation
- replay of repeated matching requests
- conflict response for reused keys with different request bodies
- user-scoped payment reads
- duplicate/concurrent request tests

Only successful application-level payment attempts are stored in idempotency records. Validation/auth errors are not replayed.
