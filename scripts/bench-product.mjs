#!/usr/bin/env node
/* eslint-disable no-console */
// Integrity + timing check for the raw-SQL product create / read / update path.
// Mirrors the SQL in server/api/products/{create,[id],update}. Every run is wrapped
// in BEGIN ... ROLLBACK — nothing persists.

import pg from 'pg'
import crypto from 'node:crypto'

const { Pool } = pg
const DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_gHeLu8s2adzi@ep-orange-night-a1hei8bh-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
const COMPANY_ID = '02856c86-60b8-41a4-ba18-79dbd55bf016'
const CATEGORY_ID = '9dffcb35-8b51-4170-a9cd-74a835e7c6e2'

const pool = new Pool({ connectionString: DB_URL })
const green = (s) => `\x1b[32m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
let pass = 0, fail = 0
const assert = (cond, label) => { if (cond) { pass++; console.log(green('✓'), label) } else { fail++; console.log(red('✗'), label) } }

function buildVariants(n, itemsPer = 2) {
  return Array.from({ length: n }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `V${i}`, code: `C${i}`, unit: 'Nos',
    sprice: 100 + i, pprice: 60, dprice: 90, discount: 10,
    items: Array.from({ length: itemsPer }, (_, j) => ({ id: crypto.randomUUID(), size: itemsPer > 1 ? `S${j}` : null, qty: 5 })),
  }))
}

async function createProduct(client, productId, variants) {
  await client.query(
    `INSERT INTO products (id,name,brand_id,description,status,company_id,purchaseorder_id,category_id,subcategory_id,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())`,
    [productId, 'BenchProduct', null, 'desc', true, COMPANY_ID, null, CATEGORY_ID, null],
  )
  if (variants.length) {
    const VC = 12, vVals = []
    const vRows = variants.map((v, i) => {
      const base = i * VC
      vVals.push(v.id, v.name, v.code, v.unit, v.sprice, v.pprice, v.dprice, v.discount, 0, [], COMPANY_ID, productId)
      const p = Array.from({ length: VC }, (_, k) => `$${base + k + 1}`)
      return `(${p[0]},${p[1]},${p[2]},${p[3]},${p[4]},${p[5]},${p[6]},${p[7]},'trynbuy',true,${p[8]},${p[9]},${p[10]},${p[11]},now(),now())`
    })
    await client.query(`INSERT INTO variants (id,name,code,unit,s_price,p_price,d_price,discount,delivery_type,status,tax,images,company_id,product_id,created_at,updated_at) VALUES ${vRows.join(',')}`, vVals)
  }
  const allItems = variants.flatMap((v) => v.items.map((it) => ({ ...it, variantId: v.id })))
  if (allItems.length) {
    const IC = 6, iVals = []
    const iRows = allItems.map((it, i) => {
      const base = i * IC
      iVals.push(it.id, it.size, it.qty, it.qty, COMPANY_ID, it.variantId)
      const p = Array.from({ length: IC }, (_, k) => `$${base + k + 1}`)
      return `(${p[0]},${p[1]},${p[2]},${p[3]},${p[4]},${p[5]},now(),now())`
    })
    await client.query(`INSERT INTO items (id,size,qty,initial_qty,company_id,variant_id,created_at,updated_at) VALUES ${iRows.join(',')}`, iVals)
  }
}

async function readProduct(client, productId) {
  const p = (await client.query(`SELECT id,name,brand_id,category_id FROM products WHERE id=$1 AND company_id=$2`, [productId, COMPANY_ID])).rows[0]
  if (!p) return null
  const vs = (await client.query(`SELECT id,name,s_price,d_price FROM variants WHERE product_id=$1 ORDER BY created_at`, [productId])).rows
  const vids = vs.map((v) => v.id)
  const items = vids.length ? (await client.query(`SELECT id,barcode,size,qty,initial_qty,variant_id FROM items WHERE variant_id=ANY($1::text[]) ORDER BY created_at`, [vids])).rows : []
  return { ...p, variants: vs.map((v) => ({ ...v, items: items.filter((i) => i.variant_id === v.id) })) }
}

async function updateProduct(client, productId, variants, updateImages = false) {
  await client.query(
    `UPDATE products SET name=$3, description=$4, status=COALESCE($5,status), brand_id=COALESCE($6,brand_id),
       category_id=COALESCE($7,category_id), subcategory_id=COALESCE($8,subcategory_id), updated_at=now()
     WHERE id=$1 AND company_id=$2`,
    [productId, COMPANY_ID, 'BenchProduct EDITED', 'desc', null, null, CATEGORY_ID, null],
  )
  const keepV = variants.map((v) => v.id)
  await client.query(`DELETE FROM variants WHERE product_id=$1 AND company_id=$2 AND NOT (id=ANY($3::text[]))`, [productId, COMPANY_ID, keepV])
  if (variants.length) {
    const VC = 12, vVals = []
    const vRows = variants.map((v, i) => {
      const base = i * VC
      vVals.push(v.id, v.name, v.code, v.unit, v.sprice, v.pprice, v.dprice, v.discount, 0, [], COMPANY_ID, productId)
      const p = Array.from({ length: VC }, (_, k) => `$${base + k + 1}`)
      return `(${p[0]},${p[1]},${p[2]},${p[3]},${p[4]},${p[5]},${p[6]},${p[7]},true,${p[8]},${p[9]},${p[10]},${p[11]},'trynbuy',now(),now())`
    })
    const updImg = `$${variants.length * VC + 1}`
    await client.query(
      `INSERT INTO variants (id,name,code,unit,s_price,p_price,d_price,discount,status,tax,images,company_id,product_id,delivery_type,created_at,updated_at)
       VALUES ${vRows.join(',')}
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, code=EXCLUDED.code, unit=EXCLUDED.unit, s_price=EXCLUDED.s_price,
         p_price=EXCLUDED.p_price, d_price=EXCLUDED.d_price, discount=EXCLUDED.discount, status=true, tax=EXCLUDED.tax,
         images=CASE WHEN ${updImg}::boolean THEN EXCLUDED.images ELSE variants.images END, updated_at=now()`,
      [...vVals, updateImages],
    )
  }
  const allItems = variants.flatMap((v) => v.items.map((it) => ({ ...it, variantId: v.id })))
  const keepI = allItems.map((it) => it.id)
  await client.query(`DELETE FROM items WHERE variant_id=ANY($1::text[]) AND NOT (id=ANY($2::text[]))`, [keepV, keepI])
  if (allItems.length) {
    const IC = 6, iVals = []
    const iRows = allItems.map((it, i) => {
      const base = i * IC
      iVals.push(it.id, it.size, it.qty, it.qty, COMPANY_ID, it.variantId)
      const p = Array.from({ length: IC }, (_, k) => `$${base + k + 1}`)
      return `(${p[0]},${p[1]},${p[2]},${p[3]},${p[4]},${p[5]},now(),now())`
    })
    await client.query(`INSERT INTO items (id,size,qty,initial_qty,company_id,variant_id,created_at,updated_at) VALUES ${iRows.join(',')}
      ON CONFLICT (id) DO UPDATE SET size=EXCLUDED.size, qty=EXCLUDED.qty, updated_at=now()`, iVals)
  }
}

async function timed(fn) { const t0 = process.hrtime.bigint(); await fn(); return Number(process.hrtime.bigint() - t0) / 1e6 }

async function run() {
  // ---- correctness ----
  {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const pid = crypto.randomUUID()
      const variants = buildVariants(2, 2)
      await createProduct(client, pid, variants)
      let read = await readProduct(client, pid)
      assert(read?.variants.length === 2, 'create → 2 variants')
      assert(read.variants.every((v) => v.items.length === 2), 'create → 2 items per variant')
      assert(read.variants.every((v) => v.items.every((i) => i.barcode)), 'create → barcode trigger populated every item')
      assert(read.variants.every((v) => v.items.every((i) => i.initial_qty === 5)), 'create → initial_qty seeded to qty (5)')

      // edit: rename v0, drop one item from v0 + bump remaining item qty, add a 3rd variant, remove v1
      const v0 = { ...variants[0], name: 'V0-renamed', items: [{ ...variants[0].items[0], qty: 99 }] }
      const v2 = buildVariants(1, 1)[0]
      await updateProduct(client, pid, [v0, v2])
      read = await readProduct(client, pid)
      assert(read.variants.length === 2, 'update → variant count 2 (v1 removed, v2 added)')
      const rv0 = read.variants.find((v) => v.id === v0.id)
      assert(rv0?.name === 'V0-renamed', 'update → v0 renamed')
      assert(rv0?.items.length === 1, 'update → v0 item removed')
      assert(rv0?.items[0]?.qty === 99, 'update → v0 remaining item qty changed to 99')
      assert(rv0?.items[0]?.initial_qty === 5, 'update → existing item initial_qty preserved (5)')
      assert(read.variants.some((v) => v.id === v2.id), 'update → new variant v2 present')
      assert(!read.variants.some((v) => v.id === variants[1].id), 'update → v1 deleted')
      assert(read.name === 'BenchProduct EDITED', 'update → product name changed')
      await client.query('ROLLBACK')
    } catch (e) { fail++; console.log(red('✗ correctness threw:'), e.message); await client.query('ROLLBACK') } finally { client.release() }
  }

  // ---- timing across variant counts ----
  console.log('\n  variants | create ms | read ms | update ms')
  console.log(' ---------+-----------+---------+----------')
  for (const n of [1, 5, 10, 25]) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const pid = crypto.randomUUID()
      const variants = buildVariants(n, 2)
      const ct = await timed(() => createProduct(client, pid, variants))
      const rt = await timed(() => readProduct(client, pid))
      const ut = await timed(() => updateProduct(client, pid, variants))
      console.log(`${String(n).padStart(9)} | ${ct.toFixed(1).padStart(9)} | ${rt.toFixed(1).padStart(7)} | ${ut.toFixed(1).padStart(8)}`)
      await client.query('ROLLBACK')
    } finally { client.release() }
  }

  console.log(`\nSummary: ${pass} passed, ${fail} failed  (all rolled back)\n`)
  await pool.end()
  process.exit(fail ? 1 : 0)
}

run().catch(async (e) => { console.error('FATAL:', e); try { await pool.end() } catch {} ; process.exit(2) })
