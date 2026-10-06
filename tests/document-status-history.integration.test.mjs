import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

// Run real PostgreSQL triggers in an isolated schema. Everything is rolled back.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = await pool.connect();
const schema = `status_test_${randomUUID().replaceAll('-', '')}`;
const migration = readFileSync(new URL('../prisma/migrations/20261001120000_document_status_history/migration.sql', import.meta.url), 'utf8');
try {
  await db.query('BEGIN');
  await db.query(`CREATE SCHEMA "${schema}"`);
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  for (const table of ['bills', 'ecomm_orders', 'ecomm_checkouts']) {
    await db.query(`CREATE TABLE ${table} (
      id text PRIMARY KEY, company_id text NOT NULL, status text,
      payment_status text, notes text, updated_at timestamp DEFAULT now()
    )`);
    await db.query(`INSERT INTO ${table} VALUES ('legacy','a','PLACED','PAID',NULL,now())`);
  }
  await db.query(migration);
  await db.query(migration); // Reapplication must not replace dates/history.
  for (const table of ['bills', 'ecomm_orders', 'ecomm_checkouts']) {
    assert.equal((await db.query(`SELECT paid_at FROM ${table} WHERE id='legacy'`)).rows[0].paid_at, null);
    await db.query(`UPDATE ${table} SET notes='edited' WHERE id='legacy'`);
    assert.equal((await db.query(`SELECT paid_at FROM ${table} WHERE id='legacy'`)).rows[0].paid_at, null);
    await db.query(`INSERT INTO ${table}(id,company_id,status,payment_status) VALUES ('cod','a','PLACED','PENDING'),('online','a','PLACED','PAID'),('other','b','PLACED','PENDING')`);
    assert.equal((await db.query(`SELECT paid_at FROM ${table} WHERE id='cod'`)).rows[0].paid_at, null);
    assert.ok((await db.query(`SELECT paid_at FROM ${table} WHERE id='online'`)).rows[0].paid_at);
  }
  await db.query(`SELECT set_config('app.status_source','order.manual',true),set_config('app.status_actor','user:test',true)`);
  for (const table of ['bills', 'ecomm_orders', 'ecomm_checkouts']) {
    await db.query(`UPDATE ${table} SET status='DELIVERED',payment_status='PAID' WHERE id='cod'`);
  }
  const paid = (await db.query("SELECT paid_at FROM bills WHERE id='cod'")).rows[0].paid_at.toISOString();
  for (const table of ['bills', 'ecomm_orders', 'ecomm_checkouts']) {
    assert.equal((await db.query(`SELECT paid_at FROM ${table} WHERE id='cod'`)).rows[0].paid_at.toISOString(), paid);
    // Neither retries, edits nor caller-supplied timestamps can overwrite paid_at.
    await db.query(`UPDATE ${table} SET payment_status='PAID',notes='edit',paid_at='2000-01-01' WHERE id='cod'`);
    assert.equal((await db.query(`SELECT paid_at FROM ${table} WHERE id='cod'`)).rows[0].paid_at.toISOString(), paid);
  }
  let rows = (await db.query("SELECT * FROM document_status_history WHERE entity_type='bills' AND entity_id='cod' ORDER BY sequence")).rows;
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(r => [r.field, r.previous_status, r.status]), [
    ['status', null, 'PLACED'], ['payment_status', null, 'PENDING'],
    ['status', 'PLACED', 'DELIVERED'], ['payment_status', 'PENDING', 'PAID'],
  ]);
  assert.equal(rows[3].source, 'order.manual');
  assert.equal(rows[3].actor_id, 'user:test');
  assert.ok(rows.every(r => r.changed_at instanceof Date));
  await db.query("UPDATE bills SET payment_status='PENDING' WHERE id='cod'");
  await db.query("UPDATE bills SET payment_status='PAID' WHERE id='cod'");
  assert.equal((await db.query("SELECT paid_at FROM bills WHERE id='cod'")).rows[0].paid_at.toISOString(), paid);
  await db.query('SAVEPOINT failed_change');
  await db.query("UPDATE bills SET status='CANCELLED' WHERE id='cod'");
  await db.query('ROLLBACK TO SAVEPOINT failed_change');
  assert.equal((await db.query("SELECT count(*)::int n FROM document_status_history WHERE status='CANCELLED'")).rows[0].n, 0);
  await db.query("UPDATE bills SET status=NULL WHERE id='cod'");
  rows = (await db.query("SELECT * FROM document_status_history WHERE company_id='a' AND entity_type='bills' AND entity_id='cod' ORDER BY sequence")).rows;
  assert.equal(rows.at(-1).status, null);
  assert.equal(rows.at(-1).previous_status, 'DELIVERED');
  assert.equal((await db.query("SELECT count(*)::int n FROM document_status_history WHERE company_id='b' AND entity_id='cod'")).rows[0].n, 0);
  await db.query("DELETE FROM bills WHERE id='cod'");
  assert.equal((await db.query("SELECT count(*)::int n FROM document_status_history WHERE entity_type='bills' AND entity_id='cod'")).rows[0].n, rows.length);
  console.log('Document status tracking passed: legacy unknown dates, COD/online, synchronized dates, retries, immutable first paid date, transitions, source/actor, rollback and deletion retention.');
} finally {
  await db.query('ROLLBACK');
  db.release();
  await pool.end();
}
