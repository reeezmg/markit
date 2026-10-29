import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import ts from 'typescript';

// Execute the product handler's actual item-upsert SQL against PostgreSQL.
// Only one temporary item is written; all writes and trigger effects roll back.
const url = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15000 });
const db = await pool.connect();
try {
  await db.query('BEGIN');
  const schema = new URL(url).searchParams.get('schema') || 'public';
  assert.match(schema, /^[A-Za-z_][A-Za-z0-9_]*$/);
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query("SET LOCAL statement_timeout='20s'");
  await db.query("SET LOCAL lock_timeout='5s'");
  const owner = (await db.query('SELECT variant_id, company_id FROM items WHERE barcode=$1 AND company_id=$2',
    ['25A000607', '6980e6e4-7d5d-413c-9554-24f385c9b853'])).rows[0];
  assert.ok(owner);
  const id = randomUUID();
  let upsert;
  const client = {
    release() {},
    async query(sql, args) {
      if (sql.startsWith('INSERT INTO items')) upsert = { sql, args };
      if (sql.includes('FROM products p')) return { rows: [{ id: 'fixture' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  const source = readFileSync(new URL('../server/api/products/update.post.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)((name) => {
    if (name === 'crypto') return { randomUUID };
    if (name === 'h3') return { defineEventHandler: fn => fn, readBody: async event => event, createError: data => Object.assign(new Error(data.statusMessage), data) };
    if (name === '~/server/db') return { pool: { connect: async () => client } };
    if (name === '~/server/utils/companyRequestScope') return { useCompanyRequestSession: async () => ({ data: { companyId: owner.company_id } }) };
    if (name === '~/server/utils/lockCompanyRequest') return { lockCompanyRequest: async () => {} };
    if (name === '~/server/utils/mediaCleanup') return { cleanupMediaKeys: async () => {} };
    if (name === '~/server/utils/purchase-order-totals') return { recalculatePurchaseOrderTotals: async () => {} };
    throw new Error(`Unexpected import ${name}`);
  }, module, module.exports);
  async function save(qty, updateInitialQty = false, itemOptions = {}) {
    upsert = undefined;
    await module.exports.default({ productId: 'fixture', updateInitialQty,
      variants: [{ id: owner.variant_id, items: [{ id, qty, ...itemOptions }] }] });
    assert.ok(upsert);
    const row = (await db.query(upsert.sql, upsert.args)).rows[0];
    const returned = Number((await db.query(`SELECT COALESCE(sum(ri.qty),0) qty FROM purchase_return_items ri
      JOIN purchase_returns pr ON pr.id=ri.purchase_return_id WHERE ri.item_id=$1 AND pr.company_id=$2`, [id, owner.company_id])).rows[0].qty);
    assert.equal(row.qty, row.initial_qty - row.sold_qty - returned);
    return { initial: row.initial_qty, sold: row.sold_qty, qty: row.qty };
  }
  assert.deepEqual(await save(64, true), { initial: 64, sold: 0, qty: 64 });
  await db.query('UPDATE items SET sold_qty=63,qty=1 WHERE id=$1', [id]);
  assert.deepEqual(await save(64, true), { initial: 64, sold: 63, qty: 1 });
  assert.deepEqual(await save(64), { initial: 64, sold: 63, qty: 1 });
  assert.deepEqual(await save(70, true), { initial: 70, sold: 63, qty: 7 });
  assert.deepEqual(await save(60, true), { initial: 60, sold: 63, qty: -3 });
  // Old current-stock adjustments and incoming sold counters cannot reset data.
  assert.deepEqual(await save(5, false, { updateStockQty: true, initialQty: 999, soldQty: 0 }), { initial: 60, sold: 63, qty: -3 });
  // Normal product edits explicitly change only initial quantity.
  assert.deepEqual(await save(999, false, { initialQty: 68, updateInitialQty: true, soldQty: 0 }), { initial: 68, sold: 63, qty: 5 });
  // Sold counter changed since the form loaded: stale qty must be ignored.
  await db.query('UPDATE items SET sold_qty=64,qty=4 WHERE id=$1', [id]);
  assert.deepEqual(await save(5), { initial: 68, sold: 64, qty: 4 });
  assert.deepEqual(await save(64, true), { initial: 64, sold: 64, qty: 0 });
  const distributor = (await db.query('SELECT distributor_id FROM distributor_companies WHERE company_id=$1 LIMIT 1', [owner.company_id])).rows[0];
  assert.ok(distributor);
  const returnId = randomUUID();
  await db.query('INSERT INTO purchase_returns(id,company_id,distributor_id,updated_at) VALUES($1,$2,$3,now())', [returnId,owner.company_id,distributor.distributor_id]);
  await db.query(`INSERT INTO purchase_return_items(id,item_id,product_name,qty,rate,subtotal,purchase_return_id)
    VALUES($1,$2,'Stock regression fixture',2,0,0,$3)`, [randomUUID(),id,returnId]);
  assert.deepEqual(await save(64, true), { initial: 64, sold: 64, qty: -2 });
  assert.deepEqual(await save(70, true), { initial: 70, sold: 64, qty: 4 });
  assert.deepEqual(await save(70), { initial: 70, sold: 64, qty: 4 });
  assert.deepEqual(await save(999, false, { initialQty: 71, updateInitialQty: true }), { initial: 71, sold: 64, qty: 5 });
  assert.deepEqual(await save(999, false, { initialQty: 999, soldQty: 0 }), { initial: 71, sold: 64, qty: 5 });
  await db.query('DELETE FROM purchase_returns WHERE id=$1', [returnId]);
  assert.deepEqual(await save(5), { initial: 71, sold: 64, qty: 7 });
  console.log('PASS initial-only product/purchase edits, no current/sold resets, unchanged metadata saves, sales while editing, overselling and supplier returns');
} finally {
  await db.query('ROLLBACK');
  db.release();
  await pool.end();
  console.log('Rolled back temporary stock and trigger effects; no schema changes.');
}
