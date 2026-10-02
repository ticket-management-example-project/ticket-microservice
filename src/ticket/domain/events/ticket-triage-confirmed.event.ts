/**
 * Domain event: un agente humano confirmó la sugerencia de triage tal cual
 * (Story 5.2, FR10). `reviewedBy` es el `sub` de Clerk del agente -- insumo
 * de auditoría y de SM-3 (% de aceptación de triage sin corrección).
 */
export class TicketTriageConfirmedEvent {
  constructor(
    public readonly aggregateId: string,
    public readonly reviewedBy: string,
    public readonly occurredAt: string,
  ) {}
}
