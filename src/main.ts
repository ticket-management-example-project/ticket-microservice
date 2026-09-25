import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { envs } from 'src/shared/config/envs';
import { AppModule } from './app.module';

/**
 * Hybrid app (HTTP for `/health` + NATS microservice for `create_ticket`/
 * `get_ticket_by_token`), same shape as `tenant-microservice`'s `main.ts` --
 * replaces the scaffold's NATS-only `createMicroservice()` (which had no
 * `/health` at all, part of the "deuda técnica existente" this story
 * eliminates -- see epic context).
 */
async function bootstrap() {
  const logger = new Logger('Main-Ticket');

  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.NATS,
    options: {
      servers: envs.natsServers,
    },
  });

  await app.startAllMicroservices();
  await app.listen(envs.port);

  logger.log(
    `Ticket microservice: HTTP (/health) on port ${envs.port}, NATS RPC connected to ${envs.natsServers}`,
  );
}

bootstrap();
