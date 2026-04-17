import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {

  /* =====================================================
     AUTH
  ===================================================== */

  const session = await useAuthSession(event)
  const companyId = session.data.companyId
  const cleanup = session.data.cleanup ?? false
  const isTaxIncluded = session.data.isTaxIncluded ?? true

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  /* =====================================================
     DATE FILTER
  ===================================================== */

  const query = getQuery(event)

  const startDate = query.startDate
    ? new Date(query.startDate as string)
    : new Date(0)

  const endDate = query.endDate
    ? new Date(query.endDate as string)
    : new Date()

  const client = await pool.connect()

  try {

    const [outwardRes, itcRes] = await Promise.all([

      /* =====================================================
         TABLE 3.1 — OUTWARD SUPPLIES BY TYPE
      ===================================================== */

      client.query(
        `
        SELECT
          CASE WHEN COALESCE(e.tax, 0) > 0 THEN 'taxable' ELSE 'nil' END AS supply_type,
          CASE WHEN $4 = true
            THEN COALESCE(SUM(e.value * 100.0 / (100.0 + NULLIF(e.tax, 0))), 0)
            ELSE COALESCE(SUM(e.value), 0)
          END AS taxable_value,
          CASE WHEN $4 = true
            THEN COALESCE(SUM(e.value * COALESCE(e.tax, 0) / (100.0 + NULLIF(e.tax, 0))), 0)
            ELSE COALESCE(SUM(e.value * COALESCE(e.tax, 0) / 100.0), 0)
          END AS total_tax
        FROM entries e
        JOIN bills b ON b.id = e.bill_id
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3
          AND ($5 = true OR b.precedence IS NOT TRUE)
        GROUP BY supply_type
        `,
        [companyId, startDate, endDate, isTaxIncluded, cleanup]
      ),

      /* =====================================================
         TABLE 4 — ITC FROM PURCHASE RETURNS
      ===================================================== */

      client.query(
        `
        SELECT
          COALESCE(SUM(pri.tax_amount), 0) AS total_itc,
          COALESCE(SUM(pri.subtotal), 0) AS taxable_value,
          COALESCE(SUM(pri.subtotal + pri.tax_amount), 0) AS total_inward_value
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
        WHERE pr.company_id = $1
          AND pr.created_at BETWEEN $2 AND $3
          AND pri.tax > 0
        `,
        [companyId, startDate, endDate]
      )

    ])

    /* =====================================================
       EXTRACT ROWS
    ===================================================== */

    const taxableRow = outwardRes.rows.find(r => r.supply_type === 'taxable')
    const nilRow = outwardRes.rows.find(r => r.supply_type === 'nil')
    const itc = itcRes.rows[0]

    const outwardTaxableValue = Number(taxableRow?.taxable_value || 0)
    const outwardTax = Number(taxableRow?.total_tax || 0)
    const outwardCgst = outwardTax / 2
    const outwardSgst = outwardTax / 2

    const totalItc = Number(itc.total_itc || 0)
    const itcCgst = totalItc / 2
    const itcSgst = totalItc / 2

    return {
      outwardTaxable: {
        taxableValue: outwardTaxableValue,
        cgst: outwardCgst,
        sgst: outwardSgst,
        totalTax: outwardTax
      },
      nilRated: {
        taxableValue: Number(nilRow?.taxable_value || 0)
      },
      itc: {
        totalItc,
        cgst: itcCgst,
        sgst: itcSgst,
        taxableValue: Number(itc.taxable_value || 0),
        totalInwardValue: Number(itc.total_inward_value || 0)
      },
      netPayable: {
        cgst: Math.max(0, outwardCgst - itcCgst),
        sgst: Math.max(0, outwardSgst - itcSgst)
      }
    }

  } finally {
    client.release()
  }
})
