import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { KafkaConsumerHealthIndicator } from './kafka-consumer.health-indicator';
import { PostgresHealthIndicator } from './postgres.health-indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PostgresHealthIndicator, KafkaConsumerHealthIndicator],
})
export class HealthModule {}
