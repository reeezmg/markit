import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

const round2 = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  const cleanup = session.data?.cleanup ?? false
  const isTaxIncluded = session.data?.isTaxIncluded ?? true

  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const query = getQuery(event)
  const from = query.from ? new Date(query.from as string) : new Date(0)
  const to = query.to ? new Date(query.to as string) : new Date()
  const client = await pool.connect()

  try {
    const [rowsRes, rateRes] = await Promise.all([
      client.query(
        `
        WITH bill_tax AS (
          SELECT
            b.id,
            b.invoice_number,
            b.created_at,
            b.grand_total,
            CASE WHEN $4 = true
              THEN COALESCE(SUM(e.value * 100.0 / (100.0 + NULLIF(e.tax, 0))), 0)
              ELSE COALESCE(SUM(e.value), 0)
            END AS taxable_value,
            CASE WHEN $4 = true
              THEN COALESCE(SUM(e.value * COALESCE(e.tax, 0) / (100.0 + NULLIF(e.tax, 0))), 0)
              ELSE COALESCE(SUM(e.value * COALESCE(e.tax, 0) / 100.0), 0)
            END AS tax_amount
          FROM entries e
          JOIN bills b ON b.id = e.bill_id
          WHERE b.company_id = $1
            AND b.deleted = false
            AND b.payment_status IN ('PAID', 'PENDING')
            AND b.is_markit = false
            AND b.created_at BETWEEN $2 AND $3
            AND ($5 = true OR b.precedence IS NOT TRUE)
          GROUP BY b.id, b.invoice_number, b.created_at, b.grand_total
        )
        SELECT *
        FROM bill_tax
        WHERE COALESCE(tax_amount, 0) > 0
        ORDER BY created_at ASC, id ASC
        `,
        [companyId, from, to, isTaxIncluded, cleanup],
      ),
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
          END AS tax_amount
        FROM entries e
        JOIN bills b ON b.id = e.bill_id
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.payment_status IN ('PAID', 'PENDING')
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3
          AND ($5 = true OR b.precedence IS NOT TRUE)
        GROUP BY COALESCE(e.tax, 0)
        HAVING CASE WHEN $4 = true
          THEN COALESCE(SUM(e.value * COALESCE(e.tax, 0) / (100.0 + NULLIF(e.tax, 0))), 0)
          ELSE COALESCE(SUM(e.value * COALESCE(e.tax, 0) / 100.0), 0)
        END > 0
        ORDER BY COALESCE(e.tax, 0)
        `,
        [companyId, from, to, isTaxIncluded, cleanup],
      ),
    ])

    let runningBalance = 0
    const ledger = rowsRes.rows.map((row) => {
      const taxAmount = round2(row.tax_amount)
      const taxableValue = round2(row.taxable_value)
      runningBalance = round2(runningBalance + taxAmount)
      return {
        date: row.created_at,
        source: 'BILL',
        ref: row.id,
        invoiceNumber: row.invoice_number,
        description: row.invoice_number ? `Bill #${row.invoice_number}` : 'Bill',
        taxableValue,
        cgst: round2(taxAmount / 2),
        sgst: round2(taxAmount / 2),
        igst: 0,
        taxAmount,
        invoiceTotal: round2(row.grand_total),
        runningBalance,
      }
    })

    const totalTax = round2(ledger.reduce((sum, row) => sum + row.taxAmount, 0))
    const totalTaxableValue = round2(ledger.reduce((sum, row) => sum + row.taxableValue, 0))
    const totalInvoiceValue = round2(ledger.reduce((sum, row) => sum + row.invoiceTotal, 0))

    return {
      from,
      to,
      summary: {
        billCount: ledger.length,
        taxableValue: totalTaxableValue,
        cgst: round2(totalTax / 2),
        sgst: round2(totalTax / 2),
        igst: 0,
        totalTax,
        invoiceValue: totalInvoiceValue,
      },
      rateSummary: rateRes.rows.map((row) => {
        const taxAmount = round2(row.tax_amount)
        return {
          taxRate: round2(row.tax_rate),
          taxableValue: round2(row.taxable_value),
          cgst: round2(taxAmount / 2),
          sgst: round2(taxAmount / 2),
          igst: 0,
          totalTax: taxAmount,
        }
      }),
      ledger,
      closingBalance: runningBalance,
    }
  } finally {
    client.release()
  }
})
