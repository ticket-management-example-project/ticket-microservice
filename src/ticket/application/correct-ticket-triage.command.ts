import { TicketPriority } from '../domain/events/ticket-triaged.event';

export class CorrectTicketTriageCommand {
  constructor(
    public readonly ticketId: string,
    public readonly categoryId: string,
    public readonly priority: TicketPriority,
    public readonly suggestedAgentId: string | null,
    public readonly reviewedBy: string,
  ) {}
}
