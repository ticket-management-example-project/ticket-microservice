-- Story 2.2: cuenta liviana opcional -- adds the nullable Requester link to
-- `ticket_read_model`. `requester_id` is a Clerk User id (the `sub` claim
-- `ClerkAuthGuard`/`CurrentUserId` resolve on `client-gateway`), an opaque
-- STRING like `user_...` -- NOT a Snowflake id like every other id column in
-- this table, hence `VARCHAR`, not `BIGINT`. Nullable: most Tickets are
-- never linked to an account.
--
-- Same "no `prisma migrate`" criterion as 001 (spec Boundaries &
-- Constraints) -- `schema.prisma` only maps (`@map`) onto this hand-applied
-- column.

ALTER TABLE ticket_read_model
  ADD COLUMN IF NOT EXISTS requester_id VARCHAR(255);

-- Backs `TicketProjection.findByRequesterId(requesterId, tenantId)` --
-- `GetTicketsByRequesterHandler`'s only query, always filtering by BOTH
-- columns together (never `requester_id` alone) so a Requester's history
-- never crosses Tenant boundaries (I/O matrix: "Ver histórico cross-Tenant").
CREATE INDEX IF NOT EXISTS idx_ticket_read_model_tenant_requester
  ON ticket_read_model (tenant_id, requester_id);
