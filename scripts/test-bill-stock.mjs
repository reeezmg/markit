#!/usr/bin/env node
/* eslint-disable no-console */
// End-to-end stock-integrity test harness for /api/bill/* endpoints.
// Hits the running storetools dev server, verifies items.qty / items.sold_qty
// after every create / update / delete / restore.

import pg from 'pg'
import crypto from 'node:crypto'

const { Pool } = pg

const DB_URL = process.env.TEST_DB_URL || 'postgresql://neondb_owner:npg_gHeLu8s2adzi@ep-orange-night-a1hei8bh-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
const API = process.env.TEST_API_BASE || 'http://localhost:3000'
const COMPANY_ID = '02856c86-60b8-41a4-ba18-79dbd55bf016' // Markit
const USER_ID = 'de505401-800f-4560-aba2-00571ea30e7c'

const ITEM_A = { id: 'bb447fde-67b7-42a9-be69-161873960f87', variantId: '9570628c-e774-4734-89fd-0183a422efbf', categoryId: '9dffcb35-8b51-4170-a9cd-74a835e7c6e2', name: 'Salwar-Ls1', barcode: '11A000002' }
const ITEM_B = { id: 'e9920cc6-0813-402d-8fd2-73eb22f55785', variantId: '84a3095a-64db-450c-bee3-ba2eca2932de', categoryId: '9dffcb35-8b51-4170-a9cd-74a835e7c6e2', name: 'Salwar-Ls1',  barcode: '11A000001' }
const ITEM_C = { id: '98ec7904-550e-4101-a886-6bf114d2cd5f', variantId: '8bcbe0f8-5043-4599-9dd7-edf5976e72b5', categoryId: '9dffcb35-8b51-4170-a9cd-74a835e7c6e2', name: '741',        barcode: '11A000018' }
const ITEM_D = { id: 'b950ad1a-2d95-467e-8fda-68680cc70b97', variantId: 'f3105759-4787-4607-ba33-a1f24bf9065f', categoryId: '8cca410e-04bf-41f2-90e8-62f5670b0132', name: 'Saree',      barcode: '11A000016' }

const TEST_CLIENT_ID = '457507cd-041d-455c-a32d-18d57ab8f132' // Reez
const TEST_COUPON_ID = '53ab6d53-bdd4-4574-a1d3-b54278542783' // Test50, audience_type=ALL

const pool = new Pool({ connectionString: DB_URL })

const RESULTS = []
const TEST_BILL_IDS = []

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
}

async function snapshot(itemIds) {
  const res = await pool.query(
    `SELECT id, qty, sold_qty FROM items WHERE id = ANY($1::text[])`,
    [itemIds],
  )
  return Object.fromEntries(res.rows.map((r) => [r.id, { qty: r.qty, sold_qty: r.sold_qty }]))
}

async function getBillCounter() {
  const r = await pool.query(
    `UPDATE companies SET bill_counter = bill_counter + 1 WHERE id = $1 RETURNING bill_counter`,
    [COMPANY_ID],
  )
  return r.rows[0].bill_counter
}

async function api(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!res.ok) {
    const msg = json?.statusMessage || json?.message || json?.raw || `HTTP ${res.status}`
    throw new Error(`${path}: ${msg}`)
  }
  return json
}

function buildEntry(item, qty, isReturn = false, rate = 100) {
  return {
    name: item.name,
    qty,
    rate,
    discount: 0,
    tax: 0,
    value: rate * qty,
    size: null,
    barcode: item.barcode,
    return: isReturn,
    variant: { connect: { id: item.variantId } },
    item:    { connect: { id: item.id } },
    category:{ connect: { id: item.categoryId } },
    companyUser: { connect: { companyId_userId: { companyId: COMPANY_ID, userId: USER_ID } } },
    userName: 'TEST',
  }
}

function buildItemRow(item, qty, isReturn = false, rate = 100, entryId = undefined) {
  const row = {
    id: item.id,
    variantId: item.variantId,
    barcode: item.barcode,
    name: item.name,
    qty,
    rate,
    discount: 0,
    tax: 0,
    value: rate * qty,
    return: isReturn,
    size: null,
    category: [{ id: item.categoryId }],
    userId: USER_ID,
    user: 'TEST',
  }
  if (entryId) row.entryId = entryId
  return row
}

async function createBill(rows, opts = {}) {
  const { clientId = null, billPoints = 0, redeemedPoints = 0, couponId = null, couponValue = 0 } = opts
  const billId = crypto.randomUUID()
  const invoiceNumber = await getBillCounter()
  const subtotal = rows.reduce((s, r) => s + r.qty * r.rate, 0)
  const grandTotal = subtotal
  const returnAmt = rows.filter((r) => r.return).reduce((s, r) => s + r.qty * r.rate, 0)

  const entries = rows.map((r) => buildEntry(r.item, r.qty, r.return, r.rate))
  const items = rows.map((r) => buildItemRow(r.item, r.qty, r.return, r.rate))
  const returnedItems = items.filter((i) => i.return)

  const payload = {
    invoiceNumber,
    subtotal,
    discount: 0,
    grandTotal,
    returnAmt,
    paymentMethod: 'Cash',
    redeemedPoints,
    billPoints,
    createdAt: new Date().toISOString(),
    paymentStatus: 'PAID',
    type: 'BILL',
    splitPayments: null,
    couponValue,
    company: { connect: { id: COMPANY_ID } },
    companyUser: { connect: { companyId_userId: { companyId: COMPANY_ID, userId: USER_ID } } },
    entries: { create: entries },
  }
  if (clientId) payload.client = { connect: { id: clientId } }

  const res = await api('/api/bill/create', {
    uuid: billId,
    payload,
    items,
    returnedItems,
    billPoints,
    clientId,
    companyId: COMPANY_ID,
    couponId,
    userId: USER_ID,
  })
  TEST_BILL_IDS.push(billId)
  return { billId, invoiceNumber, res }
}

async function getClientPoints(clientId) {
  const r = await pool.query(
    `SELECT points FROM company_clients WHERE company_id = $1 AND client_id = $2`,
    [COMPANY_ID, clientId],
  )
  return r.rows[0]?.points ?? 0
}

async function getCouponTimesUsed(couponId) {
  const r = await pool.query(`SELECT times_used FROM coupons WHERE id = $1`, [couponId])
  return Number(r.rows[0]?.times_used ?? 0)
}

async function getCouponUsageRow(billId) {
  const r = await pool.query(
    `SELECT id, coupon_id, client_id FROM coupon_usages WHERE bill_id = $1`,
    [billId],
  )
  return r.rows
}

async function getBillHistoryOps(billId) {
  const r = await pool.query(
    `SELECT operation, jsonb_array_length(data->'entries') AS entry_count,
            (data->>'deleted')::text AS old_deleted,
            (data->>'subtotal')::text AS old_subtotal
     FROM bill_history WHERE bill_id = $1 ORDER BY changed_at`,
    [billId],
  )
  return r.rows
}

async function updateBill(billId, rows, entriesToDelete = []) {
  const subtotal = rows.reduce((s, r) => s + r.qty * r.rate, 0)
  const grandTotal = subtotal
  const items = rows.map((r) => {
    const row = buildItemRow(r.item, r.qty, r.return, r.rate)
    if (r.entryId) row.entryId = r.entryId
    return row
  })
  return api('/api/bill/update', {
    items,
    entriesToDelete,
    billPoints: 0,
    billData: {
      id: billId,
      companyId: COMPANY_ID,
      subtotal,
      discount: 0,
      grandTotal,
      redeemedPoints: 0,
      couponValue: 0,
      paymentMethod: 'Cash',
      paymentStatus: 'PAID',
      splitPayments: null,
      accountId: null,
      clientId: null,
      date: new Date().toISOString(),
    },
  })
}

async function deleteBill(billId) {
  return api('/api/billSale/deleteBill', { billId, companyId: COMPANY_ID })
}

async function restoreBill(billId) {
  return api('/api/billSale/restoreBill', { billId, companyId: COMPANY_ID })
}

async function fetchEntriesForBill(billId) {
  const r = await pool.query(
    `SELECT id, item_id, qty, return FROM entries WHERE bill_id = $1`,
    [billId],
  )
  return r.rows
}

function diffSnap(before, after) {
  const out = {}
  for (const id of Object.keys(before)) {
    out[id] = {
      qty: after[id].qty - before[id].qty,
      sold_qty: after[id].sold_qty - before[id].sold_qty,
    }
  }
  return out
}

function expectDelta(actual, expected, label) {
  const ok = Object.keys(expected).every((id) =>
    actual[id]?.qty === expected[id].qty && actual[id]?.sold_qty === expected[id].sold_qty,
  )
  RESULTS.push({ label, ok, actual, expected })
  if (ok) {
    console.log(c.green('✓'), label)
  } else {
    console.log(c.red('✗'), label)
    console.log(c.dim('  expected'), expected)
    console.log(c.dim('  actual  '), actual)
  }
  return ok
}

async function run() {
  console.log(c.bold(`\nBill stock-integrity tests against ${API}\n`))

  const allItems = [ITEM_A.id, ITEM_B.id, ITEM_C.id, ITEM_D.id]
  const baseSnap = await snapshot(allItems)
  console.log(c.dim('Baseline:'), baseSnap, '\n')

  // --- Scenario 1: create sale qty=2 ---
  {
    const before = await snapshot([ITEM_A.id])
    const { billId } = await createBill([{ item: ITEM_A, qty: 2, return: false, rate: 100 }])
    const after = await snapshot([ITEM_A.id])
    expectDelta(diffSnap(before, after), { [ITEM_A.id]: { qty: -2, sold_qty: 2 } },
      'Create — sale qty=2 → qty -2, sold_qty +2')
    var bill1 = billId
  }

  // --- Scenario 2: create return qty=1 ---
  {
    const before = await snapshot([ITEM_B.id])
    const { billId } = await createBill([{ item: ITEM_B, qty: 1, return: true, rate: 100 }])
    const after = await snapshot([ITEM_B.id])
    expectDelta(diffSnap(before, after), { [ITEM_B.id]: { qty: 1, sold_qty: -1 } },
      'Create — return qty=1 → qty +1, sold_qty -1')
    var bill2 = billId
  }

  // --- Scenario 3: create sale + return mixed ---
  {
    const before = await snapshot([ITEM_C.id, ITEM_D.id])
    const { billId } = await createBill([
      { item: ITEM_C, qty: 1, return: false, rate: 100 },
      { item: ITEM_D, qty: 1, return: true,  rate: 100 },
    ])
    const after = await snapshot([ITEM_C.id, ITEM_D.id])
    expectDelta(diffSnap(before, after), {
      [ITEM_C.id]: { qty: -1, sold_qty:  1 },
      [ITEM_D.id]: { qty:  1, sold_qty: -1 },
    }, 'Create — mixed sale (C) + return (D)')
    var bill3 = billId
  }

  // --- Scenario 4: edit qty UP (2 → 4) ---
  {
    const { billId } = await createBill([{ item: ITEM_A, qty: 2, return: false, rate: 100 }])
    const before = await snapshot([ITEM_A.id])
    const entries = await fetchEntriesForBill(billId)
    await updateBill(billId, [{ item: ITEM_A, qty: 4, return: false, rate: 100, entryId: entries[0].id }])
    const after = await snapshot([ITEM_A.id])
    expectDelta(diffSnap(before, after), { [ITEM_A.id]: { qty: -2, sold_qty: 2 } },
      'Edit — qty up (2→4) → delta qty -2, sold_qty +2')
    var bill4 = billId
  }

  // --- Scenario 5: edit qty DOWN (3 → 1) ---
  {
    const { billId } = await createBill([{ item: ITEM_B, qty: 3, return: false, rate: 100 }])
    const before = await snapshot([ITEM_B.id])
    const entries = await fetchEntriesForBill(billId)
    await updateBill(billId, [{ item: ITEM_B, qty: 1, return: false, rate: 100, entryId: entries[0].id }])
    const after = await snapshot([ITEM_B.id])
    expectDelta(diffSnap(before, after), { [ITEM_B.id]: { qty: 2, sold_qty: -2 } },
      'Edit — qty down (3→1) → delta qty +2, sold_qty -2')
    var bill5 = billId
  }

  // --- Scenario 6: edit flip sale → return ---
  {
    const { billId } = await createBill([{ item: ITEM_C, qty: 1, return: false, rate: 100 }])
    const before = await snapshot([ITEM_C.id])
    const entries = await fetchEntriesForBill(billId)
    await updateBill(billId, [{ item: ITEM_C, qty: 1, return: true, rate: 100, entryId: entries[0].id }])
    const after = await snapshot([ITEM_C.id])
    expectDelta(diffSnap(before, after), { [ITEM_C.id]: { qty: 2, sold_qty: -2 } },
      'Edit — flip sale→return → delta qty +2, sold_qty -2')
    var bill6 = billId
  }

  // --- Scenario 7: edit flip return → sale ---
  {
    const { billId } = await createBill([{ item: ITEM_D, qty: 1, return: true, rate: 100 }])
    const before = await snapshot([ITEM_D.id])
    const entries = await fetchEntriesForBill(billId)
    await updateBill(billId, [{ item: ITEM_D, qty: 1, return: false, rate: 100, entryId: entries[0].id }])
    const after = await snapshot([ITEM_D.id])
    expectDelta(diffSnap(before, after), { [ITEM_D.id]: { qty: -2, sold_qty: 2 } },
      'Edit — flip return→sale → delta qty -2, sold_qty +2')
    var bill7 = billId
  }

  // --- Scenario 8: edit add a new entry ---
  {
    const { billId } = await createBill([{ item: ITEM_A, qty: 1, return: false, rate: 100 }])
    const before = await snapshot([ITEM_A.id, ITEM_B.id])
    const entries = await fetchEntriesForBill(billId)
    await updateBill(billId, [
      { item: ITEM_A, qty: 1, return: false, rate: 100, entryId: entries[0].id },
      { item: ITEM_B, qty: 2, return: false, rate: 100 }, // new
    ])
    const after = await snapshot([ITEM_A.id, ITEM_B.id])
    expectDelta(diffSnap(before, after), {
      [ITEM_A.id]: { qty:  0, sold_qty: 0 },
      [ITEM_B.id]: { qty: -2, sold_qty: 2 },
    }, 'Edit — add new entry on B (qty=2)')
    var bill8 = billId
  }

  // --- Scenario 9: edit delete an entry ---
  {
    const { billId } = await createBill([
      { item: ITEM_A, qty: 1, return: false, rate: 100 },
      { item: ITEM_B, qty: 1, return: false, rate: 100 },
    ])
    const before = await snapshot([ITEM_A.id, ITEM_B.id])
    const entries = await fetchEntriesForBill(billId)
    const keep = entries.find((e) => e.item_id === ITEM_A.id)
    const drop = entries.find((e) => e.item_id === ITEM_B.id)
    await updateBill(billId,
      [{ item: ITEM_A, qty: 1, return: false, rate: 100, entryId: keep.id }],
      [{ id: drop.id, itemId: drop.item_id, qty: drop.qty, return: drop.return }],
    )
    const after = await snapshot([ITEM_A.id, ITEM_B.id])
    expectDelta(diffSnap(before, after), {
      [ITEM_A.id]: { qty: 0, sold_qty:  0 },
      [ITEM_B.id]: { qty: 1, sold_qty: -1 },
    }, 'Edit — delete entry for B → reverses B effect')
    var bill9 = billId
  }

  // --- Scenario 10: soft-delete a sale-only bill ---
  {
    const { billId } = await createBill([{ item: ITEM_C, qty: 2, return: false, rate: 100 }])
    const before = await snapshot([ITEM_C.id])
    await deleteBill(billId)
    const after = await snapshot([ITEM_C.id])
    expectDelta(diffSnap(before, after), { [ITEM_C.id]: { qty: 2, sold_qty: -2 } },
      'Soft-delete — sale-only bill reverses qty +2, sold_qty -2')
    var bill10 = billId
  }

  // --- Scenario 11: soft-delete a sale+return bill ---
  {
    const { billId } = await createBill([
      { item: ITEM_C, qty: 1, return: false, rate: 100 },
      { item: ITEM_D, qty: 1, return: true,  rate: 100 },
    ])
    const before = await snapshot([ITEM_C.id, ITEM_D.id])
    await deleteBill(billId)
    const after = await snapshot([ITEM_C.id, ITEM_D.id])
    expectDelta(diffSnap(before, after), {
      [ITEM_C.id]: { qty:  1, sold_qty: -1 },
      [ITEM_D.id]: { qty: -1, sold_qty:  1 },
    }, 'Soft-delete — sale+return bill reverses both')
    var bill11 = billId
  }

  // --- Scenario 12: restore a soft-deleted bill ---
  {
    const before = await snapshot([ITEM_C.id, ITEM_D.id])
    await restoreBill(bill11)
    const after = await snapshot([ITEM_C.id, ITEM_D.id])
    expectDelta(diffSnap(before, after), {
      [ITEM_C.id]: { qty: -1, sold_qty:  1 },
      [ITEM_D.id]: { qty:  1, sold_qty: -1 },
    }, 'Restore — re-applies sale+return effects')
  }

  // --- Scenario 13: create bill with client + billPoints earns points ---
  let bill13
  {
    const before = await getClientPoints(TEST_CLIENT_ID)
    const { billId } = await createBill(
      [{ item: ITEM_A, qty: 1, return: false, rate: 100 }],
      { clientId: TEST_CLIENT_ID, billPoints: 5, redeemedPoints: 0 },
    )
    const after = await getClientPoints(TEST_CLIENT_ID)
    const ok = after - before === 5
    RESULTS.push({ label: 'Create — client billPoints +5 → points +5', ok })
    console.log(ok ? c.green('✓') : c.red('✗'), `Create — client billPoints +5 → points +5  (before=${before}, after=${after})`)
    bill13 = billId
  }

  // --- Scenario 14: soft-delete reverses client points ---
  {
    const before = await getClientPoints(TEST_CLIENT_ID)
    await deleteBill(bill13)
    const after = await getClientPoints(TEST_CLIENT_ID)
    const ok = after - before === -5
    RESULTS.push({ label: 'Soft-delete — client points reversed (-5)', ok })
    console.log(ok ? c.green('✓') : c.red('✗'), `Soft-delete — client points reversed -5  (before=${before}, after=${after})`)
  }

  // --- Scenario 15: restore re-applies client points ---
  {
    const before = await getClientPoints(TEST_CLIENT_ID)
    await restoreBill(bill13)
    const after = await getClientPoints(TEST_CLIENT_ID)
    const ok = after - before === 5
    RESULTS.push({ label: 'Restore — client points re-applied (+5)', ok })
    console.log(ok ? c.green('✓') : c.red('✗'), `Restore — client points re-applied +5  (before=${before}, after=${after})`)
  }

  // --- Scenario 16: create bill with coupon → coupons.times_used +1 ---
  let bill16
  {
    const before = await getCouponTimesUsed(TEST_COUPON_ID)
    const { billId } = await createBill(
      [{ item: ITEM_C, qty: 1, return: false, rate: 100 }],
      { clientId: TEST_CLIENT_ID, couponId: TEST_COUPON_ID, couponValue: 50 },
    )
    const after = await getCouponTimesUsed(TEST_COUPON_ID)
    const usages = await getCouponUsageRow(billId)
    const ok = after - before === 1 && usages.length === 1
    RESULTS.push({ label: 'Create with coupon — times_used +1, usage row inserted', ok })
    console.log(ok ? c.green('✓') : c.red('✗'),
      `Create with coupon  (times_used: ${before}→${after}, usages=${usages.length})`)
    bill16 = billId
  }

  // --- Scenario 17: soft-delete reverses coupon usage ---
  {
    const before = await getCouponTimesUsed(TEST_COUPON_ID)
    await deleteBill(bill16)
    const after = await getCouponTimesUsed(TEST_COUPON_ID)
    const usages = await getCouponUsageRow(bill16)
    const ok = after - before === -1 && usages.length === 1 // usages preserved
    RESULTS.push({ label: 'Soft-delete — coupon times_used -1, usage row preserved', ok })
    console.log(ok ? c.green('✓') : c.red('✗'),
      `Soft-delete coupon  (times_used: ${before}→${after}, usages=${usages.length})`)
  }

  // --- Scenario 18: restore re-applies coupon usage ---
  {
    const before = await getCouponTimesUsed(TEST_COUPON_ID)
    await restoreBill(bill16)
    const after = await getCouponTimesUsed(TEST_COUPON_ID)
    const ok = after - before === 1
    RESULTS.push({ label: 'Restore — coupon times_used +1', ok })
    console.log(ok ? c.green('✓') : c.red('✗'),
      `Restore coupon      (times_used: ${before}→${after})`)
  }

  // --- Scenario 19: bill_history captures correct OLD entries on edit ---
  {
    const { billId } = await createBill([{ item: ITEM_A, qty: 2, return: false, rate: 100 }])
    const entries = await fetchEntriesForBill(billId)
    // Edit: change qty 2 → 5
    await updateBill(billId, [{ item: ITEM_A, qty: 5, return: false, rate: 100, entryId: entries[0].id }])
    const ops = await getBillHistoryOps(billId)
    // Expect: 1 history row, op=UPDATE, entry_count=1, snapshot subtotal reflects qty=2 not qty=5
    const updateRow = ops.find((r) => r.operation === 'UPDATE')
    const ok = ops.length === 1 && !!updateRow && updateRow.entry_count === 1 && Number(updateRow.old_subtotal) === 200
    RESULTS.push({ label: 'Edit — bill_history captures OLD bill+entries (subtotal=200, not 500)', ok })
    console.log(ok ? c.green('✓') : c.red('✗'),
      `Edit history snapshot  (rows=${ops.length}, op=${updateRow?.operation}, entries=${updateRow?.entry_count}, old_subtotal=${updateRow?.old_subtotal})`)
  }

  // --- Scenario 20: bill_history records DELETED op on soft-delete ---
  {
    const { billId } = await createBill([{ item: ITEM_B, qty: 1, return: false, rate: 100 }])
    await deleteBill(billId)
    const ops = await getBillHistoryOps(billId)
    const ok = ops.some((r) => r.operation === 'DELETED')
    RESULTS.push({ label: 'Soft-delete — bill_history op=DELETED recorded', ok })
    console.log(ok ? c.green('✓') : c.red('✗'),
      `Delete history snapshot  (ops=${ops.map((r) => r.operation).join(',')})`)
    var bill20 = billId
  }

  // --- Scenario 21: bill_history records RESTORED op on restore ---
  {
    await restoreBill(bill20)
    const ops = await getBillHistoryOps(bill20)
    const ok = ops.some((r) => r.operation === 'RESTORED')
    RESULTS.push({ label: 'Restore — bill_history op=RESTORED recorded', ok })
    console.log(ok ? c.green('✓') : c.red('✗'),
      `Restore history snapshot  (ops=${ops.map((r) => r.operation).join(',')})`)
  }

  // --- Final summary ---
  const passed = RESULTS.filter((r) => r.ok).length
  const failed = RESULTS.length - passed
  console.log()
  console.log(c.bold(`Summary: ${passed}/${RESULTS.length} passed${failed ? c.red(`, ${failed} failed`) : ''}`))

  // --- Final cleanup pass: soft-delete every test bill that is still alive ---
  console.log(c.dim('\nCleanup: soft-deleting all test bills...'))
  for (const id of TEST_BILL_IDS) {
    try {
      const r = await pool.query(`SELECT deleted FROM bills WHERE id = $1`, [id])
      if (r.rowCount && !r.rows[0].deleted) {
        await deleteBill(id)
        console.log(c.dim(`  cleaned ${id}`))
      }
    } catch (e) {
      console.log(c.yellow(`  failed to clean ${id}: ${e.message}`))
    }
  }

  await pool.end()
  process.exit(failed ? 1 : 0)
}

run().catch(async (err) => {
  console.error(c.red('FATAL:'), err)
  try { await pool.end() } catch {}
  process.exit(2)
})
