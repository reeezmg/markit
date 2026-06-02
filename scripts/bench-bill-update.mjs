#!/usr/bin/env node
/* eslint-disable no-console */
// Benchmark: old (per-row) vs new (batched) bill-UPDATE (edit) SQL across entry counts.
// Each run: BEGIN -> seed a bill with N entries (NOT timed) -> time the edit of all N
// entries (qty 1->2) -> ROLLBACK. Nothing persists.

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

// Seed a bill + N entries (qty=1 sales). Returns { billId, entries:[{id,item}] }. NOT timed.
async function seed(client, n) {
  const billId = crypto.randomUUID()
  await client.query(
    `INSERT INTO bills (id, invoice_number, subtotal, discount, grand_total, return_amt, payment_method,
       redeemed_points, bill_points, created_at, payment_status, type, split_payments, company_id,
       account_id, client_id, user_id, updated_at, coupon_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),$18)`,
    [billId, null, 0, 0, 0, 0, 'Cash', 0, 0, new Date().toISOString(), 'PAID', 'BILL', null, COMPANY_ID, null, null, USER_ID, 0],
  )
  const vals = []
  const ph = []
  for (let i = 0; i < n; i++) {
    const item = ITEMS[i % ITEMS.length]
    const base = i * ENTRY_COLS
    vals.push(crypto.randomUUID(), item.name, 1, 100, 0, 0, 100, null, item.barcode, false,
              item.variantId, item.id, item.categoryId, COMPANY_ID, USER_ID, billId, 'BENCH')
    ph.push(`(${Array.from({ length: ENTRY_COLS }, (_, k) => `$${base + k + 1}`).join(',')})`)
  }
  const res = await client.query(`${ENTRY_SQL} VALUES ${ph.join(',')} RETURNING id, item_id`, vals)
  const entries = res.rows.map((row, i) => ({ id: row.id, item: ITEMS[i % ITEMS.length] }))
  return { billId, entries }
}

async function billHeaderUpdate(client, billId) {
  // representative header write (fires trigger_bill_update -> bill_history)
  return client.query(
    `UPDATE bills SET subtotal=$2, grand_total=$3, updated_at=now() WHERE id=$1`,
    [billId, 200, 200],
  )
}

// ---- OLD edit: header + per entry (SELECT old, reverse stock, apply stock, UPDATE entry) ----
async function runOld(client, billId, entries) {
  await billHeaderUpdate(client, billId)
  for (const e of entries) {
    const old = (await client.query(`SELECT qty, return, item_id FROM entries WHERE id=$1`, [e.id])).rows[0]
    if (old?.item_id) {
      const oq = Number(old.qty)
      if (old.return) await client.query(`UPDATE items SET sold_qty=COALESCE(sold_qty,0)+$1, qty=COALESCE(qty,0)-$1 WHERE id=$2`, [oq, old.item_id])
      else await client.query(`UPDATE items SET sold_qty=COALESCE(sold_qty,0)-$1, qty=COALESCE(qty,0)+$1 WHERE id=$2`, [oq, old.item_id])
    }
    const newQty = 2
    await client.query(`UPDATE items SET sold_qty=COALESCE(sold_qty,0)+$1, qty=COALESCE(qty,0)-$1 WHERE id=$2`, [newQty, e.item.id])
    await client.query(
      `UPDATE entries SET company_id=$2, barcode=$3, qty=$4, rate=$5, name=$6, discount=$7, tax=$8,
         value=$9, return=$10, variant_id=$11, category_id=$12, item_id=$13, user_id=$14, user_name=$15 WHERE id=$1`,
      [e.id, COMPANY_ID, e.item.barcode, newQty, 100, e.item.name, 0, 0, 200, false, e.item.variantId, e.item.categoryId, e.item.id, USER_ID, 'BENCH'],
    )
  }
}

// ---- NEW edit: header + batched SELECT + bulk entry UPDATE + bulk stock UPDATE ----
async function runNew(client, billId, entries) {
  await billHeaderUpdate(client, billId)
  const ids = entries.map((e) => e.id)
  await client.query(`SELECT id, qty, return, item_id FROM entries WHERE id = ANY($1::text[])`, [ids])

  const eid = [], comp = [], bc = [], qty = [], rate = [], name = [], disc = [], tax = [], val = [], ret = [], vid = [], cid = [], iid = [], uid = [], uname = []
  for (const e of entries) {
    eid.push(e.id); comp.push(COMPANY_ID); bc.push(e.item.barcode); qty.push(2); rate.push(100); name.push(e.item.name)
    disc.push(0); tax.push(0); val.push(200); ret.push(false); vid.push(e.item.variantId); cid.push(e.item.categoryId)
    iid.push(e.item.id); uid.push(USER_ID); uname.push('BENCH')
  }
  await client.query(
    `UPDATE entries AS e SET company_id=u.company_id, barcode=u.barcode, qty=u.qty, rate=u.rate, name=u.name,
       discount=u.discount, tax=u.tax, value=u.value, return=u.return, variant_id=u.variant_id,
       category_id=u.category_id, item_id=u.item_id, user_id=u.user_id, user_name=u.user_name
     FROM unnest($1::text[],$2::text[],$3::text[],$4::float8[],$5::float8[],$6::text[],$7::float8[],$8::float8[],
                 $9::float8[],$10::bool[],$11::text[],$12::text[],$13::text[],$14::text[],$15::text[])
       AS u(id,company_id,barcode,qty,rate,name,discount,tax,value,return,variant_id,category_id,item_id,user_id,user_name)
     WHERE e.id=u.id`,
    [eid, comp, bc, qty, rate, name, disc, tax, val, ret, vid, cid, iid, uid, uname],
  )

  // qty 1->2 sale: reverse old (sold-1,qty+1) + apply new (sold+2,qty-2) => net sold+1, qty-1 per item
  const m = new Map()
  for (const e of entries) {
    const cur = m.get(e.item.id) || { sold: 0, qty: 0 }
    cur.sold += 1; cur.qty += -1
    m.set(e.item.id, cur)
  }
  const sids = [], sd = [], qd = []
  for (const [id, d] of m) { sids.push(id); sd.push(d.sold); qd.push(d.qty) }
  await client.query(
    `UPDATE items AS i SET sold_qty=COALESCE(i.sold_qty,0)+u.sold_delta, qty=COALESCE(i.qty,0)+u.qty_delta
     FROM unnest($1::text[], $2::numeric[], $3::numeric[]) AS u(id, sold_delta, qty_delta) WHERE i.id=u.id`,
    [sids, sd, qd],
  )
}

async function timeEdit(fn, n) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { billId, entries } = await seed(client, n)
    const t0 = process.hrtime.bigint()
    await fn(client, billId, entries)
    const t1 = process.hrtime.bigint()
    await client.query('ROLLBACK')
    return Number(t1 - t0) / 1e6
  } finally {
    client.release()
  }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

async function run() {
  const Ns = [1, 5, 10, 25, 50]
  const ITER = 3
  await timeEdit(runNew, 1); await timeEdit(runOld, 1) // warmup

  console.log('\n  N  | round-trips (old→new) |   OLD ms |   NEW ms | speedup')
  console.log(' ----+-----------------------+----------+----------+--------')
  for (const n of Ns) {
    const oldT = [], newT = []
    for (let i = 0; i < ITER; i++) {
      oldT.push(await timeEdit(runOld, n))
      newT.push(await timeEdit(runNew, n))
    }
    const o = median(oldT), nw = median(newT)
    const oldRT = 1 + 4 * n // header + 4 per edited entry
    console.log(`${String(n).padStart(4)} | ${String(oldRT).padStart(8)} → 4        | ${o.toFixed(1).padStart(8)} | ${nw.toFixed(1).padStart(8)} | ${(o / nw).toFixed(1)}x`)
  }
  console.log('\n(every run rolled back — nothing persisted)\n')
  await pool.end()
}

run().catch(async (e) => { console.error('FATAL:', e); try { await pool.end() } catch {} ; process.exit(1) })
