/**
 * Recreate the `gow` database as UTF8 (embedded PG clusters on Windows
 * often init as WIN1252, which rejects Urdu / other Unicode).
 */
const { Client } = require('pg');

const base = {
  host: 'localhost',
  port: Number(process.env.PG_PORT || 5433),
  user: 'gow',
  password: 'gow_change_me',
};

async function main() {
  const admin = new Client({ ...base, database: 'postgres' });
  await admin.connect();
  await admin.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = 'gow' AND pid <> pg_backend_pid()
  `);
  await admin.query('DROP DATABASE IF EXISTS gow');
  await admin.query(
    `CREATE DATABASE gow WITH OWNER gow ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`,
  );
  const check = await admin.query(
    `SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = 'gow'`,
  );
  console.log('gow encoding:', check.rows[0]?.enc);
  await admin.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
