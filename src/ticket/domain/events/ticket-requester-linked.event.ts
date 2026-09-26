/**
 * Domain event: a Ticket was linked to a Requester's lightweight Clerk
 * account (Story 2.2). Same envelope/correlationId convention as
 * `TicketTrackingTokenIssuedEvent` -- `aggregateId` doubles as
 * `correlationId`. `requesterId` is Clerk's own `sub` claim (the Clerk User
 * id, e.g. `user_...`), NOT a Snowflake id like every other identifier on
 * this aggregate -- `ticket_read_model.requester_id` is a `VARCHAR`, not a
 * `BIGINT` (see `infrastructure/migrations/002-ticket-requester.sql`).
 */
export class TicketRequesterLinkedEvent {
  constructor(
    public readonly aggregateId: string,
    public readonly requesterId: string,
    public readonly occurredAt: string,
  ) {}
}
