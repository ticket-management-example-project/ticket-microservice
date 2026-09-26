import {
  Controller,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AllExceptionsRpcFilter } from 'src/shared/filters/rpc-exception.filter';
import { CreateTicketCommand } from './application/create-ticket.command';
import { GetTicketByTokenQuery } from './application/get-ticket-by-token.query';
import { LinkTicketToAccountCommand } from './application/link-ticket-to-account.command';
import { GetTicketsByRequesterQuery } from './application/get-tickets-by-requester.query';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { GetTicketByTokenDto } from './dto/get-ticket-by-token.dto';
import { LinkTicketToAccountDto } from './dto/link-ticket-to-account.dto';
import { GetTicketsByRequesterDto } from './dto/get-tickets-by-requester.dto';

/** Replaces the placeholder scaffold (`ticket.controller.ts`/
 * `ticket.service.ts`, `find_one_ticket` stub) -- spec Boundaries &
 * Constraints: "se elimina el scaffold placeholder ... antes de escribir el
 * código real". */
@Controller()
@UseFilters(new AllExceptionsRpcFilter())
export class TicketController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /** `client-gateway`'s `POST /api/t/:tenantSlug/tickets`. */
  @MessagePattern({ cmd: 'create_ticket' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createTicket(@Payload() dto: CreateTicketDto) {
    return this.commandBus.execute(
      new CreateTicketCommand(
        dto.tenantSlug,
        dto.subject,
        dto.description,
        dto.correlationId,
      ),
    );
  }

  /** `client-gateway`'s `GET /api/tickets/track/:token`. */
  @MessagePattern({ cmd: 'get_ticket_by_token' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async getTicketByToken(@Payload() dto: GetTicketByTokenDto) {
    return this.queryBus.execute(new GetTicketByTokenQuery(dto.token));
  }

  /** Story 2.2: `client-gateway`'s `POST /api/tickets/track/:token/link-account`. */
  @MessagePattern({ cmd: 'link_ticket_to_account' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async linkTicketToAccount(@Payload() dto: LinkTicketToAccountDto) {
    return this.commandBus.execute(
      new LinkTicketToAccountCommand(
        dto.token,
        dto.requesterId,
        dto.correlationId,
      ),
    );
  }

  /** Story 2.2: `client-gateway`'s `GET /api/t/:tenantSlug/my-tickets`. */
  @MessagePattern({ cmd: 'get_tickets_by_requester' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async getTicketsByRequester(@Payload() dto: GetTicketsByRequesterDto) {
    return this.queryBus.execute(
      new GetTicketsByRequesterQuery(
        dto.tenantSlug,
        dto.requesterId,
        dto.correlationId,
      ),
    );
  }
}
