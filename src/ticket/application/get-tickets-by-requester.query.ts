export class GetTicketsByRequesterQuery {
  constructor(
    public readonly tenantSlug: string,
    public readonly requesterId: string,
    /** Gateway-side request correlationId; purely for cross-referencing
     * gateway request logs with this operation. */
    public readonly gatewayCorrelationId?: string,
  ) {}
}
