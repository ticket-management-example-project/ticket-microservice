import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import {
  PRISMA_CLIENT,
  SNOWFLAKE_ID_GENERATOR,
} from 'src/shared/config/services';
import { SnowflakeIdGenerator } from 'src/shared/snowflake/snowflake-id.generator';
import { PrismaClient } from 'src/generated/prisma/client';
import { Ticket } from '../domain/ticket.aggregate';
import { TicketCreatedEvent } from '../domain/events/ticket-created.event';
import { TicketTrackingTokenIssuedEvent } from '../domain/events/ticket-tracking-token-issued.event';
import {
  TRACKING_TOKEN_PROVIDER,
  TrackingTokenProvider,
} from '../domain/tracking-token.provider';
import { TenantNotFoundException } from '../domain/exceptions/tenant-not-found.exception';
import { TenantServiceUnavailableException } from '../domain/exceptions/tenant-service-unavailable.exception';
import {
  EventsRepository,
  TICKET_AGGREGATE_TYPE,
} from '../infrastructure/events.repository';
import { TicketProjection } from '../infrastructure/ticket.projection';
import { TenantClient } from '../infrastructure/tenant.client';
import { CreateTicketCommand } from './create-ticket.command';

export interface CreateTicketResult {
  id: string;
  tenantId: string;
  subject: string;
  description: string;
  status: string;
  trackingToken: string;
  contactEmail: string | null;
}

/**
 * Resolves (via NATS `find_tenant_by_slug`, `tenant-microservice`) that the
 * Tenant behind the portal's `slug` exists, creates the Ticket aggregate
 * `open`, and immediately issues its tracking token -- all in one
 * transaction, all before returning. Never waits on triage/LLM output (Epic
 * 5 consumes `TicketCreated` out of process, later, over Kafka -- spec
 * Technical Decisions: "creación asíncrona respecto al triage").
 *
 * `TicketCreated` and `TicketTrackingTokenIssued` are two events on the SAME
 * aggregate/event stream (seq_no 1 and 2), persisted in the same
 * transaction as their projection writes -- same "never leave an event
 * orphaned from its read-model row" discipline as
 * `tenant-microservice`'s `CreateTenantHandler`.
 */
@Injectable()
@CommandHandler(CreateTicketCommand)
export class CreateTicketHandler
  implements ICommandHandler<CreateTicketCommand, CreateTicketResult>
{
  private readonly logger = new Logger(CreateTicketHandler.name);

  constructor(
    private readonly tenantClient: TenantClient,
    private readonly eventsRepository: EventsRepository,
    private readonly projection: TicketProjection,
    private readonly publisher: EventPublisher,
    @Inject(TRACKING_TOKEN_PROVIDER)
    private readonly trackingTokenProvider: TrackingTokenProvider,
    @Inject(SNOWFLAKE_ID_GENERATOR)
    private readonly snowflake: SnowflakeIdGenerator,
    @Inject(PRISMA_CLIENT)
    private readonly prisma: PrismaClient,
  ) {}

  async execute(command: CreateTicketCommand): Promise<CreateTicketResult> {
    if (command.gatewayCorrelationId) {
      // Cross-references client-gateway's request log with this operation,
      // same criterion as tenant-microservice's CreateTenantHandler.
      this.logger.log(
        `create_ticket gatewayCorrelationId=${command.gatewayCorrelationId} tenantSlug=${command.tenantSlug}`,
      );
    }

    let tenant: Awaited<ReturnType<TenantClient['findTenantBySlug']>>;
    try {
      tenant = await this.tenantClient.findTenantBySlug(command.tenantSlug);
    } catch (error) {
      throw new TenantServiceUnavailableException(command.tenantSlug, error);
    }

    if (!tenant) {
      throw new TenantNotFoundException(command.tenantSlug);
    }

    const id = this.snowflake.nextId();

    const ticket = this.publisher.mergeObjectContext(
      Ticket.create({
        id,
        tenantId: tenant.id,
        subject: command.subject,
        description: command.description,
        contactEmail: command.contactEmail,
      }),
    );

    const token = this.trackingTokenProvider.issue(ticket.id);
    ticket.issueTrackingToken(token);

    const occurredAt = new Date().toISOString();

    const createdEnvelope = {
      eventVersion: 1,
      occurredAt,
      correlationId: ticket.id,
      data: {
        id: ticket.id,
        tenantId: ticket.tenantId,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        contactEmail: ticket.contactEmail,
      },
    };
    const tokenIssuedEnvelope = {
      eventVersion: 1,
      occurredAt,
      correlationId: ticket.id,
      data: {
        id: ticket.id,
        token,
      },
    };

    // A single transaction spans both event appends and both projection
    // writes: if any step fails, everything rolls back together, so a
    // Ticket is never left half-persisted (e.g. TicketCreated with no
    // tracking token, or an event with no read-model row).
    await this.prisma.$transaction(async (tx) => {
      await this.eventsRepository.append(
        {
          aggregateId: ticket.id,
          aggregateType: TICKET_AGGREGATE_TYPE,
          eventType: 'TicketCreated',
          payload: createdEnvelope,
          occurredAt,
        },
        tx,
      );

      await this.projection.handle(
        new TicketCreatedEvent(
          ticket.id,
          ticket.tenantId,
          ticket.subject,
          ticket.description,
          occurredAt,
          ticket.contactEmail,
        ),
        tx,
      );

      await this.eventsRepository.append(
        {
          aggregateId: ticket.id,
          aggregateType: TICKET_AGGREGATE_TYPE,
          eventType: 'TicketTrackingTokenIssued',
          payload: tokenIssuedEnvelope,
          occurredAt,
        },
        tx,
      );

      await this.projection.handle(
        new TicketTrackingTokenIssuedEvent(ticket.id, token, occurredAt),
        tx,
      );
    });

    // Still commit so the EventBus dispatches to any other current/future
    // in-process subscriber; TicketProjection.handle()'s ON CONFLICT/plain
    // UPDATE guards make the repeated write a harmless no-op.
    ticket.commit();

    return {
      id: ticket.id,
      tenantId: ticket.tenantId,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      trackingToken: ticket.trackingToken as string,
      contactEmail: ticket.contactEmail,
    };
  }
}
