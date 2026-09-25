export const TRACKING_TOKEN_PROVIDER = 'TRACKING_TOKEN_PROVIDER';

/**
 * Port owned by `ticket-microservice` (spec Design Notes / Technical
 * Decisions). `issue()` is a pure, synchronous generator -- it does not
 * itself persist anything; `CreateTicketHandler` calls
 * `ticket.issueTrackingToken(token)` to apply+persist the
 * `TicketTrackingTokenIssued` event. `verify()` is async because it resolves
 * against the read-side projection (`ticket_read_model.tracking_token`), the
 * only place token->ticket associations are queryable.
 *
 * Story 2.2 (cuenta liviana) reuses `verify()` inside `LinkTicketsToAccount`
 * to revalidate a token before reassigning `requesterId` -- never a direct
 * `UPDATE` bypassing this port (spec Technical Decisions).
 */
export interface TrackingTokenProvider {
  issue(ticketAggregateId: string): string;
  verify(token: string): Promise<string | null>;
}
