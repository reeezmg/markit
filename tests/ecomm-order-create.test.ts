import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { createEcommOrder } from '../server/utils/ecomm-order-create'
import { cancelEcommOrder } from '../server/utils/ecomm-order-cancel'
import { couponDiscount, eligibleCoupons } from '../server/utils/ecomm-coupons'

/**
 * Exercises manual order creation against the real database.
 *
 * Everything runs inside a transaction that is ALWAYS rolled back, so no order,
 * bill or stock movement survives the run. Creating and then cancelling the
 * same order in one test is deliberate: the two are mirror images, and the only
 * way to prove that is to check the stock ends up exactly where it started.
 *
 *   npx tsx tests/ecomm-order-create.test.ts
 */

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is required.')
  process.exit(1)
}

const pool = new Pool({ connectionString: databaseUrl })

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

const money = (v: unknown) => Number(Number(v || 0).toFixed(2))

async function main() {
  // A company that already sells online, so the data is representative.
  const { rows: companies } = await pool.query(
    `SELECT company_id FROM ecomm_orders GROUP BY company_id ORDER BY count(*) DESC LIMIT 1`,
  )
  if (!companies.length) {
    console.error('No company with ecommerce orders — nothing to test against.')
    process.exit(1)
  }
  const companyId = companies[0].company_id

  const { rows: stockRows } = await pool.query(
    `SELECT i.id, i.qty, i.sold_qty, v.s_price, COALESCE(v.d_price, v.s_price) AS d_price
     FROM items i
     JOIN variants v ON v.id = i.variant_id AND v.status = true
     JOIN products p ON p.id = v.product_id AND p.status = true
     WHERE i.company_id = $1 AND COALESCE(i.qty, 0) >= 2
     LIMIT 2`,
    [companyId],
  )
  if (stockRows.length < 1) {
    console.error('No in-stock item to build an order from.')
    process.exit(1)
  }
  console.log(`Company ${companyId}, ${stockRows.length} item(s) in stock\n`)

  const orderLines = stockRows.map((r: any) => ({ itemId: r.id, quantity: 1 }))
  const itemIds = stockRows.map((r: any) => r.id)

  const db = await pool.connect()
  try {
    await db.query('BEGIN')

    const before = new Map<string, any>(
      (await db.query(`SELECT id, qty, sold_qty FROM items WHERE id = ANY($1::text[])`, [itemIds]))
        .rows.map((r: any) => [r.id, r]),
    )

    // ── Create ─────────────────────────────────────────────────────────────
    const created = await createEcommOrder(db, companyId, null, {
      client: { name: 'Test Buyer', phone: '9000000001' },
      address: { houseDetails: '1', street: 'Test Street', city: 'Kochi', state: 'Kerala', pincode: '682001' },
      items: orderLines,
      paymentMethod: 'COD',
      deliveryFee: 40,
      discount: 10,
      notes: 'rolled back',
    })

    check('an order id and bill id come back', Boolean(created.orderId && created.billId), created)
    check('the bill trigger assigned an order number', created.orderNumber !== null, created)

    const { rows: orderRows } = await db.query(
      `SELECT status, payment_status, order_number, items, subtotal, discount, delivery_fee, grand_total, meta, bill_id, checkout_id
       FROM ecomm_orders WHERE id = $1`,
      [created.orderId],
    )
    const order = orderRows[0]
    check('the order is PLACED', order.status === 'PLACED', order.status)
    check('it has no checkout row', order.checkout_id === null, order.checkout_id)
    check('it is flagged as manual', order.meta?.manual === true, order.meta)
    check('the snapshot has one line per product', order.items.length === orderLines.length, order.items?.length)
    check(
      'every snapshot line carries the itemId cancellation restores from',
      order.items.every((l: any) => Boolean(l.itemId) && Number(l.quantity) > 0),
      order.items,
    )

    // Totals are the server's, not the caller's.
    const expectedSubtotal = money(stockRows.reduce((s: number, r: any) => s + Number(r.d_price), 0))
    check('subtotal is priced from the database', money(order.subtotal) === expectedSubtotal,
      { got: order.subtotal, expected: expectedSubtotal })
    check('grand total = subtotal + delivery - discount (tax inclusive)',
      money(order.grand_total) === money(expectedSubtotal + 40 - 10),
      { got: order.grand_total, expected: money(expectedSubtotal + 40 - 10) })

    // ── Stock went down ────────────────────────────────────────────────────
    const afterCreate = (await db.query(`SELECT id, qty, sold_qty FROM items WHERE id = ANY($1::text[])`, [itemIds])).rows
    let downOk = true
    for (const row of afterCreate) {
      const prev = before.get(row.id)
      if (Number(prev.qty) - Number(row.qty) !== 1) downOk = false
      if (Number(row.sold_qty) - Number(prev.sold_qty) !== 1) downOk = false
    }
    check('creating the order took the stock', downOk,
      afterCreate.map((r: any) => ({ id: r.id, was: before.get(r.id)?.qty, now: r.qty })))

    // ── Bill + entries ─────────────────────────────────────────────────────
    const { rows: bill } = await db.query(`SELECT status, grand_total, client_id FROM bills WHERE id = $1`, [created.billId])
    check('a PENDING bill was written', bill[0]?.status === 'PENDING', bill[0])
    check('the bill total matches the order', money(bill[0]?.grand_total) === money(order.grand_total), bill[0])

    const { rows: entries } = await db.query(`SELECT count(*)::int AS n FROM entries WHERE bill_id = $1`, [created.billId])
    check('one entry per line', entries[0].n === orderLines.length, entries[0])

    const { rows: link } = await db.query(
      `SELECT 1 FROM company_clients WHERE company_id = $1 AND client_id = $2`, [companyId, created.clientId])
    check('the customer is linked to the company', link.length === 1)

    // ── Cancel puts it all back ────────────────────────────────────────────
    await cancelEcommOrder(db, companyId, created.orderId, { source: 'test' })
    const afterCancel = (await db.query(`SELECT id, qty, sold_qty FROM items WHERE id = ANY($1::text[])`, [itemIds])).rows
    let roundTripOk = true
    for (const row of afterCancel) {
      const prev = before.get(row.id)
      if (Number(row.qty) !== Number(prev.qty)) roundTripOk = false
      if (Number(row.sold_qty) !== Number(prev.sold_qty)) roundTripOk = false
    }
    check('create then cancel leaves stock exactly where it started', roundTripOk,
      afterCancel.map((r: any) => ({ id: r.id, start: before.get(r.id)?.qty, end: r.qty })))

    // ── Guards ─────────────────────────────────────────────────────────────
    let noItems = false
    try {
      await createEcommOrder(db, companyId, null, {
        client: { name: 'Test Buyer', phone: '9000000001' },
        address: { pincode: '682001' },
        items: [],
      })
    } catch { noItems = true }
    check('an empty order is refused', noItems)

    let noPincode = false
    try {
      await createEcommOrder(db, companyId, null, {
        client: { name: 'Test Buyer', phone: '9000000001' },
        address: {},
        items: orderLines,
      })
    } catch { noPincode = true }
    check('an order with no pincode is refused', noPincode)

    let badPhone = false
    try {
      await createEcommOrder(db, companyId, null, {
        client: { name: 'Test Buyer', phone: '123' },
        address: { pincode: '682001' },
        items: orderLines,
      })
    } catch { badPhone = true }
    check('a short phone number is refused', badPhone)

    // ── Coupons ────────────────────────────────────────────────────────────
    // A coupon must consume and un-consume symmetrically, or a cancelled order
    // silently burns the customer's code.
    let bogusRefused = false
    try {
      await createEcommOrder(db, companyId, null, {
        client: { name: 'Test Buyer', phone: '9000000001' },
        address: { pincode: '682001' },
        items: orderLines,
        couponId: 'not-a-real-coupon',
      })
    } catch { bogusRefused = true }
    check('an unknown coupon is refused', bogusRefused)

    const subtotalForCoupon = expectedSubtotal
    // The test writes its own coupon rather than hunting for a usable one in
    // seed data: every existing coupon is currently outside its date window, and
    // a test that silently skips the behaviour it exists to check is worthless.
    // It is rolled back with everything else.
    const testCouponId = randomUUID()
    await db.query(
      `INSERT INTO coupons (id, code, type, discount_value, min_order_value, start_date, end_date,
                            is_active, times_used, target_type, audience_type, company_id,
                            created_at, updated_at, is_markit, is_bill_combine)
       VALUES ($1, $2, 'PERCENTAGE'::"CouponType", 10, 0, now() - interval '1 day', now() + interval '1 day',
               true, 0, 'ALL'::"CouponTarget", 'ALL'::"CouponAudience", $3, now(), now(), false, false)`,
      [testCouponId, `TEST-${testCouponId.slice(0, 8)}`, companyId],
    )

    const available = await eligibleCoupons(db, companyId, null, subtotalForCoupon)
    check('the eligibility query finds a valid coupon',
      available.some((c) => c.id === testCouponId), available.map((c) => c.code))

    {
      const coupon = available.find((c) => c.id === testCouponId)!
      const expectedOff = couponDiscount(coupon, subtotalForCoupon)
      const { rows: usedBefore } = await db.query(`SELECT times_used FROM coupons WHERE id = $1`, [coupon.id])

      const withCoupon = await createEcommOrder(db, companyId, null, {
        client: { name: 'Test Buyer', phone: '9000000001' },
        address: { pincode: '682001' },
        items: orderLines,
        couponId: coupon.id,
        deliveryFee: 0,
        discount: 0,
      })

      check('the coupon discount is the server-computed amount',
        money(withCoupon.couponDiscount) === money(expectedOff),
        { got: withCoupon.couponDiscount, expected: expectedOff })
      check('the coupon code comes back', withCoupon.couponCode === coupon.code, withCoupon.couponCode)
      check('the total is reduced by the coupon',
        money(withCoupon.grandTotal) === money(subtotalForCoupon - expectedOff),
        { got: withCoupon.grandTotal, expected: money(subtotalForCoupon - expectedOff) })

      const { rows: billCoupon } = await db.query(
        `SELECT coupon_value FROM bills WHERE id = $1`, [withCoupon.billId])
      check('the bill records the coupon value',
        Number(billCoupon[0]?.coupon_value) === Math.round(expectedOff), billCoupon[0])

      const { rows: usage } = await db.query(
        `SELECT count(*)::int AS n FROM coupon_usages WHERE bill_id = $1 AND coupon_id = $2`,
        [withCoupon.billId, coupon.id])
      check('a coupon usage row was written', usage[0].n === 1, usage[0])

      const { rows: usedAfter } = await db.query(`SELECT times_used FROM coupons WHERE id = $1`, [coupon.id])
      check('times_used went up by one',
        Number(usedAfter[0].times_used) === Number(usedBefore[0].times_used) + 1,
        { before: usedBefore[0].times_used, after: usedAfter[0].times_used })

      // Cancelling must hand the code back.
      const reversal = await cancelEcommOrder(db, companyId, withCoupon.orderId, { source: 'test' })
      check('the cancellation reported reversing one coupon',
        reversal.couponsReversed === 1, reversal)
      const { rows: usageGone } = await db.query(
        `SELECT count(*)::int AS n FROM coupon_usages WHERE bill_id = $1`, [withCoupon.billId])
      check('cancelling deletes the coupon usage', usageGone[0].n === 0, usageGone[0])

      const { rows: usedFinal } = await db.query(`SELECT times_used FROM coupons WHERE id = $1`, [coupon.id])
      check('cancelling puts times_used back',
        Number(usedFinal[0].times_used) === Number(usedBefore[0].times_used),
        { start: usedBefore[0].times_used, end: usedFinal[0].times_used })
    }

    let overSold = false
    try {
      await createEcommOrder(db, companyId, null, {
        client: { name: 'Test Buyer', phone: '9000000001' },
        address: { pincode: '682001' },
        items: [{ itemId: itemIds[0], quantity: 999999 }],
      })
    } catch { overSold = true }
    check('ordering more than the stock is refused', overSold)
  } finally {
    await db.query('ROLLBACK')
    db.release()
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
