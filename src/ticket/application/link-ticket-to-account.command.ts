export class LinkTicketToAccountCommand {
  constructor(
    public readonly token: string,
    /** Clerk's `sub` claim, resolved by `client-gateway`'s `ClerkAuthGuard`
     * + `CurrentUserId()` -- never trusted from an unauthenticated caller. */
    public readonly requesterId: string,
    /** Gateway-side request correlationId; purely for cross-referencing
     * gateway request logs with this operation. */
    public readonly gatewayCorrelationId?: string,
  ) {}
}
