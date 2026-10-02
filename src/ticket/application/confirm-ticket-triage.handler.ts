import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { PRISMA_CLIENT } from 'src/shared/config/services';
import { PrismaClient } from 'src/generated/prisma/client';
import { Ticket, TicketStatus, TriageReview } from '../domain/ticket.aggregate';
import { TicketNotFoundException } from '../domain/exceptions/ticket-not-found.exception';
import {
  EventsRepository,
  TICKET_AGGREGATE_TYPE,
} from '../infrastructure/events.repository';
import { TicketProjection } from '../infrastructure/ticket.projection';
import { ConfirmTicketTriageCommand } from './confirm-ticket-triage.command';

/**
 * Story 5.2 (FR10): el agente acepta la sugerencia de triage con un clic.
 * Mismo molde que `ApplyTicketTriageHandler`: el aggregate decide, y el
 * guard + escritura ocurren en UN `UPDATE` atómico
 * (`claimTriageConfirmation()`), así dos confirmaciones concurrentes nunca
 * duplican el evento. Devuelve `true` si esta llamada aplicó la revisión,
 * `false` si ya estaba revisada (idempotente).
 */
@Injectable()
@CommandHandler(ConfirmTicketTriageCommand)
export class ConfirmTicketTriageHandler
  implements ICommandHandler<ConfirmTicketTriageCommand, boolean>
{
  private readonly logger = new Logger(ConfirmTicketTriageHandler.name);

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly projection: TicketProjection,
    private readonly publisher: EventPublisher,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async execute(command: ConfirmTicketTriageCommand): Promise<boolean> {
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

    if (!ticket.confirmTriage(command.reviewedBy)) {
      this.logger.log(
        `Triage of ticket ${command.ticketId} already reviewed -- skipping`,
      );
      return false;
    }

    const occurredAt = new Date().toISOString();
    const won = await this.prisma.$transaction(async (tx) => {
      const claimed = await this.projection.claimTriageConfirmation(
        ticket.id,
        occurredAt,
        tx,
      );
      if (!claimed) {
        return false;
      }
      await this.eventsRepository.append(
        {
          aggregateId: ticket.id,
          aggregateType: TICKET_AGGREGATE_TYPE,
          eventType: 'TicketTriageConfirmed',
          payload: {
            eventVersion: 1,
            occurredAt,
            correlationId: ticket.id,
            data: {
              id: ticket.id,
              reviewedBy: command.reviewedBy,
              triageReview: 'confirmed',
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
}
