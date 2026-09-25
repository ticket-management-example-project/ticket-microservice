import { Inject, Injectable } from '@nestjs/common';
import {
  PRISMA_CLIENT,
  SNOWFLAKE_ID_GENERATOR,
} from 'src/shared/config/services';
import { SnowflakeIdGenerator } from 'src/shared/snowflake/snowflake-id.generator';
import { PrismaClient, Prisma } from 'src/generated/prisma/client';

export const TICKET_AGGREGATE_TYPE = 'ticket';

export interface StoredEvent {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

/** Either the top-level `PrismaClient` or the transaction client Prisma
 * hands to a `$transaction(async (tx) => ...)` callback -- both expose
 * `$queryRaw`/`$executeRaw`, which is all this repository needs. */
type PrismaQueryable = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;

/**
 * Append-only writer for the `events` table (`ticketdb`). Single source of
 * truth for the Ticket aggregate; Debezium tails it directly (CDC-as-outbox,
 * no separate `outbox` table). `seq_no` + `UNIQUE(aggregate_id, seq_no)`
 * give optimistic concurrency control per aggregate -- EXACT same pattern as
 * `tenant-microservice`'s `EventsRepository` (`SELECT ... FOR UPDATE` on the
 * last row), reused here per spec Boundaries & Constraints ("mismo bug ya
 * corregido en Story 1.4 -- no reintroducirlo"), just via
 * `prisma.$transaction`/`tx.$queryRaw`/`tx.$executeRaw` instead of
 * TypeORM/`DataSource` (AD-2).
 */
@Injectable()
export class EventsRepository {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(SNOWFLAKE_ID_GENERATOR)
    private readonly snowflake: SnowflakeIdGenerator,
  ) {}

  /**
   * Appends the event. When `client` is supplied, the insert runs inside the
   * caller's own transaction (see `CreateTicketHandler`, which shares one
   * transaction across both event appends -- `TicketCreated` then
   * `TicketTrackingTokenIssued` -- and the projection writes, so a Ticket
   * event is never persisted without its read-model row). Without a
   * `client`, opens and owns its own transaction.
   */
  async append(
    event: StoredEvent,
    client?: PrismaQueryable,
  ): Promise<{ id: string; seqNo: number }> {
    if (client) {
      return this.appendWithClient(event, client);
    }
    return this.prisma.$transaction((tx) => this.appendWithClient(event, tx));
  }

  private async appendWithClient(
    event: StoredEvent,
    client: PrismaQueryable,
  ): Promise<{ id: string; seqNo: number }> {
    // Postgres does not allow `FOR UPDATE` together with an aggregate
    // function (MAX), so lock the last event row for this aggregate
    // individually instead of aggregating under the lock.
    const rows = await client.$queryRaw<Array<{ seq_no: number }>>(
      Prisma.sql`SELECT seq_no
       FROM events
       WHERE aggregate_id = ${event.aggregateId}::bigint
       ORDER BY seq_no DESC
       LIMIT 1
       FOR UPDATE`,
    );
    const seqNo = rows.length > 0 ? Number(rows[0].seq_no) + 1 : 1;
    const id = this.snowflake.nextId();

    await client.$executeRaw(
      Prisma.sql`INSERT INTO events (id, aggregate_id, aggregate_type, seq_no, event_type, payload, occurred_at)
       VALUES (${id}::bigint, ${event.aggregateId}::bigint, ${event.aggregateType}, ${seqNo}, ${event.eventType}, ${JSON.stringify(event.payload)}::jsonb, ${event.occurredAt}::timestamptz)`,
    );

    return { id, seqNo };
  }
}
