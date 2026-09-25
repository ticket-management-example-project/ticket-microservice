// Minimal, dependency-free migration runner: applies every .sql file under
// each subdomain's infrastructure/migrations directory, in directory order
// then filename order. Good enough for local dev / CI bring-up; mirrors
// tenant-microservice's own script. Runs as a standalone dev-tooling script
// via `pg` directly (unrelated to the running service's own data access,
// which goes through Prisma -- see spec Boundaries & Constraints: "no usar
// prisma migrate como fuente de verdad del schema").
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATION_DIRS = [['ticket', 'infrastructure', 'migrations']];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const segments of MIGRATION_DIRS) {
      const migrationsDir = path.join(__dirname, '..', 'src', ...segments);
      if (!fs.existsSync(migrationsDir)) {
        continue;
      }
      const files = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith('.sql'))
        .sort();

      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        process.stdout.write(`Applying ${segments[0]}/${file}...\n`);
        await client.query(sql);
      }
    }
    process.stdout.write('Migrations applied successfully.\n');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
