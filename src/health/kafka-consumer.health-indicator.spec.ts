import { HealthCheckError } from '@nestjs/terminus';
import { KafkaConsumerHealthIndicator } from './kafka-consumer.health-indicator';

describe('KafkaConsumerHealthIndicator', () => {
  it('reports healthy when the consumer is connected', async () => {
    const consumer = { isConnected: jest.fn().mockReturnValue(true) };
    const indicator = new KafkaConsumerHealthIndicator(consumer as any);

    const result = await indicator.isHealthy('kafka');

    expect(result.kafka.status).toBe('up');
  });

  it('throws HealthCheckError when the consumer is disconnected', async () => {
    const consumer = { isConnected: jest.fn().mockReturnValue(false) };
    const indicator = new KafkaConsumerHealthIndicator(consumer as any);

    await expect(indicator.isHealthy('kafka')).rejects.toThrow(
      HealthCheckError,
    );
  });
});
