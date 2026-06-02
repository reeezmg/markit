#!/usr/bin/env node
/* eslint-disable no-console */
// Integrity check for the raw-SQL purchase-order save/update flow (financial).
// Mirrors server/api/purchaseorder/{save,update}. All wrapped in BEGIN..ROLLBACK.

import pg from 'pg'
import crypto from 'node:crypto'

const { Pool } = pg
const DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_gHeLu8s2adzi@ep-orange-night-a1hei8bh-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
const COMPANY_ID = '02856c86-60b8-41a4-ba18-79dbd55bf016'
const CATEGORY_ID = '9dffcb35-8b51-4170-a9cd-74a835e7c6e2'
let DISTRIBUTOR_ID = null // resolved at runtime for COMPANY_ID

const pool = new Pool({ connectionString: DB_URL })
const green = (s) => `\x1b[32m${s}\x1b[0m`, red = (s) => `\x1b[31m${s}\x1b[0m`
let pass = 0, fail = 0
const assert = (c, l) => { if (c) { pass++; console.log(green('✓'), l) } else { fail++; console.log(red('✗'), l) } }

async function makeProducts(client, n) {
  const ids = []
  for (let i = 0; i < n; i++) {
    const id = crypto.randomUUID()
    await client.query(
      `INSERT INTO products (id,name,status,company_id,category_id,created_at,updated_at) VALUES ($1,$2,true,$3,$4,now(),now())`,
      [id, `POprod${i}`, COMPANY_ID, CATEGORY_ID],
    )
    ids.push(id)
  }
  return ids
}

async function saveFlow(client, productIds, payment) {
  const poId = crypto.randomUUID()
  const counter = (await client.query(`UPDATE companies SET purchase_counter=purchase_counter+1 WHERE id=$1 RETURNING purchase_counter`, [COMPANY_ID])).rows[0].purchase_counter
  const poNo = counter - 1
  await client.query(
    `INSERT INTO purchase_orders (id,created_at,updated_at,company_id,payment_type,total_amount,distributor_id,bill_no,adjustment,discount,tax,subtotal_amount,purchase_order_no)
     VALUES ($1,now(),now(),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [poId, COMPANY_ID, payment.paymentType || null, payment.totalAmount || 0, payment.distributorId || null, payment.billNo || null, 0, 0, 0, payment.totalAmount || 0, poNo],
  )
  if (productIds.length) await client.query(`UPDATE products SET purchaseorder_id=$1, updated_at=now() WHERE id=ANY($2::text[]) AND company_id=$3`, [poId, productIds, COMPANY_ID])
  if (payment.paymentType && payment.distributorId) {
    if (payment.paymentType === 'CREDIT') await client.query(`INSERT INTO distributor_credits (id,created_at,amount,"billNo",distributor_id,company_id,purchase_order_id) VALUES ($1,now(),$2,$3,$4,$5,$6)`, [crypto.randomUUID(), payment.totalAmount || 0, payment.billNo || null, payment.distributorId, COMPANY_ID, poId])
    else await client.query(`INSERT INTO distributor_payments (id,created_at,amount,payment_type,distributor_id,company_id,purchase_order_id) VALUES ($1,now(),$2,$3,$4,$5,$6)`, [crypto.randomUUID(), payment.totalAmount || 0, payment.paymentType, payment.distributorId, COMPANY_ID, poId])
  }
  return { poId, poNo, counter }
}

async function updateFlow(client, poId, p) {
  const newType = p.paymentType || null, oldType = p.oldPaymentType || null
  const isNewCredit = newType === 'CREDIT', wasOldCredit = oldType === 'CREDIT'
  const hasNew = newType !== null, hasOld = oldType !== null
  const insCredit = () => client.query(`INSERT INTO distributor_credits (id,created_at,amount,"billNo",distributor_id,company_id,purchase_order_id) VALUES ($1,now(),$2,$3,$4,$5,$6)`, [crypto.randomUUID(), p.totalAmount || 0, p.billNo || null, p.distributorId, COMPANY_ID, poId])
  const insPay = () => client.query(`INSERT INTO distributor_payments (id,created_at,amount,payment_type,distributor_id,company_id,purchase_order_id) VALUES ($1,now(),$2,$3,$4,$5,$6)`, [crypto.randomUUID(), p.totalAmount || 0, newType, p.distributorId, COMPANY_ID, poId])
  if (hasNew && !hasOld) { if (isNewCredit) await insCredit(); else await insPay() }
  else if (!hasNew && hasOld) { if (wasOldCredit) await client.query(`DELETE FROM distributor_credits WHERE purchase_order_id=$1`, [poId]); else await client.query(`DELETE FROM distributor_payments WHERE purchase_order_id=$1`, [poId]) }
  else if (isNewCredit && wasOldCredit) await client.query(`UPDATE distributor_credits SET amount=$2,"billNo"=$3,created_at=now() WHERE purchase_order_id=$1`, [poId, p.totalAmount || 0, p.billNo || null])
  else if (!isNewCredit && wasOldCredit) { await client.query(`DELETE FROM distributor_credits WHERE purchase_order_id=$1`, [poId]); if (hasNew) await insPay() }
  else if (!isNewCredit && !wasOldCredit && hasNew) await client.query(`UPDATE distributor_payments SET amount=$2,payment_type=$3,created_at=now() WHERE purchase_order_id=$1`, [poId, p.totalAmount || 0, newType])
  else if (isNewCredit && !wasOldCredit) { await client.query(`DELETE FROM distributor_payments WHERE purchase_order_id=$1`, [poId]); await insCredit() }
  await client.query(`UPDATE purchase_orders SET payment_type=$2,total_amount=$3,updated_at=now() WHERE id=$1 AND company_id=$4`, [poId, newType, p.totalAmount || 0, COMPANY_ID])
}

const cnt = async (client, tbl, poId) => Number((await client.query(`SELECT count(*) FROM ${tbl} WHERE purchase_order_id=$1`, [poId])).rows[0].count)

async function run() {
  DISTRIBUTOR_ID = (await pool.query(`SELECT distributor_id FROM distributor_companies WHERE company_id=$1 LIMIT 1`, [COMPANY_ID])).rows[0]?.distributor_id
  if (!DISTRIBUTOR_ID) { console.log(red('No distributor linked to COMPANY_ID — cannot run PO financial test')); await pool.end(); process.exit(2) }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const beforeCounter = (await client.query(`SELECT purchase_counter FROM companies WHERE id=$1`, [COMPANY_ID])).rows[0].purchase_counter

    const productIds = await makeProducts(client, 2)
    const { poId, poNo } = await saveFlow(client, productIds, { paymentType: 'CREDIT', distributorId: DISTRIBUTOR_ID, totalAmount: 500, billNo: 'B1' })

    assert(poNo === beforeCounter, `save → PO number = counter-before (${poNo} == ${beforeCounter})`)
    const afterCounter = (await client.query(`SELECT purchase_counter FROM companies WHERE id=$1`, [COMPANY_ID])).rows[0].purchase_counter
    assert(afterCounter === beforeCounter + 1, 'save → purchase_counter incremented by 1')
    const linked = Number((await client.query(`SELECT count(*) FROM products WHERE purchaseorder_id=$1`, [poId])).rows[0].count)
    assert(linked === 2, 'save → 2 products linked to PO')
    assert((await cnt(client, 'distributor_credits', poId)) === 1, 'save CREDIT → 1 distributor_credit')
    assert((await cnt(client, 'distributor_payments', poId)) === 0, 'save CREDIT → 0 distributor_payment')

    await updateFlow(client, poId, { paymentType: 'CASH', oldPaymentType: 'CREDIT', distributorId: DISTRIBUTOR_ID, totalAmount: 500 })
    assert((await cnt(client, 'distributor_credits', poId)) === 0, 'CREDIT→CASH → credit removed')
    assert((await cnt(client, 'distributor_payments', poId)) === 1, 'CREDIT→CASH → payment created')

    await updateFlow(client, poId, { paymentType: 'CREDIT', oldPaymentType: 'CASH', distributorId: DISTRIBUTOR_ID, totalAmount: 700, billNo: 'B2' })
    assert((await cnt(client, 'distributor_payments', poId)) === 0, 'CASH→CREDIT → payment removed')
    assert((await cnt(client, 'distributor_credits', poId)) === 1, 'CASH→CREDIT → credit created')
    const amt = Number((await client.query(`SELECT amount FROM distributor_credits WHERE purchase_order_id=$1`, [poId])).rows[0].amount)
    assert(amt === 700, 'CASH→CREDIT → credit amount 700')

    await updateFlow(client, poId, { paymentType: 'CREDIT', oldPaymentType: 'CREDIT', distributorId: DISTRIBUTOR_ID, totalAmount: 900, billNo: 'B3' })
    const amt2 = Number((await client.query(`SELECT amount FROM distributor_credits WHERE purchase_order_id=$1`, [poId])).rows[0].amount)
    assert(amt2 === 900 && (await cnt(client, 'distributor_credits', poId)) === 1, 'CREDIT→CREDIT → amount updated to 900, still 1 row')

    await client.query('ROLLBACK')
  } catch (e) { fail++; console.log(red('✗ threw:'), e.message); try { await client.query('ROLLBACK') } catch {} } finally { client.release() }
  console.log(`\nSummary: ${pass} passed, ${fail} failed  (all rolled back)\n`)
  await pool.end()
  process.exit(fail ? 1 : 0)
}
run().catch(async (e) => { console.error('FATAL:', e); try { await pool.end() } catch {} ; process.exit(2) })
