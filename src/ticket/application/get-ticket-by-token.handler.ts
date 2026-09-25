import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InvalidTrackingTokenException } from '../domain/exceptions/invalid-tracking-token.exception';
import { TicketProjection } from '../infrastructure/ticket.projection';
import { GetTicketByTokenQuery } from './get-ticket-by-token.query';

export interface GetTicketByTokenResult {
  id: string;
  tenantId: string;
  subject: string;
  description: string;
  status: string;
  /** Empty until Epic 3 (Chat) exists -- spec Acceptance Criteria: "ve el
   * estado del Ticket y un chat-thread vacío". Ticket-microservice does not
   * own Chat; this is just the contract shape client-gateway/console expect
   * today so the portal's chat-thread component has something to render. */
  chatThread: unknown[];
}

/**
 * `GET /api/tickets/track/:token`'s NATS handler. Resolves the token
 * directly against `TicketProjection.findByTrackingToken()` -- a SINGLE
 * lookup on every path, valid or not. Deliberately does NOT go through
 * `TrackingTokenProvider.verify()` + a second `findById()`: that two-lookup
 * shape made a valid token do one more DB round-trip than an invalid one, a
 * timing side-channel that leaks token validity and contradicts the I/O
 * matrix's "never distinguish 'no existe' de 'no autorizado'" invariant.
 * `TrackingTokenProvider.verify()` itself is unused here on purpose -- it
 * remains the port Story 2.2's `LinkTicketsToAccount` revalidates against.
 */
@Injectable()
@QueryHandler(GetTicketByTokenQuery)
export class GetTicketByTokenHandler
  implements IQueryHandler<GetTicketByTokenQuery, GetTicketByTokenResult>
{
  constructor(private readonly projection: TicketProjection) {}

  async execute(query: GetTicketByTokenQuery): Promise<GetTicketByTokenResult> {
    const ticket = await this.projection.findByTrackingToken(query.token);
    if (!ticket) {
      throw new InvalidTrackingTokenException();
    }

    return {
      id: ticket.id,
      tenantId: ticket.tenantId,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      chatThread: [],
    };
  }
}
