/**
 * Domain event: the `TrackingTokenProvider` issued this Ticket's follow-up
 * token (Story 2.1, human decision 2026-09-24: the token is never persisted
 * in the Requester's browser -- the `closure-card` shows it exactly once).
 * Persisted as its own event on the Ticket's own event stream, not a
 * separate table (spec Boundaries & Constraints). `correlationId` = the
 * Ticket's own aggregate id, same as `TicketCreated`.
 */
export class TicketTrackingTokenIssuedEvent {
  constructor(
    public readonly aggregateId: string,
    public readonly token: string,
    public readonly occurredAt: string,
  ) {}
}
