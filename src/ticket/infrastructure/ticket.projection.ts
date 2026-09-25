import { Inject, Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PRISMA_CLIENT } from 'src/shared/config/services';
import { PrismaClient, Prisma } from 'src/generated/prisma/client';
import { TicketCreatedEvent } from '../domain/events/ticket-created.event';
import { TicketTrackingTokenIssuedEvent } from '../domain/events/ticket-tracking-token-issued.event';

export interface TicketReadModel {
  id: string;
  tenantId: string;
  subject: string;
  description: string;
  status: string;
  trackingToken: string | null;
  createdAt: string;
}

type PrismaQueryable = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;
type TicketDomainEvent = TicketCreatedEvent | TicketTrackingTokenIssuedEvent;

/**
 * Read-side projection for `Ticket`, kept in sync by `@EventsHandler`.
 * Calco of `tenant-agent.projection.ts`'s two-event-types shape, but via
 * Prisma (`tx.$executeRaw`, `ON CONFLICT (id) DO NOTHING`) instead of
 * TypeORM (AD-2). `handle()` is called twice in practice -- once
 * directly-and-awaited from `CreateTicketHandler` (so a failure surfaces to
 * the caller instead of vanishing into `@nestjs/cqrs`'s fire-and-forget
 * `EventBus`), and once more from `ticket.commit()` for any other
 * current/future subscriber (Epic 5's Triage listens for `TicketCreated`
 * itself via Kafka, not this in-process EventBus -- this second dispatch is
 * this codebase's established double-dispatch precedent, Story 1.4's
 * `ON CONFLICT (id) DO NOTHING` guard applies here for the same reason).
 */
@Injectable()
@EventsHandler(TicketCreatedEvent, TicketTrackingTokenIssuedEvent)
export class TicketProjection implements IEventHandler<TicketDomainEvent> {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async handle(
    event: TicketDomainEvent,
    client?: PrismaQueryable,
  ): Promise<void> {
    if (client) {
      return this.handleWithClient(event, client);
    }
    await this.prisma.$transaction((tx) => this.handleWithClient(event, tx));
  }

  private async handleWithClient(
    event: TicketDomainEvent,
    client: PrismaQueryable,
  ): Promise<void> {
    if (event instanceof TicketCreatedEvent) {
      return this.handleCreated(event, client);
    }
    return this.handleTokenIssued(event, client);
  }

  private async handleCreated(
    event: TicketCreatedEvent,
    client: PrismaQueryable,
  ): Promise<void> {
    await client.$executeRaw(
      Prisma.sql`INSERT INTO ticket_read_model
         (id, tenant_id, subject, description, status, tracking_token, created_at, updated_at)
       VALUES (${event.aggregateId}::bigint, ${event.tenantId}::bigint, ${event.subject}, ${event.description}, 'open', NULL, ${event.occurredAt}::timestamptz, ${event.occurredAt}::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
    );
  }

  private async handleTokenIssued(
    event: TicketTrackingTokenIssuedEvent,
    client: PrismaQueryable,
  ): Promise<void> {
    await client.$executeRaw(
      Prisma.sql`UPDATE ticket_read_model
       SET tracking_token = ${event.token}, updated_at = ${event.occurredAt}::timestamptz
       WHERE id = ${event.aggregateId}::bigint`,
    );
  }

  async findById(id: string): Promise<TicketReadModel | null> {
    const rows = await this.prisma.$queryRaw<RawTicketRow[]>(
      Prisma.sql`SELECT id, tenant_id, subject, description, status, tracking_token, created_at
       FROM ticket_read_model
       WHERE id = ${id}::bigint`,
    );
    return rows[0] ? this.toReadModel(rows[0]) : null;
  }

  /** `GetTicketByTokenHandler`'s final lookup after
   * `TrackingTokenProvider.verify()` resolves the token to an id -- also
   * used BY `verify()` itself (see `tracking-token.provider.ts`), since the
   * token->ticket association only lives in this projection. */
  async findByTrackingToken(token: string): Promise<TicketReadModel | null> {
    const rows = await this.prisma.$queryRaw<RawTicketRow[]>(
      Prisma.sql`SELECT id, tenant_id, subject, description, status, tracking_token, created_at
       FROM ticket_read_model
       WHERE tracking_token = ${token}`,
    );
    return rows[0] ? this.toReadModel(rows[0]) : null;
  }

  private toReadModel(row: RawTicketRow): TicketReadModel {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      subject: row.subject,
      description: row.description,
      status: row.status,
      trackingToken: row.tracking_token,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
    };
  }
}

interface RawTicketRow {
  id: string | bigint;
  tenant_id: string | bigint;
  subject: string;
  description: string;
  status: string;
  tracking_token: string | null;
  created_at: string | Date;
}
