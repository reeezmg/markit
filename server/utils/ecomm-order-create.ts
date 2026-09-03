import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import type { PoolClient } from 'pg'
// Relative on purpose: this module is also loaded directly by
// tests/ecomm-order-create.test.ts, outside Nitro's `~` alias.
import { writeStatusHistory } from './ecomm-order-cancel'
import { couponDiscount, findEligibleCoupon, redeemCoupon } from './ecomm-coupons'

/**
 * Creating an ecommerce order by hand, from the seller's side.
 *
 * Not every order arrives through the storefront — some come in by phone, over
 * WhatsApp, or from a customer at the counter who wants it delivered. Once it
 * exists it is the same order in every respect: it takes stock, gets a bill,
 * and ships and cancels through exactly the same screens. This is the mirror
 * image of `cancelEcommOrder`, and the two must stay symmetric — whatever is
 * taken here has to be givable back there.
 *
 * Prices, tax and totals are computed HERE from the database, never taken from
 * the browser. The seller chooses what to sell and to whom; the money is the
 * server's answer, so a tampered payload cannot invent a price. The only
 * figures accepted from the caller are the ones a seller is genuinely entitled
 * to set: a manual discount and the delivery fee.
 *
 * Runs inside the CALLER's transaction. A bill with no stock movement, or stock
 * taken with no order to show for it, would both be worse than failing.
 */

export interface CreateOrderInput {
  client?: { id?: string; name?: string; phone?: string; email?: string }
  address?: Record<string, any>
  saveAddress?: boolean
  items?: { itemId?: string; quantity?: number }[]
  paymentMethod?: string
  paymentStatus?: string
  deliveryFee?: number
  /** A manual, seller-entered reduction. Independent of any coupon. */
  discount?: number
  /** A coupon to redeem, by id — re-validated server-side before it counts. */
  couponId?: string | null
  notes?: string
}

/**
 * One line of the order's `items` snapshot — the same shape storefront checkout
 * writes, so /order/ecomorders, the labels and the cancellation all read it the
 * same way. `itemId` is what cancellation restores stock through, so it is not
 * optional.
 */
export interface OrderLine {
  variantId: string
  itemId: string
  name: string
  variantName: string
  size: string | null
  sizeLabel: string
  shade: string | null
  barcode: string | null
  quantity: number
  sprice: number
  dprice: number
  image: string | null
  images: string[]
  tax: number
  taxAmount: number
  weight: number
  categoryId: string | null
  value: number
  discount: number
}

export interface CreateOrderResult {
  orderId: string
  billId: string
  orderNumber: number | null
  clientId: string
  createdClient: boolean
  /** The company's client counter after linking, so the caller can refresh the session. */
  clientCounter: number | null
  subtotal: number
  /** Everything taken off: the coupon plus the seller's manual reduction. */
  discount: number
  /** The coupon's share of that, also stored on the bill as coupon_value. */
  couponDiscount: number
  couponCode: string | null
  deliveryFee: number
  tax: number
  grandTotal: number
  items: number
}

const money = (value: unknown) => Number(Number(value || 0).toFixed(2))

export async function createEcommOrder(
  db: PoolClient,
  companyId: string,
  userId: string | null,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  // ── Validate before touching anything ────────────────────────────────────
  const lines = (input?.items || [])
    .map((line) => ({ itemId: String(line?.itemId || '').trim(), quantity: Math.floor(Number(line?.quantity || 0)) }))
    .filter((line) => line.itemId && line.quantity > 0)
  if (!lines.length) throw createError({ statusCode: 400, statusMessage: 'Add at least one product to the order' })

  // Merge duplicates so the stock check sees the true total for an item.
  const wanted = new Map<string, number>()
  for (const line of lines) wanted.set(line.itemId, (wanted.get(line.itemId) || 0) + line.quantity)

  const paymentMethod = String(input?.paymentMethod || 'COD').toUpperCase()
  const paymentStatus = String(input?.paymentStatus || 'PENDING').toUpperCase()
  if (!['PENDING', 'PAID'].includes(paymentStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'paymentStatus must be PENDING or PAID' })
  }

  const address = input?.address || {}
  if (!String(address.pincode || '').trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A delivery pincode is required — the carrier cannot quote without one',
    })
  }

  // ── Customer ─────────────────────────────────────────────────────────────
  const resolved = await resolveClient(db, companyId, input?.client || {})
  const clientId = resolved.clientId

  // ── Saved address (optional) ─────────────────────────────────────────────
  // The order always carries its own address snapshot; saving it as a row as
  // well just means the customer's next order can reuse it.
  let addressId: string | null = null
  if (input?.saveAddress) {
    addressId = randomUUID()
    await db.query(
      `INSERT INTO addresses (id, name, first_name, phone_no, house_details, street, locality, landmark,
                              city, state, pincode, type, client_id, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,now(),now())`,
      [
        addressId, address.name || null, address.firstName || null, address.phoneNo || null,
        address.houseDetails || null, address.street || null, address.locality || null, address.landmark || null,
        address.city || null, address.state || null, String(address.pincode).trim(), address.type || 'HOME',
        clientId,
      ],
    )
  }

  // ── Price the order from the database ────────────────────────────────────
  // FOR UPDATE OF i locks the stock rows for the rest of the transaction, so
  // two sellers building an order for the last piece cannot both succeed.
  const itemIds = [...wanted.keys()]
  const { rows: stock } = await db.query(
    `SELECT i.id AS item_id, i.size, i.barcode, COALESCE(i.qty, 0) AS stock_qty,
            v.id AS variant_id, v.name AS variant_name, v.s_price, v.d_price,
            COALESCE(v.tax, 0) AS tax, v.images, v.weight,
            COALESCE(v.size_label, 'Size') AS size_label,
            p.name AS product_name, p.category_id
     FROM items i
     JOIN variants v ON v.id = i.variant_id AND v.company_id = $1 AND v.status = true
     JOIN products p ON p.id = v.product_id AND p.company_id = $1 AND p.status = true
     WHERE i.company_id = $1 AND i.id = ANY($2::text[])
     FOR UPDATE OF i`,
    [companyId, itemIds],
  )
  if (stock.length !== itemIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Some products are no longer available — remove them and try again',
    })
  }

  const { rows: companyRows } = await db.query(
    `SELECT COALESCE(is_tax_included, true) AS is_tax_included FROM companies WHERE id = $1`,
    [companyId],
  )
  const isTaxIncluded = companyRows[0]?.is_tax_included !== false

  const snapshot: OrderLine[] = stock.map((row: any): OrderLine => {
    const quantity = wanted.get(row.item_id)!
    if (Number(row.stock_qty) < quantity) {
      throw createError({
        statusCode: 400,
        statusMessage: `${row.product_name} (${row.size || 'one size'}) has only ${row.stock_qty} left`,
      })
    }
    const rate = money(row.s_price)
    const saleRate = money(row.d_price ?? row.s_price)
    const value = money(saleRate * quantity)
    const taxRate = money(row.tax)
    // Inclusive tax is already inside the price, so it is extracted rather than
    // added — the same arithmetic the storefront checkout uses.
    const taxAmount = money(
      isTaxIncluded && taxRate ? (value * taxRate) / (100 + taxRate) : (value * taxRate) / 100,
    )
    return {
      variantId: row.variant_id,
      itemId: row.item_id,
      name: row.product_name,
      variantName: row.variant_name,
      size: row.size,
      sizeLabel: row.size_label,
      shade: null,
      barcode: row.barcode,
      quantity,
      sprice: rate,
      dprice: saleRate,
      image: row.images?.[0] ?? null,
      images: row.images || [],
      tax: taxRate,
      taxAmount,
      weight: money(row.weight),
      categoryId: row.category_id,
      value,
      discount: money(Math.max(0, rate - saleRate) * quantity),
    }
  })

  const subtotal = money(snapshot.reduce((sum, i) => sum + i.value, 0))

  // ── Coupon ───────────────────────────────────────────────────────────────
  // Re-validated here against the subtotal the SERVER just computed, not the
  // one the browser quoted against. A coupon with a minimum order value must
  // not be redeemable by quoting it on a big basket and then creating a small
  // one.
  let coupon = null
  if (input?.couponId) {
    coupon = await findEligibleCoupon(db, companyId, clientId, subtotal, input.couponId)
    if (!coupon) {
      throw createError({
        statusCode: 400,
        statusMessage: 'That coupon is not valid for this order any more — remove it and try again',
      })
    }
  }
  const couponPart = coupon ? couponDiscount(coupon, subtotal) : 0

  // The seller's own reduction stacks on top of the coupon, and the pair is
  // capped together: two separate caps would let them sum past the subtotal and
  // produce a negative bill.
  const manualPart = Math.max(0, money(input?.discount))
  const discount = Math.min(subtotal, money(couponPart + manualPart))
  const deliveryFee = Math.max(0, money(input?.deliveryFee))
  const tax = money(snapshot.reduce((sum, i) => sum + i.taxAmount, 0))
  const chargedTax = isTaxIncluded ? 0 : tax
  const grandTotal = money(Math.max(0, subtotal + deliveryFee + chargedTax - discount))

  // ── Bill ─────────────────────────────────────────────────────────────────
  // invoice_number is assigned by the generate_invoice_number trigger on
  // INSERT; the order takes the same number so both screens agree.
  const billId = randomUUID()
  const { rows: billRows } = await db.query(
    `INSERT INTO bills (id, created_at, updated_at, invoice_number, subtotal, grand_total, discount, tax,
                        delivery_fee, payment_method, payment_status, company_id, client_id, address_id,
                        notes, type, status, is_markit, coupon_value)
     VALUES ($1, now(), now(), NULL, $2, $3, $4, $5, $6, $7, $8::"PaymentStatus", $9, $10, $11, $12,
             'STANDARD'::"OrderType", 'PENDING'::"OrderStatus", false, $13)
     RETURNING invoice_number`,
    [billId, subtotal, grandTotal, discount, tax, deliveryFee, paymentMethod,
      paymentStatus === 'PAID' ? 'PAID' : 'PENDING', companyId, clientId, addressId, input?.notes || null,
      // coupon_value is an integer column, so the coupon's share is rounded —
      // the exact figure lives in `discount`, which is a float.
      Math.round(couponPart)],
  )
  const invoiceNumber = billRows[0]?.invoice_number ?? null

  // Consumed only now that the bill it is spent against exists.
  if (coupon) await redeemCoupon(db, coupon, clientId, billId)

  // ── Entries + stock ──────────────────────────────────────────────────────
  for (const item of snapshot) {
    await db.query(
      `INSERT INTO entries (id, name, qty, rate, discount, tax, value, size, variant_id, item_id,
                            company_id, bill_id, return, barcode, category_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,$13,$14)`,
      [randomUUID(), item.name, item.quantity, item.sprice, -item.discount, item.tax, item.value,
        item.size, item.variantId, item.itemId, companyId, billId, item.barcode, item.categoryId],
    )
    // The qty guard in the WHERE clause is the real stock check. The earlier
    // one exists for a good error message; this one is what makes overselling
    // impossible even under a concurrent write.
    const { rows: moved } = await db.query(
      `UPDATE items
       SET qty = qty - $1, sold_qty = COALESCE(sold_qty, 0) + $1, updated_at = now()
       WHERE id = $2 AND company_id = $3 AND COALESCE(qty, 0) >= $1
       RETURNING id`,
      [item.quantity, item.itemId, companyId],
    )
    if (!moved.length) {
      throw createError({
        statusCode: 400,
        statusMessage: `${item.name} went out of stock while the order was being created`,
      })
    }
  }

  // ── Order ────────────────────────────────────────────────────────────────
  // No checkout row: a manual order never went through storefront checkout, and
  // inventing one would claim a payment session that does not exist.
  const orderId = randomUUID()
  await db.query(
    `INSERT INTO ecomm_orders (id, created_at, updated_at, order_number, status, payment_status, payment_method,
                               subtotal, discount, delivery_fee, tax, grand_total, items, shipping_address,
                               notes, meta, company_id, client_id, bill_id)
     VALUES ($1, now(), now(), $2, 'PLACED', $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13::jsonb, $14, $15, $16)`,
    [orderId, invoiceNumber, paymentStatus, paymentMethod, subtotal, discount, deliveryFee, tax, grandTotal,
      JSON.stringify(snapshot), JSON.stringify(address), input?.notes || null,
      JSON.stringify({ manual: true, createdBy: userId }),
      companyId, clientId, billId],
  )

  await writeStatusHistory(db, companyId, orderId, 'PLACED', {
    source: 'manual',
    note: 'Order created by the seller',
  })

  return {
    orderId,
    billId,
    orderNumber: invoiceNumber,
    clientId,
    createdClient: resolved.createdClient,
    clientCounter: resolved.clientCounter,
    subtotal,
    discount,
    couponDiscount: couponPart,
    couponCode: coupon?.code ?? null,
    deliveryFee,
    tax,
    grandTotal,
    items: snapshot.length,
  }
}

/**
 * Find, link or create the customer this order belongs to.
 *
 * `clients` is global to Markit and phone is unique across it, so a "new"
 * customer is very often an existing person who has shopped with another
 * seller. Creating blindly would hit the unique constraint; looking up by phone
 * first turns that collision into the correct behaviour — reuse the person, and
 * link them to this company.
 */
async function resolveClient(
  db: PoolClient,
  companyId: string,
  input: { id?: string; name?: string; phone?: string; email?: string },
): Promise<{ clientId: string; createdClient: boolean; clientCounter: number | null }> {
  let clientCounter: number | null = null

  const link = async (clientId: string) => {
    const { rows } = await db.query(
      `SELECT 1 FROM company_clients WHERE company_id = $1 AND client_id = $2`,
      [companyId, clientId],
    )
    if (rows.length) return
    // Give them a customer number for this company, the same way the billing
    // screen does via /api/counter/increment.
    const { rows: counter } = await db.query(
      `UPDATE companies SET client_counter = client_counter + 1 WHERE id = $1
       RETURNING client_counter - 1 AS num, client_counter AS next`,
      [companyId],
    )
    const number = counter[0]?.num ?? null
    clientCounter = counter[0]?.next ?? null
    await db.query(
      `INSERT INTO company_clients (company_id, client_id, points, client_number)
       VALUES ($1, $2, 0, $3)
       ON CONFLICT (company_id, client_id) DO NOTHING`,
      [companyId, clientId, number],
    )
  }

  if (input.id) {
    const { rows } = await db.query(`SELECT id FROM clients WHERE id = $1 AND deleted = false`, [input.id])
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
    await link(input.id)
    return { clientId: input.id, createdClient: false, clientCounter }
  }

  const name = String(input.name || '').trim()
  const digits = String(input.phone || '').replace(/\D/g, '').slice(-10)
  if (!name || digits.length !== 10) {
    throw createError({ statusCode: 400, statusMessage: 'A customer name and 10-digit phone number are required' })
  }
  const phone = `+91${digits}`

  const { rows: existing } = await db.query(`SELECT id FROM clients WHERE phone = $1`, [phone])
  if (existing.length) {
    await link(existing[0].id)
    return { clientId: existing[0].id, createdClient: false, clientCounter }
  }

  const clientId = randomUUID()
  await db.query(
    `INSERT INTO clients (id, name, phone, email) VALUES ($1, $2, $3, $4)`,
    [clientId, name, phone, String(input.email || '').trim() || null],
  )
  await link(clientId)
  return { clientId, createdClient: true, clientCounter }
}
