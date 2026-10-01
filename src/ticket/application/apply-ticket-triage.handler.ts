import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { PRISMA_CLIENT } from 'src/shared/config/services';
import { PrismaClient } from 'src/generated/prisma/client';
import { Ticket, TicketStatus } from '../domain/ticket.aggregate';
import {
  EventsRepository,
  TICKET_AGGREGATE_TYPE,
} from '../infrastructure/events.repository';
import { TicketProjection } from '../infrastructure/ticket.projection';
import { ApplyTicketTriageCommand } from './apply-ticket-triage.command';

/**
 * Applies Epic 5's `TriageDecision` onto the `Ticket` aggregate (spec
 * Acceptance Criteria: "ticket-microservice consume TicketTriaged ... el
 * Ticket queda triageado sin haber bloqueado la respuesta de creación
 * original"). Never blocks or is blocked by the original `create_ticket`
 * response -- this only ever runs later, out of process, dispatched by
 * `TicketTriagedConsumer`.
 *
 * Same idempotent-claim shape as `LinkTicketToAccountHandler`: the guard AND
 * the write happen in ONE atomic `UPDATE ... WHERE routed_to IS NULL`
 * (`TicketProjection.claimTriage()`), inside this handler's own transaction,
 * so two concurrent redeliveries of the same `TicketTriaged` message can
 * never both "win" and double-apply the triage (spec Boundaries &
 * Constraints: "redelivery at-least-once ... no debe duplicar
 * TriageDecision" -- the SAME guarantee applies symmetrically on this,
 * the consuming side).
 */
@Injectable()
@CommandHandler(ApplyTicketTriageCommand)
export class ApplyTicketTriageHandler
  implements ICommandHandler<ApplyTicketTriageCommand, void>
{
  private readonly logger = new Logger(ApplyTicketTriageHandler.name);

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly projection: TicketProjection,
    private readonly publisher: EventPublisher,
    @Inject(PRISMA_CLIENT)
    private readonly prisma: PrismaClient,
  ) {}

  async execute(command: ApplyTicketTriageCommand): Promise<void> {
    const current = await this.projection.findById(command.ticketId);
    if (!current) {
      // Defensive: `agent-microservice` only ever triages a ticketId it
      // itself consumed from a real `TicketCreated`, so this should be
      // unreachable in practice -- but a Kafka consumer must never crash the
      // partition loop over an inconsistency like this, so log-and-skip.
      this.logger.warn(
        `TicketTriaged received for unknown ticket ${command.ticketId}; skipping`,
      );
      return;
    }

    const occurredAt = new Date().toISOString();
    // Explicit on the MORE consequential state (`auto_resolution`), same
    // fail-unsafe-toward-the-safer-state criterion as
    // `Ticket.onTicketTriagedEvent()` -- `command.routedTo` is already
    // validated by `TicketTriagedConsumer` before this handler ever runs.
    const status: TicketStatus =
      command.routedTo === 'auto_resolution' ? 'auto_resolving' : 'queued';

    let ticket!: Ticket;

    const won = await this.prisma.$transaction(async (tx) => {
      const claimed = await this.projection.claimTriage(
        command.ticketId,
        {
          categoryId: command.categoryId,
          priority: command.priority,
          suggestedAgentId: command.suggestedAgentId,
          routedTo: command.routedTo,
          status,
        },
        occurredAt,
        tx,
      );
      if (!claimed) {
        return false;
      }

      ticket = this.publisher.mergeObjectContext(
        Ticket.hydrate({
          id: current.id,
          tenantId: current.tenantId,
          subject: current.subject,
          description: current.description,
          status: current.status as TicketStatus,
          trackingToken: current.trackingToken,
          requesterId: current.requesterId,
          contactEmail: current.contactEmail,
        }),
      );
      ticket.applyTriage({
        categoryId: command.categoryId,
        priority: command.priority,
        suggestedAgentId: command.suggestedAgentId,
        routedTo: command.routedTo,
        occurredAt,
      });

      const envelope = {
        eventVersion: 1,
        occurredAt,
        correlationId: ticket.id,
        data: {
          id: ticket.id,
          categoryId: ticket.categoryId,
          priority: ticket.priority,
          suggestedAgentId: ticket.suggestedAgentId,
          routedTo: ticket.routedTo,
          status: ticket.status,
        },
      };

      await this.eventsRepository.append(
        {
          aggregateId: ticket.id,
          aggregateType: TICKET_AGGREGATE_TYPE,
          eventType: 'TicketTriaged',
          payload: envelope,
          occurredAt,
        },
        tx,
      );

      return true;
    });

    if (!won) {
      this.logger.log(
        `TicketTriaged for ticket ${command.ticketId} already applied -- skipping (at-least-once redelivery)`,
      );
      return;
    }

    // Dispatches through the EventBus for any other current/future
    // in-process subscriber; TicketProjection's plain UPDATE guard makes the
    // repeated write onto an already-triaged row a harmless no-op (same
    // double-dispatch precedent as every other event in this aggregate).
    ticket.commit();
  }
}
