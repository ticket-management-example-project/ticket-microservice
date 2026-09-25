import { DomainException } from 'src/shared/exceptions/base.exception';

/**
 * I/O Matrix: "Consultar con token inválido/inexistente" -> neutral
 * code/message that NEVER distinguishes "no existe" from any other failure
 * reason (mismo principio de no confirmar existencia usado para el bloqueo
 * cross-tenant, epic context). `GetTicketByTokenHandler` throws this single
 * exception type for every failure mode on this path -- a malformed token, a
 * token that never existed, and a token whose Ticket row is somehow missing
 * from the projection all produce the exact same `{code, message}` here.
 * Code ends in `_NOT_FOUND` so `client-gateway`'s `DomainErrorFilter` maps it
 * to 404 via its generic suffix rule, same as `TENANT_NOT_FOUND`.
 */
export class InvalidTrackingTokenException extends DomainException {
  constructor() {
    super(
      'TICKET_NOT_FOUND',
      'We could not find a ticket for that tracking link',
    );
  }
}
