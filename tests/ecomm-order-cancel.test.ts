import 'dotenv/config'
import { Pool } from 'pg'
import { cancelEcommOrder } from '../server/utils/ecomm-order-cancel'
import { createEcommOrder } from '../server/utils/ecomm-order-create'

/**
 * Exercises the order-cancellation rollback against the real database.
 *
 * Every case runs inside a transaction that is ALWAYS rolled back, so the test
 * proves the SQL works against the live schema without leaving anything behind.
 * It uses a real cancellable order when available, otherwise creates one through
 * the actual order writer inside the rollback. Both paths exercise real schema
 * constraints; the terminal-status guard also has a rollback fixture fallback.
 *
 *   npx tsx tests/ecomm-order-cancel.test.ts
 */

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is required.')
  process.exit(1)
}

const pool = new Pool({ connectionString: databaseUrl })
const schema = new URL(databaseUrl).searchParams.get('schema') || 'public'
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw Error('Invalid database schema')
async function readSource(query: string) {
  const db = await pool.connect()
  try {
    await db.query('BEGIN READ ONLY')
    await db.query(`SET LOCAL search_path TO "${schema}"`)
    return await db.query(query)
  } finally { await db.query('ROLLBACK'); db.release() }
}

async function createRollbackOrder(db: any) {
  const { rows: [stock] } = await db.query(`SELECT i.id,i.company_id FROM items i
    JOIN variants v ON v.id=i.variant_id AND v.status=true
    JOIN products p ON p.id=v.product_id AND p.status=true
    WHERE i.qty>=2 AND EXISTS(SELECT 1 FROM ecomm_orders o WHERE o.company_id=i.company_id)
    ORDER BY i.company_id,i.id LIMIT 1`)
  if (!stock) throw Error('An in-stock ecommerce item is required for the rollback fixture')
  const created = await createEcommOrder(db, stock.company_id, null, {
    client: { name: 'Cancellation rollback fixture', phone: '9000000001' },
    address: { houseDetails: '1', street: 'Test Street', city: 'Kochi', state: 'Kerala', pincode: '682001' },
    items: [{ itemId: stock.id, quantity: 1 }], paymentMethod: 'COD', notes: 'Cancellation test; always rolled back',
  })
  return (await db.query('SELECT id,company_id,order_number,status,items,bill_id FROM ecomm_orders WHERE id=$1',[created.orderId])).rows[0]
}

let failures = 0
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`OK   ${name}`)
  } else {
    failures += 1
    console.error(`FAIL ${name}`)
    if (detail !== undefined) console.error(JSON.stringify(detail, null, 2))
  }
}

async function main() {
  const { rows: candidates } = await readSource(
    `SELECT id, company_id, order_number, status, items, bill_id
     FROM ecomm_orders
     WHERE status NOT IN ('CANCELLED', 'DELIVERED', 'RTO_DELIVERED', 'RETURNED')
       AND jsonb_array_length(items) > 0
     ORDER BY created_at DESC
     LIMIT 1`,
  )
  let order = candidates[0]

  // ── Case 1: a cancellation restores stock and flips every linked row ──────
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL search_path TO "${schema}"`)
    if (!order) {
      order = await createRollbackOrder(client)
      console.log('Created a cancellable fixture inside the outer rollback')
    }
    console.log(`Testing against order #${order.order_number} (${order.status})\n`)
    const itemIds: string[] = [...new Set<string>((order.items as any[])
      .map(line => String(line?.itemId ?? line?.item_id ?? '').trim()).filter(Boolean))]

    const before = await client.query(
      `SELECT id, qty, sold_qty FROM items WHERE id = ANY($1::text[])`,
      [itemIds],
    )
    const beforeById = new Map<string, any>(before.rows.map((r: any) => [r.id, r]))

    const result = await cancelEcommOrder(client, order.company_id, order.id, {
      source: 'test',
      note: 'rolled back',
    })

    const after = await client.query(
      `SELECT id, qty, sold_qty FROM items WHERE id = ANY($1::text[])`,
      [itemIds],
    )

    const expected = new Map<string, number>()
    for (const line of order.items as any[]) {
      const id = String(line?.itemId ?? line?.item_id ?? '').trim()
      const qty = Number(line?.quantity ?? line?.qty ?? 0)
      if (id && qty > 0) expected.set(id, (expected.get(id) || 0) + qty)
    }

    let stockOk = true
    const stockDetail: any[] = []
    for (const row of after.rows) {
      const prev = beforeById.get(row.id)
      const want = expected.get(row.id) || 0
      const qtyDelta = Number(row.qty) - Number(prev.qty)
      const soldDelta = Number(prev.sold_qty) - Number(row.sold_qty)
      // sold_qty is floored at 0, so it can move by less than the full quantity.
      if (qtyDelta !== want || soldDelta > want || soldDelta < 0) stockOk = false
      stockDetail.push({ item: row.id, want, qtyDelta, soldDelta })
    }
    check('stock qty goes back up by exactly the ordered quantity', stockOk, stockDetail)
    check('every line was restorable', result.unrestorable === 0, result)

    const { rows: o } = await client.query(`SELECT status FROM ecomm_orders WHERE id = $1`, [order.id])
    check('order is CANCELLED', o[0].status === 'CANCELLED', o[0])

    if (order.bill_id) {
      const { rows: b } = await client.query(`SELECT status FROM bills WHERE id = $1`, [order.bill_id])
      check('bill is CANCELED', b[0]?.status === 'CANCELED', b[0])
      check('billCancelled reported', result.billCancelled === true, result)
    }

    const { rows: h } = await client.query(
      `SELECT status, source, note FROM ecomm_order_status_history
       WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [order.id],
    )
    check('a CANCELLED history row was written with its own id', h[0]?.status === 'CANCELLED', h[0])
    check('history records the source', h[0]?.source === 'test', h[0])

    // ── Case 2: cancelling twice is refused, so stock cannot double up ──────
    let secondFailed = false
    let secondMessage = ''
    try {
      await cancelEcommOrder(client, order.company_id, order.id, { source: 'test' })
    } catch (e: any) {
      secondFailed = e?.statusCode === 400 && /already cancelled/i.test(e?.statusMessage || e?.message)
      secondMessage = e?.statusMessage || e?.message
    }
    check('a second cancellation is refused', secondFailed, secondMessage)

    // ── Case 3: another company cannot cancel this order ────────────────────
    let scopedOut = false
    try {
      await cancelEcommOrder(client, 'not-a-real-company', order.id, { source: 'test' })
    } catch (e: any) {
      scopedOut = e?.statusCode === 404
    }
    check('company scoping is enforced', scopedOut)
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }

  // ── Case 4: a delivered order is protected unless forced ─────────────────
  const { rows: delivered } = await readSource(
    `SELECT id, company_id FROM ecomm_orders WHERE status = 'DELIVERED' LIMIT 1`,
  )
  {
    const c2 = await pool.connect()
    try {
      await c2.query('BEGIN')
      await c2.query(`SET LOCAL search_path TO "${schema}"`)
      let terminalOrder = delivered[0]
      if (!terminalOrder) {
        terminalOrder = await createRollbackOrder(c2)
        await c2.query("UPDATE ecomm_orders SET status='DELIVERED' WHERE id=$1",[terminalOrder.id])
      }
      let blocked = false
      try {
        await cancelEcommOrder(c2, terminalOrder.company_id, terminalOrder.id, { source: 'test' })
      } catch (e: any) {
        blocked = e?.statusCode === 400 && /DELIVERED.*cannot be cancelled/i.test(e?.statusMessage || e?.message)
      }
      check('a DELIVERED order is not cancellable by default', blocked)
    } finally {
      await c2.query('ROLLBACK')
      c2.release()
    }
  }

  await pool.end()
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed (all changes rolled back)')
  process.exit(failures ? 1 : 0)
}

main().catch(async (e) => {
  console.error(e)
  await pool.end()
  process.exit(1)
})
