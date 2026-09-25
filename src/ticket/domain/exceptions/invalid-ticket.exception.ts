import { ValidationException } from 'src/shared/exceptions/validation.exception';

/**
 * Defense-in-depth: `CreateTicketDto`'s `class-validator` decorators already
 * reject an empty subject/description at `client-gateway` (I/O matrix: 400
 * via the global `ValidationPipe`), but this domain invariant holds
 * regardless of caller -- same reasoning as `InvalidTenantNameException`, in
 * case `create_ticket` is invoked directly over NATS.
 */
export class InvalidTicketException extends ValidationException {
  constructor(reason: string) {
    super(`Invalid Ticket: ${reason}`, { reason });
  }
}
