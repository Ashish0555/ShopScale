# Orders Module

Implemented in Step 5:

- create order from authenticated user's cart
- user-scoped order history
- user-scoped order details
- cancellation for cancellable orders
- order state machine
- inventory reservations
- reservation release on cancellation
- atomic stock decrement inside PostgreSQL transactions

The critical stock update is an atomic conditional database update, not a separate application-level `if stock > quantity` check. Cart stock checks improve feedback, but order creation is the oversell-prevention boundary.
