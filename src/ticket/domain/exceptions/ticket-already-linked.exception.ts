import { DomainException } from 'src/shared/exceptions/base.exception';

/**
 * I/O Matrix: "Vincular ticket ya vinculado a OTRA cuenta" -> 409, the
 * Ticket is left untouched. Unlike `InvalidTrackingTokenException`, this is
 * NOT a neutral existence-hiding message -- the caller already holds both a
 * valid session (`ClerkAuthGuard`) and a valid tracking token; the conflict
 * is a genuine business rule ("a Ticket belongs to at most one account"),
 * not an existence check that could leak information to an unauthenticated
 * caller. Thrown by `Ticket.linkToAccount()` -- see that aggregate method's
 * doc comment for the idempotent-vs-conflict distinction.
 */
export class TicketAlreadyLinkedException extends DomainException {
  constructor() {
    super(
      'TICKET_ALREADY_LINKED',
      'This ticket is already linked to a different account',
    );
  }
}
