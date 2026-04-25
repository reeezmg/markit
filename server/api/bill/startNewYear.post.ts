import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { companyId, closingDate } = body

  if (!companyId || !closingDate) {
    throw createError({
      statusCode: 400,
      statusMessage: 'companyId and closingDate are required',
    })
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // ── 0. Read current prefixes from company ──
    const prefixRes = await client.query(`
      SELECT
        COALESCE(quote_prefix, 'QT') AS quote_prefix,
        COALESCE(sales_order_prefix, 'SO') AS so_prefix,
        COALESCE(invoice_prefix, 'INV') AS invoice_prefix
      FROM companies WHERE id = $1
    `, [companyId])
    const quotePrefix = prefixRes.rows[0]?.quote_prefix || 'QT'
    const soPrefix = prefixRes.rows[0]?.so_prefix || 'SO'
    const invoicePrefix = prefixRes.rows[0]?.invoice_prefix || 'INV'

    // ── 1. Renumber bills (invoice_number) after closing date ──
    await client.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS new_num
        FROM bills
        WHERE company_id = $1 AND created_at > $2 AND deleted = false
      )
      UPDATE bills SET invoice_number = numbered.new_num
      FROM numbered WHERE bills.id = numbered.id
    `, [companyId, closingDate])

    const billCountRes = await client.query(`
      SELECT COUNT(*) AS cnt FROM bills
      WHERE company_id = $1 AND created_at > $2 AND deleted = false
    `, [companyId, closingDate])
    const nextBillCounter = Number(billCountRes.rows[0].cnt) + 1

    // ── 2. Renumber bills invoice_code after closing date ──
    const invoiceCodeExpr = invoicePrefix
      ? `$3 || '-' || LPAD(numbered.new_num::text, 6, '0')`
      : `LPAD(numbered.new_num::text, 6, '0')`

    await client.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS new_num
        FROM bills
        WHERE company_id = $1 AND created_at > $2 AND deleted = false
          AND invoice_code IS NOT NULL
      )
      UPDATE bills SET invoice_code = ${invoiceCodeExpr}
      FROM numbered WHERE bills.id = numbered.id
    `, invoicePrefix ? [companyId, closingDate, invoicePrefix] : [companyId, closingDate])

    const invoiceCountRes = await client.query(`
      SELECT COUNT(*) AS cnt FROM bills
      WHERE company_id = $1 AND created_at > $2 AND deleted = false
        AND invoice_code IS NOT NULL
    `, [companyId, closingDate])
    const nextInvoiceCounter = Number(invoiceCountRes.rows[0].cnt) + 1

    // ── 3. Renumber quotes (quote_number) after closing date ──
    const quoteExpr = quotePrefix
      ? `$3 || '-' || LPAD(numbered.new_num::text, 6, '0')`
      : `LPAD(numbered.new_num::text, 6, '0')`

    await client.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY quote_date ASC, id ASC) AS new_num
        FROM quotes
        WHERE company_id = $1 AND quote_date > $2 AND deleted = false
      )
      UPDATE quotes SET quote_number = ${quoteExpr}
      FROM numbered WHERE quotes.id = numbered.id
    `, quotePrefix ? [companyId, closingDate, quotePrefix] : [companyId, closingDate])

    const quoteCountRes = await client.query(`
      SELECT COUNT(*) AS cnt FROM quotes
      WHERE company_id = $1 AND quote_date > $2 AND deleted = false
    `, [companyId, closingDate])
    const nextQuoteCounter = Number(quoteCountRes.rows[0].cnt) + 1

    // ── 4. Renumber sales orders (order_number) after closing date ──
    const soExpr = soPrefix
      ? `$3 || '-' || LPAD(numbered.new_num::text, 5, '0')`
      : `LPAD(numbered.new_num::text, 5, '0')`

    await client.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY order_date ASC, id ASC) AS new_num
        FROM sales_orders
        WHERE company_id = $1 AND order_date > $2 AND deleted = false
      )
      UPDATE sales_orders SET order_number = ${soExpr}
      FROM numbered WHERE sales_orders.id = numbered.id
    `, soPrefix ? [companyId, closingDate, soPrefix] : [companyId, closingDate])

    const soCountRes = await client.query(`
      SELECT COUNT(*) AS cnt FROM sales_orders
      WHERE company_id = $1 AND order_date > $2 AND deleted = false
    `, [companyId, closingDate])
    const nextSoCounter = Number(soCountRes.rows[0].cnt) + 1

    // ── 5. Renumber payments (payment_number) after closing date ──
    await client.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY payment_date ASC, id ASC) AS new_num
        FROM payments
        WHERE company_id = $1 AND payment_date > $2 AND deleted = false
      )
      UPDATE payments SET payment_number = numbered.new_num
      FROM numbered WHERE payments.id = numbered.id
    `, [companyId, closingDate])

    const paymentCountRes = await client.query(`
      SELECT COUNT(*) AS cnt FROM payments
      WHERE company_id = $1 AND payment_date > $2 AND deleted = false
    `, [companyId, closingDate])
    const nextPaymentCounter = Number(paymentCountRes.rows[0].cnt) + 1

    // ── 6. Update company: set closing_date + reset counters ──
    await client.query(`
      UPDATE companies SET
        closing_date = $2,
        bill_counter = $3,
        quote_counter = $4,
        sales_order_counter = $5,
        invoice_counter = $6,
        payment_counter = $7
      WHERE id = $1
    `, [
      companyId,
      closingDate,
      nextBillCounter,
      nextQuoteCounter,
      nextSoCounter,
      nextInvoiceCounter,
      nextPaymentCounter,
    ])

    await client.query('COMMIT')

    return {
      success: true,
      counters: {
        billCounter: nextBillCounter,
        quoteCounter: nextQuoteCounter,
        salesOrderCounter: nextSoCounter,
        invoiceCounter: nextInvoiceCounter,
        paymentCounter: nextPaymentCounter,
      },
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to start new year: ' + (err as Error).message,
    })
  } finally {
    client.release()
  }
})
