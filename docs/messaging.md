# Messaging

ShopScale keeps messaging inside the modular monolith. Order and payment database
transactions write domain events to the PostgreSQL outbox, and the backend server
publishes those rows to the single `shopscale.domain.events` Kafka topic.

Supported events are `OrderCreated`, `PaymentSucceeded`, `PaymentFailed`,
`InventoryReserved`, `InventoryReleased`, and `OrderCancelled`. A consumer stores
claimed event IDs in `processed_events` before handling them, making duplicate
delivery safe. KafkaJS broker retries and consumer error propagation provide basic
retry behavior without introducing separate services or workflow orchestration.

Kafka is included for asynchronous domain events. Consumers must tolerate duplicate messages because Kafka does not make application side effects exactly-once by default.

## Planned Events

- `OrderCreated`
- `PaymentSucceeded`
- `PaymentFailed`
- `InventoryReserved`
- `InventoryReleased`
- `OrderCancelled`
- `NotificationRequested`

## Outbox Direction

Where database state changes must produce events, ShopScale should write domain state and an `outbox_events` row in the same PostgreSQL transaction. A publisher process can then publish to Kafka and mark outbox records as published.

This avoids the obvious dual-write bug where a database transaction commits but Kafka publish fails, or Kafka publish succeeds while the database transaction rolls back.
