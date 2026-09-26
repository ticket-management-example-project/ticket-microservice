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
import { GetTicketByIdQuery } from './application/get-ticket-by-id.query';
import { VerifyTrackingTokenQuery } from './application/verify-tracking-token.query';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { GetTicketByTokenDto } from './dto/get-ticket-by-token.dto';
import { LinkTicketToAccountDto } from './dto/link-ticket-to-account.dto';
import { GetTicketsByRequesterDto } from './dto/get-tickets-by-requester.dto';
import { GetTicketByIdDto } from './dto/get-ticket-by-id.dto';
import { VerifyTrackingTokenDto } from './dto/verify-tracking-token.dto';

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
        dto.contactEmail,
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

  /** Story 3.1: service-to-service lookup by aggregate id --
   * `chat-microservice`'s `TicketClient` (existence + `tenantId` check
   * before a `ChatThread` may exist) and `client-gateway`'s agent-side
   * ticket detail endpoint. Returns `null` (not a thrown exception) for "no
   * such id" -- same convention as `find_tenant_by_slug`, the caller decides
   * how to surface that. */
  @MessagePattern({ cmd: 'get_ticket_by_id' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async getTicketById(@Payload() dto: GetTicketByIdDto) {
    return this.queryBus.execute(
      new GetTicketByIdQuery(dto.id, dto.correlationId),
    );
  }

  /** Story 3.1: exposes `TrackingTokenProvider.verify()` over NATS for
   * `client-gateway`'s `ChatGateway` (Requester branch of the socket's dual
   * auth, spec Design Notes). */
  @MessagePattern({ cmd: 'verify_tracking_token' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async verifyTrackingToken(@Payload() dto: VerifyTrackingTokenDto) {
    return this.queryBus.execute(new VerifyTrackingTokenQuery(dto.token));
  }
}
