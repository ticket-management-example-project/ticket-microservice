-- Story 5.1: adds Epic 5's automatic triage outcome to `ticket_read_model`.
-- All four columns are nullable -- a Ticket sits with every one of them NULL
-- from `TicketCreated` until `TicketTriaged` is consumed (Story 2.1's
-- endpoint never waits for this). Same "no `prisma migrate`" criterion as
-- 001/002/003 -- `schema.prisma` only maps (`@map`) onto these hand-applied
-- columns.
--
-- `category_id`/`suggested_agent_id` are BIGINT (Snowflake ids resolved from
-- tenant-microservice's own `categories`/`tenant_agents_read_model`), same
-- convention as every other id column in this table except `requester_id`
-- (an opaque external Clerk string). `priority`/`routed_to` are short
-- VARCHAR enums, same style as `status`.

ALTER TABLE ticket_read_model
  ADD COLUMN IF NOT EXISTS category_id BIGINT,
  ADD COLUMN IF NOT EXISTS priority VARCHAR(10),
  ADD COLUMN IF NOT EXISTS suggested_agent_id BIGINT,
  ADD COLUMN IF NOT EXISTS routed_to VARCHAR(20);
