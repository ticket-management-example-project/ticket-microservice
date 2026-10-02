import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { PRISMA_CLIENT } from 'src/shared/config/services';
import { PrismaClient } from 'src/generated/prisma/client';
import { Ticket, TicketStatus, TriageReview } from '../domain/ticket.aggregate';
import { TicketNotFoundException } from '../domain/exceptions/ticket-not-found.exception';
import { TenantServiceUnavailableException } from '../domain/exceptions/tenant-service-unavailable.exception';
import { TriageOptionNotAvailableException } from '../domain/exceptions/triage-option-not-available.exception';
import {
  EventsRepository,
  TICKET_AGGREGATE_TYPE,
} from '../infrastructure/events.repository';
import { TenantClient } from '../infrastructure/tenant.client';
import { TicketProjection } from '../infrastructure/ticket.projection';
import { CorrectTicketTriageCommand } from './correct-ticket-triage.command';

/**
 * Story 5.2 (FR10): el agente corrige categoría/prioridad/agente. La
 * categoría y el agente se validan contra los del PROPIO Tenant del Ticket
 * (nunca el que declare el caller) -- una categoría inactiva/ajena o un
 * agente no `active` se rechaza con 400 sin persistir nada. Devuelve `true`
 * si aplicó la corrección, `false` si era idempotente (mismos valores).
 */
@Injectable()
@CommandHandler(CorrectTicketTriageCommand)
export class CorrectTicketTriageHandler
  implements ICommandHandler<CorrectTicketTriageCommand, boolean>
{
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly projection: TicketProjection,
    private readonly tenantClient: TenantClient,
    private readonly publisher: EventPublisher,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async execute(command: CorrectTicketTriageCommand): Promise<boolean> {
    const current = await this.projection.findById(command.ticketId);
    if (!current) {
      throw new TicketNotFoundException(command.ticketId);
    }

    const ticket = this.publisher.mergeObjectContext(
      Ticket.hydrate({
        id: current.id,
        tenantId: current.tenantId,
        subject: current.subject,
        description: current.description,
        status: current.status as TicketStatus,
        trackingToken: current.trackingToken,
        requesterId: current.requesterId,
        contactEmail: current.contactEmail,
        categoryId: current.categoryId,
        priority: current.priority as Ticket['priority'],
        suggestedAgentId: current.suggestedAgentId,
        routedTo: current.routedTo as Ticket['routedTo'],
        triageReview: current.triageReview as TriageReview | null,
      }),
    );

    await this.assertOptionsBelongToTenant(current.tenantId, command);

    const applied = ticket.correctTriage({
      categoryId: command.categoryId,
      priority: command.priority,
      suggestedAgentId: command.suggestedAgentId,
      reviewedBy: command.reviewedBy,
    });
    if (!applied) {
      return false;
    }

    const occurredAt = new Date().toISOString();
    const won = await this.prisma.$transaction(async (tx) => {
      const written = await this.projection.writeTriageCorrection(
        ticket.id,
        {
          categoryId: command.categoryId,
          priority: command.priority,
          suggestedAgentId: command.suggestedAgentId,
        },
        occurredAt,
        tx,
      );
      if (!written) {
        return false;
      }
      await this.eventsRepository.append(
        {
          aggregateId: ticket.id,
          aggregateType: TICKET_AGGREGATE_TYPE,
          eventType: 'TicketTriageCorrected',
          payload: {
            eventVersion: 1,
            occurredAt,
            correlationId: ticket.id,
            data: {
              id: ticket.id,
              categoryId: command.categoryId,
              priority: command.priority,
              suggestedAgentId: command.suggestedAgentId,
              reviewedBy: command.reviewedBy,
              triageReview: 'corrected',
            },
          },
          occurredAt,
        },
        tx,
      );
      return true;
    });

    if (!won) {
      return false;
    }
    ticket.commit();
    return true;
  }

  private async assertOptionsBelongToTenant(
    tenantId: string,
    command: CorrectTicketTriageCommand,
  ): Promise<void> {
    let categories: Awaited<ReturnType<TenantClient['listCategories']>>;
    let agents: Awaited<ReturnType<TenantClient['listAgents']>> = [];
    try {
      categories = await this.tenantClient.listCategories(tenantId);
      if (command.suggestedAgentId) {
        agents = await this.tenantClient.listAgents(tenantId);
      }
    } catch (error) {
      throw new TenantServiceUnavailableException(tenantId, error);
    }

    if (!categories.some((c) => c.id === command.categoryId && c.isActive)) {
      throw new TriageOptionNotAvailableException(
        'category',
        command.categoryId,
      );
    }
    if (
      command.suggestedAgentId &&
      !agents.some(
        (a) => a.id === command.suggestedAgentId && a.status === 'active',
      )
    ) {
      throw new TriageOptionNotAvailableException(
        'agent',
        command.suggestedAgentId,
      );
    }
  }
}
