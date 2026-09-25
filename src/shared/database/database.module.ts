import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { envs } from 'src/shared/config/envs';
import { PRISMA_CLIENT } from 'src/shared/config/services';
import { PrismaClient } from 'src/generated/prisma/client';

/**
 * `ticket-microservice`'s only Prisma-based module in the codebase (AD-2,
 * see spec Design Notes) -- every other microservice uses TypeORM or raw
 * `pg`. Prisma ORM 7's `prisma-client` generator (see prisma/schema.prisma)
 * is Rust-engine-free and REQUIRES an explicit driver adapter -- there is no
 * plain `datasourceUrl` connection-string constructor option anymore, unlike
 * pre-7 Prisma (confirmed via Context7 docs lookup against the pinned
 * `@prisma/client@^7.10.0`, since this detail is easy to get wrong from
 * stale training data).
 *
 * No `prisma migrate`, no Prisma-managed schema (spec Boundaries &
 * Constraints): `schema.prisma` only maps (`@@map`/`@map`) onto the tables
 * created by hand-applied SQL
 * (`src/ticket/infrastructure/migrations/001-events-tickets.sql`), same
 * hand-applied-SQL discipline as the other 3 `events` tables in this
 * codebase.
 */
@Global()
@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      useFactory: () => {
        const adapter = new PrismaPg({ connectionString: envs.databaseUrl });
        return new PrismaClient({ adapter });
      },
    },
  ],
  exports: [PRISMA_CLIENT],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown() {
    await this.prisma.$disconnect();
  }
}
