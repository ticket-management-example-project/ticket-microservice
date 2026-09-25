-- Story 2.1: ticket-microservice's first real persistence -- Event Sourcing
-- via Prisma (AD-2). Same shape (Snowflake IDs, `aggregate_id`,
-- `aggregate_type`, `seq_no` with `UNIQUE(aggregate_id, seq_no)`) as
-- tenant-microservice/organization-microservice's own `events` tables, but
-- in this service's own database (`ticketdb`). Requires `wal_level=logical`
-- on the Postgres instance so Debezium can tail `events` directly (no
-- separate outbox table).
--
-- `prisma migrate` is NOT the source of truth for this schema (spec
-- Boundaries & Constraints) -- schema.prisma only maps (`@@map`/`@map`) onto
-- these hand-applied tables, same criterion as the other 3 `events` tables
-- in this codebase.

CREATE TABLE IF NOT EXISTS events (
  id BIGINT PRIMARY KEY,
  aggregate_id BIGINT NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  seq_no INTEGER NOT NULL,
  event_type VARCHAR(150) NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_events_aggregate_seq UNIQUE (aggregate_id, seq_no)
);

CREATE INDEX IF NOT EXISTS idx_events_aggregate_id ON events (aggregate_id);
CREATE INDEX IF NOT EXISTS idx_events_aggregate_type ON events (aggregate_type);

-- Read model for Ticket. Queries NEVER read from `events` directly, only
-- from this projection, kept in sync by TicketProjection's @EventsHandler.
-- `tracking_token` is nullable because `TicketCreated` lands first (no
-- token yet) and `TicketTrackingTokenIssued` fills it in immediately after,
-- both inside the same CreateTicketHandler transaction -- a row is never
-- visible to a reader with a permanently-null token in practice, but the
-- column itself must tolerate the brief in-transaction gap.
CREATE TABLE IF NOT EXISTS ticket_read_model (
  id BIGINT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  subject VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  tracking_token VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ticket_read_model_tracking_token UNIQUE (tracking_token)
);

CREATE INDEX IF NOT EXISTS idx_ticket_read_model_tenant_id
  ON ticket_read_model (tenant_id);
