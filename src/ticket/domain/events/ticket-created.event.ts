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
    /** Story 3.2: optional Requester contact channel, captured at creation
     * for FR-18's "canal disponible al crear el Ticket" branch -- `null`
     * when the Requester didn't provide one. Appended last (not grouped with
     * subject/description) to keep every existing positional call of this
     * constructor's first five args unchanged in spirit; every call site is
     * still updated explicitly. */
    public readonly contactEmail: string | null = null,
  ) {}
}
