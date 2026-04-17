import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {

  /* =====================================================
     AUTH
  ===================================================== */

  const session = await useAuthSession(event)
  const companyId = session.data.companyId

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

    const [kpiRes, rateRes, distRes] = await Promise.all([

      /* =====================================================
         KPI TOTALS
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
        `,
        [companyId, startDate, endDate]
      ),

      /* =====================================================
         RATE-WISE ITC
      ===================================================== */

      client.query(
        `
        SELECT
          COALESCE(pri.tax, 0) AS tax_rate,
          COALESCE(SUM(pri.subtotal), 0) AS taxable_value,
          COALESCE(SUM(pri.tax_amount), 0) AS total_tax
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
        WHERE pr.company_id = $1
          AND pr.created_at BETWEEN $2 AND $3
        GROUP BY COALESCE(pri.tax, 0)
        ORDER BY COALESCE(pri.tax, 0)
        `,
        [companyId, startDate, endDate]
      ),

      /* =====================================================
         DISTRIBUTOR-WISE
      ===================================================== */

      client.query(
        `
        SELECT
          COALESCE(d.name, 'Unknown') AS distributor_name,
          COUNT(DISTINCT pr.id) AS invoice_count,
          COALESCE(SUM(pri.subtotal), 0) AS taxable_value,
          COALESCE(SUM(pri.tax_amount), 0) AS total_tax
        FROM purchase_return_items pri
        JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
        LEFT JOIN distributors d ON d.id = pr.distributor_id
        WHERE pr.company_id = $1
          AND pr.created_at BETWEEN $2 AND $3
        GROUP BY d.id, d.name
        ORDER BY d.name
        `,
        [companyId, startDate, endDate]
      )

    ])

    const kpi = kpiRes.rows[0]
    const totalItc = Number(kpi.total_itc || 0)

    return {
      kpi: {
        totalItc,
        cgst: totalItc / 2,
        sgst: totalItc / 2,
        taxableValue: Number(kpi.taxable_value || 0),
        totalInwardValue: Number(kpi.total_inward_value || 0)
      },
      rateSummary: rateRes.rows.map(r => {
        const tax = Number(r.total_tax || 0)
        return {
          taxRate: Number(r.tax_rate || 0),
          taxableValue: Number(r.taxable_value || 0),
          cgst: tax / 2,
          sgst: tax / 2,
          total: tax
        }
      }),
      distributorSummary: distRes.rows.map(r => {
        const tax = Number(r.total_tax || 0)
        return {
          name: r.distributor_name,
          invoiceCount: Number(r.invoice_count || 0),
          taxableValue: Number(r.taxable_value || 0),
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
