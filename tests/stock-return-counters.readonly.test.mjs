import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Evaluate the actual SET expressions over VALUES, without writing any database rows.
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query('BEGIN READ ONLY');
  for (const file of ['server/api/bill/offline.post.ts', 'server/utils/ecomm-order-cancel.ts', 'server/utils/accountant/ecommerce.ts']) {
    const sql = [...readFileSync(file, 'utf8').matchAll(/UPDATE items\s+SET\s+qty\s*=([\s\S]*?),\s*sold_qty\s*=([\s\S]*?),\s*updated_at/g)];
    assert.ok(sql.length, file);
    for (const [, qty, sold] of sql) {
      for (const before of [[10, 0], [8, 2], [11, -1]]) {
        const after = (await db.query(`SELECT ${qty} AS qty, ${sold} AS sold FROM (VALUES ($2::int,$3::int)) AS items(qty,sold_qty)`, [3, ...before])).rows[0];
        assert.equal(after.qty + after.sold, before[0] + before[1], `${file}: equal opposite changes even when a return exceeds recorded sold`);
        assert.equal(Math.abs(after.qty - before[0]), 3);
        assert.equal(Math.abs(after.sold - before[1]), 3);
      }
    }
  }
  await db.query('ROLLBACK');
  console.log('Actual offline/cancellation/ecommerce stock expressions preserve the quantity invariant, including net returns. Read-only SQL only.');
} finally { await db.end(); }
