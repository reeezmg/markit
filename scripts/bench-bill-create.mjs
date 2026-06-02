#!/usr/bin/env node
/* eslint-disable no-console */
// Benchmark: old (per-row) vs new (batched) bill-create SQL across entry counts.
// Every run is wrapped in BEGIN ... ROLLBACK — nothing is persisted (no bills,
// no stock change, no invoice numbers consumed; the trigger increment rolls back).

import pg from 'pg'
import crypto from 'node:crypto'

const { Pool } = pg
const DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_gHeLu8s2adzi@ep-orange-night-a1hei8bh-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
const COMPANY_ID = '02856c86-60b8-41a4-ba18-79dbd55bf016'
const USER_ID = 'de505401-800f-4560-aba2-00571ea30e7c'

const ITEMS = [
  { id: 'bb447fde-67b7-42a9-be69-161873960f87', variantId: '9570628c-e774-4734-89fd-0183a422efbf', categoryId: '9dffcb35-8b51-4170-a9cd-74a835e7c6e2', name: 'Salwar-Ls1', barcode: '11A000002' },
  { id: 'e9920cc6-0813-402d-8fd2-73eb22f55785', variantId: '84a3095a-64db-450c-bee3-ba2eca2932de', categoryId: '9dffcb35-8b51-4170-a9cd-74a835e7c6e2', name: 'Salwar-Ls1', barcode: '11A000001' },
  { id: '98ec7904-550e-4101-a886-6bf114d2cd5f', variantId: '8bcbe0f8-5043-4599-9dd7-edf5976e72b5', categoryId: '9dffcb35-8b51-4170-a9cd-74a835e7c6e2', name: '741', barcode: '11A000018' },
  { id: 'b950ad1a-2d95-467e-8fda-68680cc70b97', variantId: 'f3105759-4787-4607-ba33-a1f24bf9065f', categoryId: '8cca410e-04bf-41f2-90e8-62f5670b0132', name: 'Saree', barcode: '11A000016' },
]

const pool = new Pool({ connectionString: DB_URL })

const ENTRY_COLS = 17
const ENTRY_SQL = `INSERT INTO entries (id, name, qty, rate, discount, tax, value, size, barcode, return, variant_id, item_id, category_id, company_id, user_id, bill_id, user_name)`

function buildRows(n) {
  const rows = []
  for (let i = 0; i < n; i++) rows.push({ item: ITEMS[i % ITEMS.length], qty: 1, rate: 100, return: false })
  return rows
}

async function insertBill(client, billId) {
  // Same columns as create.post.ts; invoice_number null (trigger assigns it), RETURNING reads it back
  return client.query(
    `INSERT INTO bills (
       id, invoice_number, subtotal, discount, grand_total, return_amt,
       payment_method, redeemed_points, bill_points, created_at,
       payment_status, type, split_payments, company_id, account_id,
       client_id, user_id, updated_at, coupon_value
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),$18)
     RETURNING invoice_number`,
    [billId, null, 0, 0, 0, 0, 'Cash', 0, 0, new Date().toISOString(), 'PAID', 'BILL', null, COMPANY_ID, null, null, USER_ID, 0],
  )
}

function entryParams(r, billId) {
  return [crypto.randomUUID(), r.item.name, r.qty, r.rate, 0, 0, r.rate * r.qty, null, r.item.barcode, r.return,
          r.item.variantId, r.item.id, r.item.categoryId, COMPANY_ID, USER_ID, billId, 'BENCH']
}

// ---- NEW: 1 bill insert + 1 multi-row entries insert + 1 bulk stock update ----
async function runNew(client, rows, billId) {
  await insertBill(client, billId)

  const vals = []
  const ph = rows.map((r, i) => {
    const base = i * ENTRY_COLS
    vals.push(...entryParams(r, billId))
    return `(${Array.from({ length: ENTRY_COLS }, (_, k) => `$${base + k + 1}`).join(',')})`
  })
  await client.query(`${ENTRY_SQL} VALUES ${ph.join(',')}`, vals)

  const m = new Map()
  for (const r of rows) {
    if (r.return || !r.item.id) continue
    const cur = m.get(r.item.id) || { sold: 0, qty: 0 }
    cur.sold += r.item.variantId ? r.qty : 0
    cur.qty += -r.qty
    m.set(r.item.id, cur)
  }
  if (m.size) {
    const ids = [], sd = [], qd = []
    for (const [id, d] of m) { ids.push(id); sd.push(d.sold); qd.push(d.qty) }
    await client.query(
      `UPDATE items AS i SET sold_qty = COALESCE(i.sold_qty,0)+u.sold_delta, qty = COALESCE(i.qty,0)+u.qty_delta
       FROM unnest($1::text[], $2::int[], $3::int[]) AS u(id, sold_delta, qty_delta) WHERE i.id = u.id`,
      [ids, sd, qd],
    )
  }
}

// ---- OLD: 1 bill insert + N entry inserts + up to 2 stock updates per row ----
async function runOld(client, rows, billId) {
  await insertBill(client, billId)

  for (const r of rows) {
    await client.query(`${ENTRY_SQL} VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, entryParams(r, billId))
  }
  for (const r of rows) {
    if (!r.return) {
      if (r.item.variantId) await client.query(`UPDATE items SET sold_qty = COALESCE(sold_qty,0)+$1 WHERE id=$2`, [r.qty, r.item.id])
      if (r.item.id) await client.query(`UPDATE items SET qty = COALESCE(qty,0)-$1 WHERE id=$2`, [r.qty, r.item.id])
    } else {
      if (r.item.variantId) await client.query(`UPDATE items SET sold_qty = COALESCE(sold_qty,0)-$1 WHERE id=$2`, [r.qty, r.item.id])
      if (r.item.id) await client.query(`UPDATE items SET qty = COALESCE(qty,0)+$1 WHERE id=$2`, [r.qty, r.item.id])
    }
  }
}

async function timeIt(fn, rows) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const t0 = process.hrtime.bigint()
    await fn(client, rows, crypto.randomUUID())
    const t1 = process.hrtime.bigint()
    await client.query('ROLLBACK')
    return Number(t1 - t0) / 1e6
  } finally {
    client.release()
  }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

async function run() {
  const Ns = [1, 5, 10, 25, 50, 100]
  const ITER = 4
  // warm up the pool / plan caches (not measured)
  await timeIt(runNew, buildRows(1))
  await timeIt(runOld, buildRows(1))

  console.log('\n  N  | round-trips (old→new) |   OLD ms |   NEW ms | speedup')
  console.log(' ----+-----------------------+----------+----------+--------')
  for (const n of Ns) {
    const rows = buildRows(n)
    const oldT = [], newT = []
    for (let i = 0; i < ITER; i++) {
      oldT.push(await timeIt(runOld, rows))
      newT.push(await timeIt(runNew, rows))
    }
    const o = median(oldT), nw = median(newT)
    const oldRT = 1 + n + 2 * n // bill + N entry inserts + 2N stock updates
    const row = `${String(n).padStart(4)} | ${String(oldRT).padStart(8)} → 3        | ${o.toFixed(1).padStart(8)} | ${nw.toFixed(1).padStart(8)} | ${(o / nw).toFixed(1)}x`
    console.log(row)
  }
  console.log('\n(every run rolled back — nothing persisted)\n')
  await pool.end()
}

run().catch(async (e) => { console.error('FATAL:', e); try { await pool.end() } catch {} ; process.exit(1) })
