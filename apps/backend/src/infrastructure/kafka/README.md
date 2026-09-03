# Kafka Infrastructure

The backend uses one Kafka topic and a transactional PostgreSQL outbox. Order and
payment transactions write typed domain events to `outbox_events`; the server
publishes unpublished rows on startup and every five seconds.

The consumer claims event IDs in `processed_events` before invoking handlers, so
redelivered messages are ignored safely. KafkaJS retries broker operations, while
consumer failures are rethrown so Kafka can redeliver the message.
