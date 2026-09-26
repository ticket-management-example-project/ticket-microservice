export class CreateTicketCommand {
  constructor(
    public readonly tenantSlug: string,
    public readonly subject: string,
    public readonly description: string,
    /** Gateway-side request correlationId; purely for cross-referencing
     * gateway request logs with this operation. Never the event's own
     * `correlationId` (= Ticket aggregate root id, frozen in spec). */
    public readonly gatewayCorrelationId?: string,
    /** Story 3.2: optional Requester contact channel (FR-18) -- `undefined`/
     * empty never blocks creation. */
    public readonly contactEmail?: string,
  ) {}
}
