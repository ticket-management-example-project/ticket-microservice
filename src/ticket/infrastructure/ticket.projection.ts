import { Inject, Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PRISMA_CLIENT } from 'src/shared/config/services';
import { PrismaClient, Prisma } from 'src/generated/prisma/client';
import { TicketCreatedEvent } from '../domain/events/ticket-created.event';
import { TicketTrackingTokenIssuedEvent } from '../domain/events/ticket-tracking-token-issued.event';
import { TicketRequesterLinkedEvent } from '../domain/events/ticket-requester-linked.event';

export interface TicketReadModel {
  id: string;
  tenantId: string;
  subject: string;
  description: string;
  status: string;
  trackingToken: string | null;
  /** Story 2.2: Clerk `sub` claim, `null` until `linkToAccount()` links this
   * Ticket to an account. */
  requesterId: string | null;
  /** Story 3.2: optional Requester contact channel, `null` when not
   * captured at creation. */
  contactEmail: string | null;
  createdAt: string;
}

type PrismaQueryable = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;
type TicketDomainEvent =
  | TicketCreatedEvent
  | TicketTrackingTokenIssuedEvent
  | TicketRequesterLinkedEvent;

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
@EventsHandler(
  TicketCreatedEvent,
  TicketTrackingTokenIssuedEvent,
  TicketRequesterLinkedEvent,
)
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
    if (event instanceof TicketTrackingTokenIssuedEvent) {
      return this.handleTokenIssued(event, client);
    }
    return this.handleRequesterLinked(event, client);
  }

  private async handleCreated(
    event: TicketCreatedEvent,
    client: PrismaQueryable,
  ): Promise<void> {
    await client.$executeRaw(
      Prisma.sql`INSERT INTO ticket_read_model
         (id, tenant_id, subject, description, status, tracking_token, contact_email, created_at, updated_at)
       VALUES (${event.aggregateId}::bigint, ${event.tenantId}::bigint, ${event.subject}, ${event.description}, 'open', NULL, ${event.contactEmail}, ${event.occurredAt}::timestamptz, ${event.occurredAt}::timestamptz)
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

  /** Story 2.2, calco of `handleTokenIssued`: a plain `UPDATE ... WHERE
   * id = ...`, never a second raw lookup. Used for the normal
   * `@EventsHandler`/`ticket.commit()` replay path, where the transition has
   * already been decided (by `claimRequester()`) -- this is a harmless,
   * idempotent re-write of the same value, same "double-dispatch" precedent
   * as every other event here. */
  private async handleRequesterLinked(
    event: TicketRequesterLinkedEvent,
    client: PrismaQueryable,
  ): Promise<void> {
    await client.$executeRaw(
      Prisma.sql`UPDATE ticket_read_model
       SET requester_id = ${event.requesterId}, updated_at = ${event.occurredAt}::timestamptz
       WHERE id = ${event.aggregateId}::bigint`,
    );
  }

  /**
   * `LinkTicketToAccountHandler`'s atomic guard AND write, combined into one
   * statement so the decision can never race: `requester_id IS NULL` is
   * checked and set in the SAME `UPDATE`, under the row lock Postgres
   * already takes for the duration of the statement, inside the caller's
   * transaction. Two concurrent callers linking DIFFERENT accounts to the
   * same never-before-linked Ticket can no longer both observe `NULL` and
   * both "win" -- the second one's `UPDATE` simply matches zero rows once
   * the first commits.
   *
   * Returns `true` only when THIS call performed the transition (the caller
   * may now safely append `TicketRequesterLinkedEvent`); `false` means the
   * row was already linked to some account when this ran -- the caller must
   * re-read to tell "same account" (idempotent) from "different account"
   * (conflict) apart, since this method alone can't distinguish them.
   */
  async claimRequester(
    id: string,
    requesterId: string,
    occurredAt: string,
    client: PrismaQueryable,
  ): Promise<boolean> {
    const affectedRows = await client.$executeRaw(
      Prisma.sql`UPDATE ticket_read_model
       SET requester_id = ${requesterId}, updated_at = ${occurredAt}::timestamptz
       WHERE id = ${id}::bigint AND requester_id IS NULL`,
    );
    return affectedRows === 1;
  }

  async findById(id: string): Promise<TicketReadModel | null> {
    const rows = await this.prisma.$queryRaw<RawTicketRow[]>(
      Prisma.sql`SELECT id, tenant_id, subject, description, status, tracking_token, requester_id, contact_email, created_at
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
      Prisma.sql`SELECT id, tenant_id, subject, description, status, tracking_token, requester_id, contact_email, created_at
       FROM ticket_read_model
       WHERE tracking_token = ${token}`,
    );
    return rows[0] ? this.toReadModel(rows[0]) : null;
  }

  /** `GetTicketsByRequesterHandler`'s only lookup (Story 2.2) -- filters by
   * `(tenant_id, requester_id)` TOGETHER in the same query, backed by the
   * `idx_ticket_read_model_tenant_requester` index, so a Requester
   * authenticated on one Tenant's portal never sees Tickets linked to the
   * same Clerk account on a DIFFERENT Tenant (I/O matrix: "Ver histórico
   * cross-Tenant"). */
  async findByRequesterId(
    requesterId: string,
    tenantId: string,
  ): Promise<TicketReadModel[]> {
    const rows = await this.prisma.$queryRaw<RawTicketRow[]>(
      Prisma.sql`SELECT id, tenant_id, subject, description, status, tracking_token, requester_id, contact_email, created_at
       FROM ticket_read_model
       WHERE requester_id = ${requesterId} AND tenant_id = ${tenantId}::bigint
       ORDER BY created_at DESC`,
    );
    return rows.map((row) => this.toReadModel(row));
  }

  private toReadModel(row: RawTicketRow): TicketReadModel {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      subject: row.subject,
      description: row.description,
      status: row.status,
      trackingToken: row.tracking_token,
      requesterId: row.requester_id,
      contactEmail: row.contact_email ?? null,
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
  requester_id: string | null;
  contact_email?: string | null;
  created_at: string | Date;
}
