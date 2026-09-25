import { DomainException, ExceptionDetails } from './base.exception';

export class ValidationException extends DomainException {
  constructor(message: string, details?: ExceptionDetails) {
    super('VALIDATION_ERROR', message, details);
  }
}
