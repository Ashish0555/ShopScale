import { Kafka, logLevel, type Consumer, type Producer } from "kafkajs";
import { env } from "../../common/config/env.js";
import { logger } from "../logging/logger.js";
import type { DomainEvent, DomainEventPublisher } from "../events/domain-events.js";
import type { DomainEventConsumer } from "../events/event-consumer.js";

export class KafkaEventPublisher implements DomainEventPublisher {
  constructor(
    private readonly producer: Producer,
    private readonly topic: string
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.producer.send({
      topic: this.topic,
      messages: [
        {
          key: event.aggregateId,
          value: JSON.stringify(event),
          headers: {
            eventType: event.type,
            eventId: event.id
          }
        }
      ]
    });
  }
}

export class KafkaRuntime {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;

  constructor() {
    this.kafka = new Kafka({
      clientId: env.KAFKA_CLIENT_ID,
      brokers: env.kafkaBrokers,
      logLevel: logLevel.NOTHING,
      retry: { retries: 5, initialRetryTime: 300, maxRetryTime: 3000 }
    });
  }

  async start(consumer: DomainEventConsumer): Promise<KafkaEventPublisher> {
    const admin = this.kafka.admin();
    await admin.connect();
    await admin.createTopics({
      topics: [{ topic: env.KAFKA_TOPIC_DOMAIN_EVENTS, numPartitions: 1, replicationFactor: 1 }],
      waitForLeaders: true
    });
    await admin.disconnect();

    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: env.KAFKA_GROUP_ID });
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: env.KAFKA_TOPIC_DOMAIN_EVENTS, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) {
          return;
        }

        try {
          const event = JSON.parse(message.value.toString("utf8")) as DomainEvent;
          await consumer.consume(event);
        } catch (error: unknown) {
          logger.error({ err: error }, "Kafka event consumption failed; message will be retried");
          throw error;
        }
      }
    });

    logger.info({ topic: env.KAFKA_TOPIC_DOMAIN_EVENTS }, "Kafka producer and consumer started");
    return new KafkaEventPublisher(this.producer, env.KAFKA_TOPIC_DOMAIN_EVENTS);
  }

  async stop(): Promise<void> {
    await this.consumer?.disconnect();
    await this.producer?.disconnect();
  }
}
