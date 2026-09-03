# Concurrency

The critical inventory case is stock equal to `1` with many concurrent buyers. Only one order may succeed, and inventory must never go negative.

## Implemented Approach

Order creation reserves inventory inside a PostgreSQL transaction. Each cart item uses an atomic conditional update:

```sql
UPDATE inventory
SET available_quantity = available_quantity - $1,
    version = version + 1
WHERE product_id = $2
  AND available_quantity >= $1;
```

If the affected row count is zero, the order fails with HTTP `409`. Because the decrement and `available_quantity >= quantity` predicate live in the same SQL update, concurrent requests cannot all pass a stale application-level stock check.

For multi-item carts, all inventory updates, order rows, reservation rows, and cart clearing happen in one transaction. If any product cannot be reserved, PostgreSQL rolls back the earlier reservation updates from that order attempt.

The concurrency test creates stock `1`, launches 100 order attempts, and asserts:

- successful purchases are less than or equal to `1`
- inventory is never negative

Cart-time stock checks still exist for user feedback, but they are advisory. Order creation is the source of truth for oversell prevention.
