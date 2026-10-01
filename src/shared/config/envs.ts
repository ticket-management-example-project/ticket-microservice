import 'dotenv/config';
import * as joi from 'joi';

interface Envs {
  PORT: number;
  NATS_SERVERS: string[];
  DATABASE_URL: string;
  SNOWFLAKE_MACHINE_ID: number;
  KAFKA_BROKERS: string[];
  KAFKA_GROUP_ID: string;
}

const envsSchema = joi
  .object({
    PORT: joi.number().required(),
    NATS_SERVERS: joi.array().items(joi.string().min(1)).min(1).required(),
    DATABASE_URL: joi.string().required(),
    // 1=organization-microservice, 2=infra-microservice, 3=tenant-microservice,
    // 4=ticket-microservice (see Story 2.1 Boundaries & Constraints).
    SNOWFLAKE_MACHINE_ID: joi.number().min(0).max(1023).default(4),
    // Story 5.1: this service's first Kafka consumer (`TicketTriagedConsumer`,
    // consuming `agent-microservice`'s `tm.triagedecision.events`).
    KAFKA_BROKERS: joi.array().items(joi.string()).required(),
    KAFKA_GROUP_ID: joi.string().default('ticket-microservice'),
  })
  .unknown(true);

const { error, value } = envsSchema.validate({
  ...process.env,
  NATS_SERVERS: process.env.NATS_SERVERS?.split(','),
  KAFKA_BROKERS: process.env.KAFKA_BROKERS?.split(','),
});

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const envVars: Envs = value;

export const envs = {
  port: envVars.PORT,
  natsServers: envVars.NATS_SERVERS,
  databaseUrl: envVars.DATABASE_URL,
  snowflakeMachineId: envVars.SNOWFLAKE_MACHINE_ID,
  kafkaBrokers: envVars.KAFKA_BROKERS,
  kafkaGroupId: envVars.KAFKA_GROUP_ID,
};
