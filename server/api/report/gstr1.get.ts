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

    const [kpiRes, rateRes, hsnRes] = await Promise.all([

      /* =====================================================
         KPI TOTALS
      ===================================================== */

      client.query(
        `
        SELECT
          COUNT(DISTINCT b.id) AS bill_count,
          CASE WHEN $4 = true
            THEN COALESCE(SUM(e.value * 100.0 / (100.0 + NULLIF(e.tax, 0))), 0)
            ELSE COALESCE(SUM(e.value), 0)
          END AS total_taxable_value,
          CASE WHEN $4 = true
            THEN COALESCE(SUM(e.value * COALESCE(e.tax, 0) / (100.0 + NULLIF(e.tax, 0))), 0)
            ELSE COALESCE(SUM(e.value * COALESCE(e.tax, 0) / 100.0), 0)
          END AS total_tax,
          COALESCE(SUM(b.grand_total), 0) AS total_invoice_value
        FROM entries e
        JOIN bills b ON b.id = e.bill_id
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3
          AND ($5 = true OR b.precedence IS NOT TRUE)
        `,
        [companyId, startDate, endDate, isTaxIncluded, cleanup]
      ),

      /* =====================================================
         RATE-WISE SUMMARY (B2CS)
      ===================================================== */

      client.query(
        `
        SELECT
          COALESCE(e.tax, 0) AS tax_rate,
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
        GROUP BY COALESCE(e.tax, 0)
        ORDER BY COALESCE(e.tax, 0)
        `,
        [companyId, startDate, endDate, isTaxIncluded, cleanup]
      ),

      /* =====================================================
         HSN SUMMARY
      ===================================================== */

      client.query(
        `
        SELECT
          COALESCE(c.hsn, 'N/A') AS hsn_code,
          COALESCE(c.name, 'Uncategorized') AS category_name,
          COALESCE(e.tax, 0) AS tax_rate,
          COALESCE(SUM(e.qty), 0) AS total_qty,
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
        LEFT JOIN categories c ON c.id = e.category_id
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3
          AND ($5 = true OR b.precedence IS NOT TRUE)
        GROUP BY c.hsn, c.name, COALESCE(e.tax, 0)
        ORDER BY c.name, COALESCE(e.tax, 0)
        `,
        [companyId, startDate, endDate, isTaxIncluded, cleanup]
      )

    ])

    const kpi = kpiRes.rows[0]

    return {
      kpi: {
        billCount: Number(kpi.bill_count || 0),
        totalTaxableValue: Number(kpi.total_taxable_value || 0),
        totalTax: Number(kpi.total_tax || 0),
        totalInvoiceValue: Number(kpi.total_invoice_value || 0)
      },
      rateSummary: rateRes.rows.map(r => {
        const tax = Number(r.total_tax || 0)
        return {
          taxRate: Number(r.tax_rate || 0),
          taxableValue: Number(r.taxable_value || 0),
          cgst: tax / 2,
          sgst: tax / 2,
          igst: 0,
          totalTax: tax
        }
      }),
      hsnSummary: hsnRes.rows.map(r => {
        const tax = Number(r.total_tax || 0)
        return {
          hsnCode: r.hsn_code,
          description: r.category_name,
          uom: 'Nos',
          totalQty: Number(r.total_qty || 0),
          taxableValue: Number(r.taxable_value || 0),
          taxRate: Number(r.tax_rate || 0),
          cgst: tax / 2,
          sgst: tax / 2,
          totalTax: tax
        }
      })
    }

  } finally {
    client.release()
  }
})
