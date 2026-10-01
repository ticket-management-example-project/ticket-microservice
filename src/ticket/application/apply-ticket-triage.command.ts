import {
  TicketPriority,
  TicketRouting,
} from '../domain/events/ticket-triaged.event';

/**
 * Dispatched by `TicketTriagedConsumer` for every `TicketTriaged` message
 * consumed from `agent-microservice`'s own outbox topic
 * (`tm.triagedecision.events`).
 */
export class ApplyTicketTriageCommand {
  constructor(
    public readonly ticketId: string,
    public readonly categoryId: string | null,
    public readonly priority: TicketPriority | null,
    public readonly suggestedAgentId: string | null,
    public readonly routedTo: TicketRouting,
  ) {}
}
