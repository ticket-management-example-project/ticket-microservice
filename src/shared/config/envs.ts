import 'dotenv/config';
import * as joi from 'joi';

interface Envs {
  PORT: number;
  NATS_SERVERS: string[];
  DATABASE_URL: string;
  SNOWFLAKE_MACHINE_ID: number;
}

const envsSchema = joi
  .object({
    PORT: joi.number().required(),
    NATS_SERVERS: joi.array().items(joi.string().min(1)).min(1).required(),
    DATABASE_URL: joi.string().required(),
    // 1=organization-microservice, 2=infra-microservice, 3=tenant-microservice,
    // 4=ticket-microservice (see Story 2.1 Boundaries & Constraints).
    SNOWFLAKE_MACHINE_ID: joi.number().min(0).max(1023).default(4),
  })
  .unknown(true);

const { error, value } = envsSchema.validate({
  ...process.env,
  NATS_SERVERS: process.env.NATS_SERVERS?.split(','),
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
};
