import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { TrackingTokenProvider } from '../domain/tracking-token.provider';
import { TicketProjection } from './ticket.projection';

const TOKEN_BYTES = 16; // 128 bits, per spec Boundaries & Constraints.

/**
 * `TrackingTokenProvider` implementation (spec Design Notes /
 * `tracking-token.provider.ts`): `crypto.randomBytes(16).toString('hex')` --
 * opaque, ≥128 bits of entropy, no expiration by default. `issue()` never
 * touches the database itself; `CreateTicketHandler` applies+persists the
 * resulting `TicketTrackingTokenIssued` event on the Ticket aggregate (spec:
 * "persistido como evento propio del agregado Ticket, no tabla aparte").
 * `verify()` resolves the token against `TicketProjection`, the only place
 * the token->ticket association is queryable.
 */
@Injectable()
export class CryptoTrackingTokenProvider implements TrackingTokenProvider {
  constructor(private readonly projection: TicketProjection) {}

  issue(_ticketAggregateId: string): string {
    return randomBytes(TOKEN_BYTES).toString('hex');
  }

  async verify(token: string): Promise<string | null> {
    const ticket = await this.projection.findByTrackingToken(token);
    return ticket ? ticket.id : null;
  }
}
