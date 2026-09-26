import { Inject, Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  TRACKING_TOKEN_PROVIDER,
  TrackingTokenProvider,
} from '../domain/tracking-token.provider';
import { VerifyTrackingTokenQuery } from './verify-tracking-token.query';

export interface VerifyTrackingTokenResult {
  ticketId: string | null;
}

/**
 * Story 3.1: exposes `TrackingTokenProvider.verify()` over NATS (spec
 * Design Notes -- "Auth dual del ChatGateway": `client-gateway`'s
 * `ChatGateway.handleConnection()` uses this, via NATS, to authenticate a
 * Requester's socket by tracking token, mirroring the Clerk JWT branch for
 * Agents). Deliberately returns `{ ticketId: null }` rather than throwing --
 * "malformed/unknown/dead token" is not an error condition for a socket
 * handshake, just a signal to disconnect (I/O matrix), same neutral-failure
 * convention as `GetTicketByTokenHandler`.
 */
@Injectable()
@QueryHandler(VerifyTrackingTokenQuery)
export class VerifyTrackingTokenHandler
  implements IQueryHandler<VerifyTrackingTokenQuery, VerifyTrackingTokenResult>
{
  constructor(
    @Inject(TRACKING_TOKEN_PROVIDER)
    private readonly trackingTokenProvider: TrackingTokenProvider,
  ) {}

  async execute(
    query: VerifyTrackingTokenQuery,
  ): Promise<VerifyTrackingTokenResult> {
    const ticketId = await this.trackingTokenProvider.verify(query.token);
    return { ticketId };
  }
}
