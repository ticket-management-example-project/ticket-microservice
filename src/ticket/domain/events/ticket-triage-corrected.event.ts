import { TicketPriority } from './ticket-triaged.event';

/**
 * Domain event: un agente humano corrigió categoría/prioridad/agente (Story
 * 5.2, FR10). Sobrescribe los valores de `TicketTriaged`; `reviewedBy` es el
 * `sub` de Clerk del agente.
 */
export class TicketTriageCorrectedEvent {
  constructor(
    public readonly aggregateId: string,
    public readonly categoryId: string,
    public readonly priority: TicketPriority,
    public readonly suggestedAgentId: string | null,
    public readonly reviewedBy: string,
    public readonly occurredAt: string,
  ) {}
}
