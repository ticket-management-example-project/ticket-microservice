-- Story 3.2: adds the nullable Requester contact email captured optionally
-- at Ticket creation -- closes FR-18's "canal disponible al crear el
-- Ticket" branch (the OTHER branch, "reabrir el link de seguimiento", was
-- already covered by Story 3.1's chat thread). Same "no `prisma migrate`"
-- criterion as 001/002 -- `schema.prisma` only maps (`@map`) onto this
-- hand-applied column.
--
-- Optional, like `requester_id` (002): most Tickets are still created
-- without any contact channel, and its absence never blocks creation (spec
-- Boundaries & Constraints).

ALTER TABLE ticket_read_model
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
