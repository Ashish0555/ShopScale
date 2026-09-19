import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.db.database import SessionLocal
from app.models import ProcessedEvent

logger = logging.getLogger(__name__)


class DomainEventConsumer:
    def __init__(self) -> None:
        self.consumer = AIOKafkaConsumer(settings.kafka_topic_domain_events, bootstrap_servers=settings.kafka_broker_list, group_id=settings.kafka_group_id, client_id=f"{settings.kafka_client_id}-consumer")

    async def run(self, stop_event: asyncio.Event) -> None:
        await self.consumer.start()
        try:
            async for message in self.consumer:
                if stop_event.is_set():
                    break
                await self._process(message.value)
        finally:
            await self.consumer.stop()

    async def _process(self, raw: bytes) -> None:
        event = json.loads(raw)
        event_id = str(event.get("id", ""))
        if not event_id:
            return
        try:
            with SessionLocal() as db:
                db.add(ProcessedEvent(event_id=event_id, event_type=str(event.get("type", "unknown"))))
                db.commit()
        except IntegrityError:
            with SessionLocal() as db:
                db.rollback()
            logger.debug("Skipped duplicate event %s", event_id)
