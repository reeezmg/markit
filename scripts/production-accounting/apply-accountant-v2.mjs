import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const migrationName = '20260926120000_accountant_v2';
const sql = readFileSync(new URL(`../../prisma/migrations/${migrationName}/migration.sql`, import.meta.url), 'utf8').replace(/^\uFEFF/, '');
const checksum = createHash('sha256').update(sql).digest('hex');
const tables = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map(match => match[1]);
if (tables.length !== 19 || tables.some(table => !table.startsWith('accountant_v2_')) || /\b(?:DROP|TRUNCATE|DELETE|UPDATE)\s/i.test(sql.replace(/ON DELETE CASCADE|ON DELETE RESTRICT|ON DELETE SET NULL|ON UPDATE CASCADE/g, ''))) {
  throw new Error('Migration must only create the 19 new Accountant tables and their constraints');
}
const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw new Error('Unsupported database schema name');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query("SET LOCAL lock_timeout = '15s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2-migration'))");
  const exists = await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_name = ANY($2::text[])', [schema, tables]);
  const tracking = await client.query("SELECT to_regclass('_prisma_migrations') AS name");
  if (tracking.rows[0].name) {
    const applied = await client.query('SELECT checksum FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL', [migrationName]);
    if (applied.rowCount) {
      if (applied.rows[0].checksum !== checksum || exists.rowCount !== tables.length) throw new Error('Applied Accountant migration does not match the local migration');
      await client.query('COMMIT');
      console.log('Accountant v2 migration is already applied.');
      process.exitCode = 0;
    } else if (exists.rowCount) throw new Error('Untracked Accountant tables exist; inspect them before applying this migration');
    else await apply();
  } else {
    if (exists.rowCount) throw new Error('Untracked Accountant tables exist; inspect them before applying this migration');
    await client.query(`CREATE TABLE "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL PRIMARY KEY, "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
    await apply();
  }
  async function apply() {
    await client.query(sql);
    await client.query('INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count) VALUES ($1,$2,$3,now(),1)', [randomUUID(), checksum, migrationName]);
    await client.query('COMMIT');
    console.log('Created 19 independent Accountant tables and recorded the migration. Existing account data was not modified.');
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
