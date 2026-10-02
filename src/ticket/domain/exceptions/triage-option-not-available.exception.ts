import { ValidationException } from 'src/shared/exceptions/validation.exception';

/** Story 5.2: a correction names a category/agent that doesn't exist, is
 * inactive, or belongs to another Tenant -> 400, nothing persisted. */
export class TriageOptionNotAvailableException extends ValidationException {
  constructor(kind: 'category' | 'agent', id: string) {
    super(`The ${kind} "${id}" is not available for this Tenant`, { kind, id });
  }
}
