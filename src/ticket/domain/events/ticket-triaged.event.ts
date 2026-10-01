export type TicketPriority = 'alta' | 'media';
export type TicketRouting = 'human_queue' | 'auto_resolution';

/**
 * Domain event: Epic 5's automatic triage was applied to this Ticket (Story
 * 5.1). Persisted as its own event on the Ticket's own event stream (same
 * criterion as `TicketTrackingTokenIssuedEvent`), raised by
 * `ApplyTicketTriageHandler` after consuming `agent-microservice`'s
 * `TicketTriaged` (Kafka, `tm.triagedecision.events`) -- NOT the same wire
 * event, even though the class name matches: this one is local to
 * `ticket-microservice`'s own `events` table/outbox (`tm.ticket.events`).
 *
 * `categoryId`/`priority`/`suggestedAgentId` are all `null` together exactly
 * when the upstream `TriageDecision` was degraded (LLM quota exhausted after
 * every retry) -- `routedTo` is then always `'human_queue'` (spec Boundaries
 * & Constraints: "nunca falla visible para el Requester").
 */
export class TicketTriagedEvent {
  constructor(
    public readonly aggregateId: string,
    public readonly categoryId: string | null,
    public readonly priority: TicketPriority | null,
    public readonly suggestedAgentId: string | null,
    public readonly routedTo: TicketRouting,
    public readonly occurredAt: string,
  ) {}
}
