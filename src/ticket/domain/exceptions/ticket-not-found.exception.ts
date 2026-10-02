import { DomainException } from 'src/shared/exceptions/base.exception';

/** Story 5.2: `confirm`/`correct` over a ticket id that doesn't exist. Code
 * ends in `_NOT_FOUND` -> `client-gateway` maps it to 404. */
export class TicketNotFoundException extends DomainException {
  constructor(ticketId: string) {
    super('TICKET_NOT_FOUND', `Ticket "${ticketId}" was not found`, {
      ticketId,
    });
  }
}
