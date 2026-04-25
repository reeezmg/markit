import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

/**
 * GSTR-2B — Inward supplies / Input Tax Credit (ITC).
 *
 * Source: `distributor_credits` where `money_transaction_id IS NULL`
 *   = product purchases (PO-linked or manual product credits).
 *   AMOUNT-type credits (linked to a MoneyTransaction) are excluded —
 *   those are cash inflows from distributors, not inward goods supplies.
 *
 * Tax breakdown:
 *   - PO-linked credits → sum (item.initial_qty * variant.p_price) per variant.tax rate.
 *   - Manual credits (no PO) → flat amount at 0% tax, treated as taxable_value
 *     (no item-level tax data exists on the credit row itself).
 */
export default defineEventHandler(async (event) => {

  /* ── AUTH ── */
  const session = await useAuthSession(event)
  const companyId = session.data.companyId
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  /* ── DATE FILTER ── */
  const query = getQuery(event)
  const startDate = query.startDate ? new Date(query.startDate as string) : new Date(0)
  const endDate   = query.endDate   ? new Date(query.endDate   as string) : new Date()

  const client = await pool.connect()
  try {

    /* PO-linked credits: item-level breakdown (taxable + tax per variant rate) */
    const itemBreakdown = await client.query(
      `
      SELECT
        dc.id              AS credit_id,
        dc.distributor_id,
        COALESCE(v.tax, 0) AS tax_rate,
        SUM(COALESCE(i.initial_qty, 0) * COALESCE(v.p_price, 0))                          AS taxable_value,
        SUM(COALESCE(i.initial_qty, 0) * COALESCE(v.p_price, 0) * COALESCE(v.tax, 0) / 100) AS tax_amount
      FROM distributor_credits dc
      JOIN purchase_orders po ON po.id = dc.purchase_order_id
      JOIN products        p  ON p.purchaseorder_id = po.id
      JOIN variants        v  ON v.product_id = p.id
      JOIN items           i  ON i.variant_id = v.id
      WHERE dc.company_id           = $1
        AND dc.money_transaction_id IS NULL
        AND dc.created_at           BETWEEN $2 AND $3
      GROUP BY dc.id, dc.distributor_id, COALESCE(v.tax, 0)
      `,
      [companyId, startDate, endDate]
    )

    /* Manual credits (no PO): flat amount at 0% tax */
    const manualCredits = await client.query(
      `
      SELECT
        dc.id              AS credit_id,
        dc.distributor_id,
        dc.amount          AS taxable_value
      FROM distributor_credits dc
      WHERE dc.company_id           = $1
        AND dc.money_transaction_id IS NULL
        AND dc.purchase_order_id    IS NULL
        AND dc.created_at           BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )

    /* Distributor names map */
    const distRes = await client.query(
      `SELECT id, name FROM distributors WHERE id = ANY($1::text[])`,
      [[
        ...itemBreakdown.rows.map(r => r.distributor_id),
        ...manualCredits.rows.map(r => r.distributor_id),
      ].filter((v, i, a) => v && a.indexOf(v) === i)]
    )
    const distName = new Map(distRes.rows.map(r => [r.id, r.name]))

    /* ── AGGREGATE ── */
    type RateBucket = { taxableValue: number; taxAmount: number }
    type DistBucket = { name: string; invoiceIds: Set<string>; taxableValue: number; taxAmount: number }

    const rateMap = new Map<number, RateBucket>()
    const distMap = new Map<string, DistBucket>()
    let totalTaxable = 0
    let totalTax     = 0

    for (const r of itemBreakdown.rows) {
      const rate    = Number(r.tax_rate || 0)
      const taxable = Number(r.taxable_value || 0)
      const tax     = Number(r.tax_amount || 0)
      const distId  = r.distributor_id

      totalTaxable += taxable
      totalTax     += tax

      const rb = rateMap.get(rate) ?? { taxableValue: 0, taxAmount: 0 }
      rb.taxableValue += taxable
      rb.taxAmount    += tax
      rateMap.set(rate, rb)

      const db = distMap.get(distId) ?? {
        name: distName.get(distId) || 'Unknown',
        invoiceIds: new Set<string>(),
        taxableValue: 0, taxAmount: 0,
      }
      db.invoiceIds.add(r.credit_id)
      db.taxableValue += taxable
      db.taxAmount    += tax
      distMap.set(distId, db)
    }

    for (const r of manualCredits.rows) {
      const taxable = Number(r.taxable_value || 0)
      const distId  = r.distributor_id

      totalTaxable += taxable

      const rb = rateMap.get(0) ?? { taxableValue: 0, taxAmount: 0 }
      rb.taxableValue += taxable
      rateMap.set(0, rb)

      const db = distMap.get(distId) ?? {
        name: distName.get(distId) || 'Unknown',
        invoiceIds: new Set<string>(),
        taxableValue: 0, taxAmount: 0,
      }
      db.invoiceIds.add(r.credit_id)
      db.taxableValue += taxable
      distMap.set(distId, db)
    }

    return {
      kpi: {
        totalItc: totalTax,
        cgst: totalTax / 2,
        sgst: totalTax / 2,
        taxableValue: totalTaxable,
        totalInwardValue: totalTaxable + totalTax,
      },
      rateSummary: Array.from(rateMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([rate, b]) => ({
          taxRate: rate,
          taxableValue: b.taxableValue,
          cgst: b.taxAmount / 2,
          sgst: b.taxAmount / 2,
          total: b.taxAmount,
        })),
      distributorSummary: Array.from(distMap.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(b => ({
          name: b.name,
          invoiceCount: b.invoiceIds.size,
          taxableValue: b.taxableValue,
          cgst: b.taxAmount / 2,
          sgst: b.taxAmount / 2,
          totalTax: b.taxAmount,
        })),
    }

  } finally {
    client.release()
  }
})
