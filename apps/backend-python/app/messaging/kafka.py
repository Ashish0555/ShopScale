import json
import logging
from datetime import UTC, datetime

from aiokafka import AIOKafkaProducer
from aiokafka.admin import AIOKafkaAdminClient, NewTopic

from app.core.config import settings

logger = logging.getLogger(__name__)


class KafkaPublisher:
    def __init__(self) -> None:
        self._producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        admin = AIOKafkaAdminClient(bootstrap_servers=settings.kafka_broker_list, client_id=settings.kafka_client_id)
        await admin.start()
        try:
            await admin.create_topics([NewTopic(name=settings.kafka_topic_domain_events, num_partitions=1, replication_factor=1)])
        except Exception as error:
            if "TopicAlreadyExists" not in str(error):
                raise
        finally:
            await admin.close()
        self._producer = AIOKafkaProducer(bootstrap_servers=settings.kafka_broker_list, client_id=settings.kafka_client_id)
        await self._producer.start()

    async def stop(self) -> None:
        if self._producer:
            await self._producer.stop()
            self._producer = None

    async def publish(self, event_type: str, payload: dict) -> None:
        if not self._producer:
            return
        event = {
            "id": payload["id"],
            "type": event_type,
            "aggregateType": payload["aggregateType"],
            "aggregateId": payload["aggregateId"],
            "payload": payload["payload"],
            "occurredAt": datetime.now(UTC).isoformat(),
        }
        await self._producer.send_and_wait(
            settings.kafka_topic_domain_events,
            json.dumps(event).encode(),
            key=event["aggregateId"].encode(),
            headers=[("eventType", event_type.encode()), ("eventId", event["id"].encode())],
        )
