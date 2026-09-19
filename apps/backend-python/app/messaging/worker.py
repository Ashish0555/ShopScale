import asyncio
import logging

from app.db.database import SessionLocal
from app.messaging.kafka import KafkaPublisher
from app.messaging.outbox import mark_published, unpublished

logger = logging.getLogger(__name__)


async def publish_outbox_forever(publisher: KafkaPublisher, stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            events = await asyncio.to_thread(_read_events)
            for event in events:
                stored = event.payload
                if {"id", "type", "aggregateType", "aggregateId", "payload", "occurredAt"}.issubset(stored):
                    await publisher.publish(stored["type"], stored)
                else:
                    await publisher.publish(event.event_type, {"id": str(event.id), "aggregateType": event.aggregate_type, "aggregateId": event.aggregate_id, "payload": stored})
                await asyncio.to_thread(_mark_event, event.id)
        except Exception:
            logger.exception("Outbox publication failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=5)
        except asyncio.TimeoutError:
            pass


def _read_events():
    with SessionLocal() as db:
        return list(unpublished(db))


def _mark_event(event_id) -> None:
    with SessionLocal() as db:
        mark_published(db, event_id)
