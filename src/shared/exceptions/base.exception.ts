export interface ExceptionDetails {
  [key: string]: unknown;
}

/**
 * Root of the typed exception hierarchy for this service. No handler is
 * allowed to `throw new Error(...)` raw across a boundary (RPC controller /
 * event handler) — every domain or infrastructure failure is an instance of
 * one of these, carrying a stable machine-readable `code` the gateway maps
 * to an HTTP status explicitly.
 */
export abstract class BaseException extends Error {
  protected constructor(
    public readonly code: string,
    message: string,
    public readonly details?: ExceptionDetails,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toRpcError() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/** Business rule violation — maps to 4xx at the gateway (never 5xx). */
export abstract class DomainException extends BaseException {}

/** External dependency failure (DB, broker, etc.) — maps to 5xx/503 at the gateway. */
export abstract class InfrastructureException extends BaseException {}
