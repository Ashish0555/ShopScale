# Inventory Module

Step 4 added the inventory table and read-side repository needed for cart stock checks.

Step 5 added order-time reservation and concurrency-safe stock updates. Reservations decrement `available_quantity`, increment `reserved_quantity`, and increment `version` inside the same PostgreSQL transaction that creates the order.
