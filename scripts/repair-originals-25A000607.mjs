import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

// One-record repair authorized in the 2026-10-11 stock investigation.
// Running without --apply only inspects the requested record.
const companyId = '6980e6e4-7d5d-413c-9554-24f385c9b853';
const barcode = '25A000607';
const apply = process.argv.includes('--apply');
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15000 });
const db = await pool.connect();
try {
  await db.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
  const schema = new URL(url).searchParams.get('schema') || 'public';
  assert.match(schema, /^[A-Za-z_][A-Za-z0-9_]*$/);
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SET LOCAL statement_timeout='30s'");
  const rows = (await db.query(`SELECT * FROM items WHERE company_id=$1 AND barcode=$2${apply ? ' FOR UPDATE' : ''}`,
    [companyId, barcode])).rows;
  assert.equal(rows.length, 1, 'Expected exactly one requested item');
  const before = rows[0];
  const sales = (await db.query(`SELECT sum(CASE WHEN e.return THEN -e.qty ELSE e.qty END) net_sold
    FROM entries e JOIN bills b ON b.id=e.bill_id
    WHERE e.item_id=$1 AND b.company_id=$2 AND NOT COALESCE(b.deleted,false)`, [before.id, companyId])).rows[0];
  assert.equal(Number(sales.net_sold), Number(before.sold_qty), 'Sold counter must agree with live sales');
  const supplierReturnedQty = Number((await db.query(`SELECT COALESCE(sum(ri.qty),0) qty
    FROM purchase_return_items ri JOIN purchase_returns pr ON pr.id=ri.purchase_return_id
    WHERE ri.item_id=$1 AND pr.company_id=$2`, [before.id,companyId])).rows[0].qty);
  const expectedQty = Number(before.initial_qty) - Number(before.sold_qty) - supplierReturnedQty;
  if (!apply || before.qty === expectedQty) {
    console.log(JSON.stringify({ barcode, initial: before.initial_qty, sold: before.sold_qty, supplierReturnedQty, qty: before.qty, expectedQty, applied: false }, null, 2));
    await db.query('ROLLBACK');
  } else {
    const dir = new URL('../../artifacts/stock-repair/', import.meta.url);
    mkdirSync(dir, { recursive: true });
    const backup = new URL(`${barcode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, dir);
    writeFileSync(backup, JSON.stringify({ companyId, barcode, before, sales, supplierReturnedQty }, null, 2), { flag: 'wx' });
    const result = await db.query(`UPDATE items SET qty=COALESCE(initial_qty,0)-COALESCE(sold_qty,0)-$3,updated_at=now()
      WHERE id=$1 AND company_id=$2 RETURNING initial_qty,sold_qty,qty`, [before.id, companyId,supplierReturnedQty]);
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].qty, expectedQty);
    await db.query('COMMIT');
    const after = (await db.query('SELECT initial_qty,sold_qty,qty FROM items WHERE id=$1 AND company_id=$2', [before.id, companyId])).rows[0];
    assert.equal(after.qty, expectedQty);
    console.log(JSON.stringify({ barcode, backup: fileURLToPath(backup), before: { initial: before.initial_qty, sold: before.sold_qty, qty: before.qty }, after, applied: true }, null, 2));
  }
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally {
  db.release();
  await pool.end();
}
