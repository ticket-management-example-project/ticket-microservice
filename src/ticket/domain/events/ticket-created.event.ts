/**
 * Domain event: a Ticket was created by an unauthenticated Requester on a
 * Tenant's public portal (Story 2.1). `aggregateId` doubles as the
 * `correlationId` for the whole flow -- same criterion as `Tenant`/
 * `TenantAgent` (spec Boundaries & Constraints: "correlationId = ticket_id").
 * Epic 5 (Triage) consumes this event to trigger automatic classification;
 * this service never waits for that.
 */
export class TicketCreatedEvent {
  constructor(
    public readonly aggregateId: string,
    public readonly tenantId: string,
    public readonly subject: string,
    public readonly description: string,
    public readonly occurredAt: string,
  ) {}
}
