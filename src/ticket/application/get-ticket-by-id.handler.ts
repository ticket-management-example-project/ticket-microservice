import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TicketProjection } from '../infrastructure/ticket.projection';
import { GetTicketByIdQuery } from './get-ticket-by-id.query';

export interface GetTicketByIdResult {
  id: string;
  tenantId: string;
  subject: string;
  description: string;
  status: string;
}

/**
 * Story 3.1: resolves a Ticket by its own aggregate id -- unlike
 * `GetTicketByTokenHandler` (a Requester-facing endpoint that always throws
 * a neutral `TICKET_NOT_FOUND` for any failure mode), this is a
 * service-to-service lookup. Returns `null` for "no such id", same
 * convention as `find_tenant_by_slug` (tenant-microservice) -- the CALLER
 * decides how to surface that (`chat-microservice`'s `TicketClient` turns it
 * into its own typed `TicketNotFoundException`; `client-gateway`'s agent-
 * side ticket detail endpoint turns it into a 404 directly). Deliberately
 * omits `trackingToken`/`requesterId` -- callers of this query (chat,
 * agent-console) have no business need for either, unlike the Requester's
 * own token-scoped lookup.
 */
@Injectable()
@QueryHandler(GetTicketByIdQuery)
export class GetTicketByIdHandler
  implements IQueryHandler<GetTicketByIdQuery, GetTicketByIdResult | null>
{
  constructor(private readonly projection: TicketProjection) {}

  async execute(
    query: GetTicketByIdQuery,
  ): Promise<GetTicketByIdResult | null> {
    const ticket = await this.projection.findById(query.id);
    if (!ticket) {
      return null;
    }

    return {
      id: ticket.id,
      tenantId: ticket.tenantId,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
    };
  }
}
