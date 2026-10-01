import { Inject, Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { DOMAIN_EVENT_CONSUMER } from 'src/shared/config/services';
import { DomainEventConsumer } from 'src/shared/kafka/domain-event-consumer.port';

/**
 * Real Kafka connectivity check for `/health` (never a fixed 200, AD-14),
 * added alongside this service's first Kafka consumer
 * (`TicketTriagedConsumer`, Story 5.1). Depends on the `DomainEventConsumer`
 * port, never on `kafkajs` directly. Calco of `infra-microservice`'s
 * indicator.
 */
@Injectable()
export class KafkaConsumerHealthIndicator extends HealthIndicator {
  constructor(
    @Inject(DOMAIN_EVENT_CONSUMER)
    private readonly consumer: DomainEventConsumer,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    if (!this.consumer.isConnected()) {
      throw new HealthCheckError(
        'Kafka consumer health check failed',
        this.getStatus(key, false, { message: 'consumer not connected' }),
      );
    }
    return this.getStatus(key, true);
  }
}
