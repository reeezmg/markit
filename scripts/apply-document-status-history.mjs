import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const name = '20261001120000_document_status_history';
const sql = readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw Error('Only --apply is supported');
if (!process.argv.includes('--apply')) {
  console.log(`${name}: adds paid_at and status audit triggers for bills/orders/checkouts. No backfill. Run with --apply to install only this migration.`);
} else {
  const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw Error('Invalid database schema');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`SET LOCAL search_path TO "${schema}"`);
    await db.query("SET LOCAL lock_timeout = '15s'");
    await db.query("SELECT pg_advisory_xact_lock(hashtext('document-status-history-migration'))");
    const prior = await db.query('SELECT checksum FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL', [name]);
    if (prior.rowCount) {
      if (prior.rows[0].checksum !== checksum) throw Error('Applied migration checksum differs');
      console.log('Document status history migration already applied.');
    } else {
      await db.query(sql);
      await db.query('INSERT INTO _prisma_migrations(id, checksum, migration_name, finished_at, applied_steps_count) VALUES($1,$2,$3,now(),1)', [randomUUID(), checksum, name]);
      console.log('Paid dates and document status history installed. Historical dates remain unknown.');
    }
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
    await pool.end();
  }
}
