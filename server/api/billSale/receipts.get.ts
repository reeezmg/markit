import { defineEventHandler, getQuery, createError } from 'h3'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { pool } from '~/server/db'
import { receiptBill } from '~/server/utils/bill-receipts'

export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event)
  const { billId } = getQuery(event)
  if (typeof billId !== 'string') throw createError({statusCode:400,statusMessage:'Select a bill'})
  const client = await pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const companyId = session.data.companyId
    const state = await receiptBill(client,companyId,billId)
    const accounts = (await client.query(`SELECT id,name,account_type AS type FROM accountant_v2_accounting_accounts
      WHERE company_id=$1 AND account_type IN ('CASH','BANK') AND is_active=true AND deleted_at IS NULL ORDER BY name`, [companyId])).rows
    await client.query('COMMIT')
    return { billId,invoiceNumber:state.bill.invoice_number,outstanding:state.outstanding,payments:state.payments,accounts }
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
})
