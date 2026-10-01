import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckError,
  MicroserviceHealthIndicator,
  TerminusModule,
} from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { KafkaConsumerHealthIndicator } from './kafka-consumer.health-indicator';
import { PostgresHealthIndicator } from './postgres.health-indicator';

/**
 * I/O Matrix: "Dependencia caída" -> /health reports `unhealthy` with the
 * specific check failing, never a fixed 200. Indicators are mocked here so
 * this stays a fast unit test (no real Postgres/NATS/Kafka needed).
 */
describe('HealthController', () => {
  const buildController = async (postgresHealthy: boolean) => {
    const postgres = {
      isHealthy: postgresHealthy
        ? jest.fn().mockResolvedValue({ postgres: { status: 'up' } })
        : jest.fn().mockRejectedValue(
            new HealthCheckError('Postgres health check failed', {
              postgres: { status: 'down', message: 'connection refused' },
            }),
          ),
    };
    const kafka = {
      isHealthy: jest.fn().mockResolvedValue({ kafka: { status: 'up' } }),
    };
    const microservice = {
      pingCheck: jest.fn().mockResolvedValue({ nats: { status: 'up' } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: PostgresHealthIndicator, useValue: postgres },
        { provide: KafkaConsumerHealthIndicator, useValue: kafka },
        { provide: MicroserviceHealthIndicator, useValue: microservice },
      ],
    }).compile();

    return module.get(HealthController);
  };

  it('reports "ok" when Postgres, Kafka, and NATS are all reachable', async () => {
    const controller = await buildController(true);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.info).toMatchObject({
      postgres: { status: 'up' },
      kafka: { status: 'up' },
      nats: { status: 'up' },
    });
  });

  it('reports unhealthy with postgres marked "down", not a fixed 200, when Postgres is unreachable', async () => {
    const controller = await buildController(false);

    try {
      await controller.check();
      throw new Error('expected check() to reject');
    } catch (error) {
      const response = (
        error as { getResponse: () => Record<string, unknown> }
      ).getResponse();
      expect(response.status).toBe('error');
      expect(response.error).toEqual({
        postgres: { status: 'down', message: 'connection refused' },
      });
    }
  });
});
