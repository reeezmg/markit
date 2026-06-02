#!/usr/bin/env node
/* eslint-disable no-console */
// Integrity check for the deferred batch save (server/api/products/save-batch).
// 2 products x 2 variants x 2 items + a CREDIT purchase order, in one transaction.
// Wrapped in BEGIN..ROLLBACK — nothing persists.

import pg from 'pg'
import crypto from 'node:crypto'

const { Pool } = pg
const DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_gHeLu8s2adzi@ep-orange-night-a1hei8bh-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
const COMPANY_ID = '02856c86-60b8-41a4-ba18-79dbd55bf016'
const CATEGORY_ID = '9dffcb35-8b51-4170-a9cd-74a835e7c6e2'

const pool = new Pool({ connectionString: DB_URL })
const green = (s) => `\x1b[32m${s}\x1b[0m`, red = (s) => `\x1b[31m${s}\x1b[0m`
let pass = 0, fail = 0
const assert = (c, l) => { if (c) { pass++; console.log(green('✓'), l) } else { fail++; console.log(red('✗'), l) } }

function multiRow(rows, literals) {
  const flat = [], cols = rows[0].length
  const tuples = rows.map((row, i) => {
    const base = i * cols
    row.forEach((v) => flat.push(v))
    const ph = Array.from({ length: cols }, (_, k) => `$${base + k + 1}`).join(',')
    return `(${ph}${literals ? ',' + literals : ''})`
  })
  return { sql: tuples.join(','), params: flat }
}

function buildProducts(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: crypto.randomUUID(), name: `BatchP${i}`, brandId: null, description: 'd', status: true,
    categoryId: CATEGORY_ID, subcategoryId: null, deliveryType: 'trynbuy', categoryTax: null,
    variants: Array.from({ length: 2 }, (_, j) => ({
      id: crypto.randomUUID(), name: `V${j}`, code: `C${j}`, unit: 'Nos', sprice: 100, pprice: 60, dprice: 90, discount: 10,
      images: [], items: Array.from({ length: 2 }, (_, k) => ({ id: crypto.randomUUID(), size: `S${k}`, qty: 5 })),
    })),
  }))
}

async function run() {
  const DISTRIBUTOR_ID = (await pool.query(`SELECT distributor_id FROM distributor_companies WHERE company_id=$1 LIMIT 1`, [COMPANY_ID])).rows[0]?.distributor_id
  if (!DISTRIBUTOR_ID) { console.log(red('no distributor')); await pool.end(); process.exit(2) }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const beforeCounter = (await client.query(`SELECT purchase_counter FROM companies WHERE id=$1`, [COMPANY_ID])).rows[0].purchase_counter
    const products = buildProducts(2)
    const po = { paymentType: 'CREDIT', billNo: 'BB', distributorId: DISTRIBUTOR_ID, totalAmount: 1000, subTotalAmount: 1000, discount: 0, tax: 0, adjustment: 0 }

    // --- PO ---
    const poId = crypto.randomUUID()
    const poNo = beforeCounter
    await client.query(`UPDATE companies SET purchase_counter=purchase_counter+1 WHERE id=$1`, [COMPANY_ID])
    await client.query(
      `INSERT INTO purchase_orders (id,created_at,updated_at,company_id,payment_type,total_amount,distributor_id,bill_no,adjustment,discount,tax,subtotal_amount,purchase_order_no)
       VALUES ($1,now(),now(),$2,$3,$4,$5,$6,0,0,0,$7,$8)`,
      [poId, COMPANY_ID, po.paymentType, po.totalAmount, po.distributorId, po.billNo, po.subTotalAmount, poNo],
    )

    // --- batch products/variants/items ---
    const productRows = [], variantRows = [], itemRows = [], productIds = []
    for (const p of products) {
      productIds.push(p.id)
      productRows.push([p.id, p.name, p.brandId, p.description, p.status, COMPANY_ID, poId, p.categoryId, p.subcategoryId])
      for (const v of p.variants) {
        variantRows.push([v.id, v.name, v.code, v.unit, v.sprice, v.pprice, v.dprice, v.discount, p.deliveryType, 0, [], COMPANY_ID, p.id])
        for (const it of v.items) itemRows.push([it.id, it.size, it.qty, it.qty, COMPANY_ID, v.id])
      }
    }
    let r = multiRow(productRows, 'now(),now()')
    await client.query(`INSERT INTO products (id,name,brand_id,description,status,company_id,purchaseorder_id,category_id,subcategory_id,created_at,updated_at) VALUES ${r.sql}`, r.params)
    r = multiRow(variantRows, 'true,now(),now()')
    await client.query(`INSERT INTO variants (id,name,code,unit,s_price,p_price,d_price,discount,delivery_type,tax,images,company_id,product_id,status,created_at,updated_at) VALUES ${r.sql}`, r.params)
    r = multiRow(itemRows, 'now(),now()')
    await client.query(`INSERT INTO items (id,size,qty,initial_qty,company_id,variant_id,created_at,updated_at) VALUES ${r.sql}`, r.params)

    await client.query(`INSERT INTO distributor_credits (id,created_at,amount,"billNo",distributor_id,company_id,purchase_order_id) VALUES ($1,now(),$2,$3,$4,$5,$6)`,
      [crypto.randomUUID(), po.totalAmount, po.billNo, po.distributorId, COMPANY_ID, poId])

    // --- asserts ---
    const linked = Number((await client.query(`SELECT count(*) FROM products WHERE purchaseorder_id=$1`, [poId])).rows[0].count)
    assert(linked === 2, 'batch → 2 products linked to PO')
    const vCount = Number((await client.query(`SELECT count(*) FROM variants WHERE product_id=ANY($1::text[])`, [productIds])).rows[0].count)
    assert(vCount === 4, 'batch → 4 variants (2 per product)')
    const vids = (await client.query(`SELECT id FROM variants WHERE product_id=ANY($1::text[])`, [productIds])).rows.map(x => x.id)
    const itms = (await client.query(`SELECT barcode, qty, initial_qty FROM items WHERE variant_id=ANY($1::text[])`, [vids])).rows
    assert(itms.length === 8, 'batch → 8 items total')
    assert(itms.every(i => i.barcode), 'batch → barcode trigger populated every item')
    assert(itms.every(i => i.initial_qty === 5), 'batch → initial_qty seeded to qty')
    const afterCounter = (await client.query(`SELECT purchase_counter FROM companies WHERE id=$1`, [COMPANY_ID])).rows[0].purchase_counter
    assert(afterCounter === beforeCounter + 1, 'batch → purchase_counter incremented once')
    assert(poNo === beforeCounter, 'batch → PO number = counter-before')
    const credits = Number((await client.query(`SELECT count(*) FROM distributor_credits WHERE purchase_order_id=$1`, [poId])).rows[0].count)
    assert(credits === 1, 'batch CREDIT → 1 distributor_credit for the PO')

    await client.query('ROLLBACK')
  } catch (e) { fail++; console.log(red('✗ threw:'), e.message); try { await client.query('ROLLBACK') } catch {} } finally { client.release() }
  console.log(`\nSummary: ${pass} passed, ${fail} failed  (all rolled back)\n`)
  await pool.end()
  process.exit(fail ? 1 : 0)
}
run().catch(async (e) => { console.error('FATAL:', e); try { await pool.end() } catch {} ; process.exit(2) })
