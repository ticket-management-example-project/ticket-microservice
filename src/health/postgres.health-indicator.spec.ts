import { HealthCheckError } from '@nestjs/terminus';
import { PostgresHealthIndicator } from './postgres.health-indicator';

/** I/O Matrix: "Dependencia caída" (Postgres) -> /health reports the
 * specific check as down. Prisma's `$queryRaw` is a tagged-template function
 * (not a plain `query(sql)` call like TypeORM's `DataSource`), so the mock
 * asserts it was invoked rather than matching an exact SQL string. */
describe('PostgresHealthIndicator', () => {
  const makeIndicator = (prisma: { $queryRaw: jest.Mock }) =>
    new PostgresHealthIndicator(prisma as any);

  it('reports "up" when the query succeeds', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{}]) };
    const indicator = makeIndicator(prisma);

    const result = await indicator.isHealthy('postgres');

    expect(result).toEqual({ postgres: { status: 'up' } });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('throws HealthCheckError with the check marked "down" when the connection fails', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const indicator = makeIndicator(prisma);

    await expect(indicator.isHealthy('postgres')).rejects.toBeInstanceOf(
      HealthCheckError,
    );

    try {
      await indicator.isHealthy('postgres');
      throw new Error('expected isHealthy to reject');
    } catch (error) {
      const healthCheckError = error as HealthCheckError;
      expect(healthCheckError.causes).toEqual({
        postgres: { status: 'down', message: 'connection refused' },
      });
    }
  });
});
