import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { RpcExceptionFilter } from '@nestjs/common/interfaces';
import { Observable, throwError } from 'rxjs';
import { BaseException } from 'src/shared/exceptions/base.exception';

/**
 * No raw exception is allowed to cross this microservice's RPC boundary.
 * Typed `BaseException`s are serialized to their `{code, message, details}`
 * shape; `HttpException`s (e.g. `BadRequestException` thrown by the
 * `ValidationPipe` on `organization.controller.ts`) are mapped to the same
 * shape using their own status instead of falling through to
 * INTERNAL_ERROR; anything else becomes a generic INTERNAL_ERROR so
 * `client-gateway` never sees a stack trace or an "Empty response" NATS
 * error.
 */
@Catch()
export class AllExceptionsRpcFilter implements RpcExceptionFilter<unknown> {
  private readonly logger = new Logger(AllExceptionsRpcFilter.name);

  catch(exception: unknown, _host: ArgumentsHost): Observable<any> {
    if (exception instanceof BaseException) {
      return throwError(() => exception.toRpcError());
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const rawMessage =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] })?.message ??
            exception.message);
      const message = Array.isArray(rawMessage)
        ? rawMessage.join('; ')
        : rawMessage;

      return throwError(() => ({
        code: status === 400 ? 'VALIDATION_ERROR' : `HTTP_${status}`,
        message,
        details: typeof body === 'object' ? body : undefined,
      }));
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : exception,
    );

    const message =
      exception instanceof Error ? exception.message : 'Unexpected error';
    return throwError(() => ({ code: 'INTERNAL_ERROR', message }));
  }
}
