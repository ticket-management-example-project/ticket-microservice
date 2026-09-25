import { Inject, Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { PRISMA_CLIENT } from 'src/shared/config/services';
import { PrismaClient } from 'src/generated/prisma/client';

const QUERY_TIMEOUT_MS = 3000;

/** Same shape as `tenant-microservice`'s indicator, querying through the
 * Prisma client instead of TypeORM's `DataSource` (see spec Boundaries:
 * "ticket-microservice usa Prisma ... para todo acceso a datos"). */
@Injectable()
export class PostgresHealthIndicator extends HealthIndicator {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.queryWithTimeout();
      return this.getStatus(key, true);
    } catch (error) {
      const status = this.getStatus(key, false, {
        message: error instanceof Error ? error.message : 'unknown error',
      });
      throw new HealthCheckError('Postgres health check failed', status);
    }
  }

  /**
   * A hung connection (pool exhausted, network partition, ...) must not
   * hang `/health` itself -- race the query against a short timeout so the
   * check reports `down` promptly instead of blocking forever.
   */
  private async queryWithTimeout(): Promise<unknown> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Postgres health check timed out')),
        QUERY_TIMEOUT_MS,
      );
    });

    try {
      return await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }
}
