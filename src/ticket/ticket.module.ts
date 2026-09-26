import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { NatsModule } from 'src/shared/transports/nats.module';
import { CreateTicketHandler } from './application/create-ticket.handler';
import { GetTicketByTokenHandler } from './application/get-ticket-by-token.handler';
import { LinkTicketToAccountHandler } from './application/link-ticket-to-account.handler';
import { GetTicketsByRequesterHandler } from './application/get-tickets-by-requester.handler';
import { EventsRepository } from './infrastructure/events.repository';
import { TicketProjection } from './infrastructure/ticket.projection';
import { CryptoTrackingTokenProvider } from './infrastructure/tracking-token.provider';
import { TenantClient } from './infrastructure/tenant.client';
import { TRACKING_TOKEN_PROVIDER } from './domain/tracking-token.provider';
import { TicketController } from './ticket.controller';

@Module({
  imports: [CqrsModule, NatsModule],
  controllers: [TicketController],
  providers: [
    CreateTicketHandler,
    GetTicketByTokenHandler,
    LinkTicketToAccountHandler,
    GetTicketsByRequesterHandler,
    EventsRepository,
    TicketProjection,
    TenantClient,
    { provide: TRACKING_TOKEN_PROVIDER, useClass: CryptoTrackingTokenProvider },
  ],
})
export class TicketModule {}
