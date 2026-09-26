import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { PRISMA_CLIENT } from 'src/shared/config/services';
import { PrismaClient } from 'src/generated/prisma/client';
import { Ticket, TicketStatus } from '../domain/ticket.aggregate';
import {
  TRACKING_TOKEN_PROVIDER,
  TrackingTokenProvider,
} from '../domain/tracking-token.provider';
import { InvalidTrackingTokenException } from '../domain/exceptions/invalid-tracking-token.exception';
import { TicketAlreadyLinkedException } from '../domain/exceptions/ticket-already-linked.exception';
import {
  EventsRepository,
  TICKET_AGGREGATE_TYPE,
} from '../infrastructure/events.repository';
import { TicketProjection } from '../infrastructure/ticket.projection';
import { LinkTicketToAccountCommand } from './link-ticket-to-account.command';

export interface LinkTicketToAccountResult {
  id: string;
  tenantId: string;
  subject: string;
  description: string;
  status: string;
  requesterId: string;
}

/**
 * Story 2.2's `LinkTicketsToAccount` command. Revalidates `token` via
 * `TrackingTokenProvider.verify()` -- the ONLY production caller of that
 * port besides its own `issue()` counterpart (spec Boundaries &
 * Constraints) -- to resolve the Ticket, never a direct `UPDATE`/second raw
 * lookup bypassing it. A token that fails to resolve throws the exact SAME
 * `InvalidTrackingTokenException` `GetTicketByTokenHandler` throws (spec
 * I/O matrix: "mismo mensaje neutro que get_ticket_by_token") -- this
 * handler is a second caller of that one exception type, not a new one.
 *
 * The idempotent/conflict decision is NOT made from an in-memory read --
 * two concurrent calls linking DIFFERENT accounts to the same never-linked
 * Ticket could otherwise both read `requester_id = NULL`, both pass an
 * in-memory guard, and the second write would silently clobber the first
 * (a genuine TOCTOU race). Instead, `TicketProjection.claimRequester()`
 * performs the guard AND the write as ONE atomic `UPDATE ... WHERE
 * requester_id IS NULL`, inside this handler's own transaction:
 *  - `claimRequester()` returns `true` -> THIS call won the race; the
 *    Ticket is hydrated and `linkToAccount()` is called purely to build and
 *    apply `TicketRequesterLinkedEvent` through the normal `apply()`/
 *    `on{Event}` shape (guaranteed to succeed -- the atomic UPDATE already
 *    confirmed the NULL -> requesterId transition under the transaction's
 *    row lock).
 *  - `claimRequester()` returns `false` -> the row was already linked by
 *    the time this ran. A fresh re-read (never the stale `current` from
 *    before the race) tells "same account" (idempotent, 200) from
 *    "different account" (`TicketAlreadyLinkedException`, 409) apart.
 */
@Injectable()
@CommandHandler(LinkTicketToAccountCommand)
export class LinkTicketToAccountHandler
  implements
    ICommandHandler<LinkTicketToAccountCommand, LinkTicketToAccountResult>
{
  private readonly logger = new Logger(LinkTicketToAccountHandler.name);

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly projection: TicketProjection,
    private readonly publisher: EventPublisher,
    @Inject(TRACKING_TOKEN_PROVIDER)
    private readonly trackingTokenProvider: TrackingTokenProvider,
    @Inject(PRISMA_CLIENT)
    private readonly prisma: PrismaClient,
  ) {}

  async execute(
    command: LinkTicketToAccountCommand,
  ): Promise<LinkTicketToAccountResult> {
    if (command.gatewayCorrelationId) {
      this.logger.log(
        `link_ticket_to_account gatewayCorrelationId=${command.gatewayCorrelationId}`,
      );
    }

    const ticketId = await this.trackingTokenProvider.verify(command.token);
    if (!ticketId) {
      throw new InvalidTrackingTokenException();
    }

    const current = await this.projection.findById(ticketId);
    if (!current) {
      // Defensive: verify() and findById() both read from the same
      // projection, so this should be unreachable in practice -- but if it
      // ever happens, it must fail the same neutral way as any other
      // unresolvable token, not leak an internal inconsistency.
      throw new InvalidTrackingTokenException();
    }

    const occurredAt = new Date().toISOString();
    let ticket!: Ticket;

    const won = await this.prisma.$transaction(async (tx) => {
      const claimed = await this.projection.claimRequester(
        ticketId,
        command.requesterId,
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
          requesterId: null,
        }),
      );
      ticket.linkToAccount(command.requesterId);

      const envelope = {
        eventVersion: 1,
        occurredAt,
        correlationId: ticket.id,
        data: {
          id: ticket.id,
          requesterId: ticket.requesterId,
        },
      };

      await this.eventsRepository.append(
        {
          aggregateId: ticket.id,
          aggregateType: TICKET_AGGREGATE_TYPE,
          eventType: 'TicketRequesterLinked',
          payload: envelope,
          occurredAt,
        },
        tx,
      );

      return true;
    });

    if (!won) {
      const latest = await this.projection.findById(ticketId);
      if (!latest) {
        throw new InvalidTrackingTokenException();
      }
      if (latest.requesterId !== command.requesterId) {
        throw new TicketAlreadyLinkedException();
      }
      return {
        id: latest.id,
        tenantId: latest.tenantId,
        subject: latest.subject,
        description: latest.description,
        status: latest.status,
        requesterId: latest.requesterId,
      };
    }

    // Dispatches through the EventBus for any other current/future
    // in-process subscriber; TicketProjection's plain UPDATE guard makes the
    // repeated write onto an already-claimed row a harmless no-op (same
    // double-dispatch precedent as every other event in this aggregate).
    ticket.commit();

    return {
      id: ticket.id,
      tenantId: ticket.tenantId,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      requesterId: ticket.requesterId as string,
    };
  }
}
