import asyncio
import json

from app.cache.store import MemoryCache
from app.services import add_outbox, hash_payment_body
from app.messaging.kafka import KafkaPublisher


class Collector:
    def __init__(self):
        self.items = []

    def add(self, item):
        self.items.append(item)


def test_payment_hash_is_stable_for_reordered_json():
    assert hash_payment_body({"order_id": "1", "simulate_failure": False}) == hash_payment_body({"simulate_failure": False, "order_id": "1"})


def test_outbox_record_is_added_to_the_same_session():
    db = Collector()
    add_outbox(db, "OrderCreated", "order", "order-1", {"orderId": "order-1"})
    assert len(db.items) == 1
    assert db.items[0].event_type == "OrderCreated"
    assert db.items[0].payload["type"] == "OrderCreated"
    assert db.items[0].payload["payload"] == {"orderId": "order-1"}


def test_memory_cache_expiry_window_counter():
    async def exercise():
        cache = MemoryCache()
        await cache.set("product:1", "value", ttl=60)
        assert await cache.get("product:1") == "value"
        assert await cache.incr_window("rate:1", 60) == 1
        assert await cache.incr_window("rate:1", 60) == 2

    asyncio.run(exercise())


def test_kafka_publisher_preserves_domain_event_envelope():
    class Producer:
        def __init__(self):
            self.messages = []

        async def send_and_wait(self, _topic, value, **kwargs):
            self.messages.append(json.loads(value))
            self.options = kwargs

    async def exercise():
        publisher = KafkaPublisher()
        producer = Producer()
        publisher._producer = producer
        await publisher.publish("OrderCreated", {"id": "event-1", "aggregateType": "order", "aggregateId": "order-1", "payload": {"orderId": "order-1"}})
        assert producer.messages[0]["id"] == "event-1"
        assert producer.messages[0]["type"] == "OrderCreated"
        assert producer.messages[0]["payload"] == {"orderId": "order-1"}
        assert producer.options["key"] == b"order-1"
        assert producer.options["headers"] == [("eventType", b"OrderCreated"), ("eventId", b"event-1")]

    asyncio.run(exercise())
