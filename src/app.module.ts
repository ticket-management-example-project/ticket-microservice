import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as joi from 'joi';
import { DatabaseModule } from 'src/shared/database/database.module';
import { KafkaModule } from 'src/shared/kafka/kafka.module';
import { SnowflakeModule } from 'src/shared/snowflake/snowflake.module';
import { HealthModule } from './health/health.module';
import { TicketModule } from './ticket/ticket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: joi.object({
        PORT: joi.number().required(),
        NATS_SERVERS: joi.string().required(),
        DATABASE_URL: joi.string().required(),
        SNOWFLAKE_MACHINE_ID: joi.number().optional(),
        KAFKA_BROKERS: joi.string().required(),
        KAFKA_GROUP_ID: joi.string().optional(),
      }),
    }),
    DatabaseModule,
    SnowflakeModule,
    KafkaModule,
    TicketModule,
    HealthModule,
  ],
})
export class AppModule {}
