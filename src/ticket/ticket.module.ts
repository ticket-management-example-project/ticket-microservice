import { Module } from '@nestjs/common';
import { NatsModule } from 'src/shared/transports/nats.module';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';

@Module({
  controllers: [TicketController],
  providers: [TicketService],
  imports: [NatsModule],
})
export class TicketModule {}
