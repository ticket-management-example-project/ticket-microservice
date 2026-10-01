import { Controller, Get } from '@nestjs/common';
import { Transport } from '@nestjs/microservices';
import {
  HealthCheck,
  HealthCheckService,
  MicroserviceHealthIndicator,
} from '@nestjs/terminus';
import { envs } from 'src/shared/config/envs';
import { KafkaConsumerHealthIndicator } from './kafka-consumer.health-indicator';
import { PostgresHealthIndicator } from './postgres.health-indicator';

/**
 * Real `/health`, never a fixed 200 (see Boundaries & Constraints and epic
 * context "elimina la deuda técnica existente" -- the old scaffold had none
 * at all). Reports `unhealthy` with the specific failing check when
 * Postgres, NATS, or the Kafka consumer (Story 5.1's `TicketTriagedConsumer`)
 * are unreachable. Runs on host (`npm run start:dev`), not containerized in
 * `docker-compose.dev.yml` -- same criterion as
 * `tenant-microservice`/`organization-microservice`.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealthIndicator,
    private readonly kafka: KafkaConsumerHealthIndicator,
    private readonly microservice: MicroserviceHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.postgres.isHealthy('postgres'),
      () => this.kafka.isHealthy('kafka'),
      () =>
        this.microservice.pingCheck('nats', {
          transport: Transport.NATS,
          options: { servers: envs.natsServers },
        }),
    ]);
  }
}
