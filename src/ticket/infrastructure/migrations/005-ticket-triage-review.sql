-- Story 5.2: registra si un agente humano confirmó o corrigió la sugerencia
-- de triage (`'confirmed'` | `'corrected'`); NULL = sin revisar. Insumo de
-- SM-3 (% de aceptación de triage sin corrección). Mismo criterio "sin
-- `prisma migrate`" que 001..004 -- `schema.prisma` solo mapea (`@map`) la
-- columna aplicada a mano.
ALTER TABLE ticket_read_model
  ADD COLUMN IF NOT EXISTS triage_review VARCHAR(10);
