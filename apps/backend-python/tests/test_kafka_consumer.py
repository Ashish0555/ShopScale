import asyncio

from app.messaging.consumer import DomainEventConsumer


class FakeDatabase:
    def __init__(self):
        self.events = set()
        self.pending = None

    def add(self, event):
        self.pending = event

    def commit(self):
        event_id = self.pending.event_id
        if event_id in self.events:
            from sqlalchemy.exc import IntegrityError
            raise IntegrityError("duplicate", {}, None)
        self.events.add(event_id)

    def rollback(self):
        self.pending = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


def test_consumer_claims_duplicate_event_once(monkeypatch):
    database = FakeDatabase()
    monkeypatch.setattr("app.messaging.consumer.SessionLocal", lambda: database)

    async def exercise():
        consumer = DomainEventConsumer()
        raw = b'{"id":"event-1","type":"OrderCreated"}'
        await consumer._process(raw)
        await consumer._process(raw)

    asyncio.run(exercise())
    assert database.events == {"event-1"}
