import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma ORM 7: the `datasource` block in schema.prisma no longer carries
// `url` (deprecated there) -- the connection string lives here instead, read
// from the same `DATABASE_URL` env var the running service uses (see
// src/shared/config/envs.ts). Only used by the `prisma generate` CLI (to
// resolve `env()` when introspecting), NOT by the running service's own data
// access, which goes through `PrismaClient`'s `datasourceUrl` constructor
// option (see src/shared/database/database.module.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
