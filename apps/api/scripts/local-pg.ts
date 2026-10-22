/**
 * Starts an embedded PostgreSQL for local development when Docker is unavailable.
 * Usage: npx tsx scripts/local-pg.ts
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'fs';
import { join } from 'path';

async function main() {
  const dataDir = join(process.cwd(), '.pgdata');
  const port = Number(process.env.PG_PORT || 5433);
  const alreadyInit = existsSync(join(dataDir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'gow',
    password: 'gow_change_me',
    port,
    persistent: true,
    // Windows default locale often yields WIN1252 — Urdu summaries need UTF8.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });
  if (!alreadyInit) {
    await pg.initialise();
  }
  await pg.start();
  await pg.createDatabase('gow').catch(() => undefined);
  // eslint-disable-next-line no-console
  console.log(`Embedded Postgres listening on localhost:${port} (db=gow user=gow)`);
  // eslint-disable-next-line no-console
  console.log('Keep this process running. Ctrl+C to stop.');
  process.on('SIGINT', async () => {
    await pg.stop();
    process.exit(0);
  });
  await new Promise(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
