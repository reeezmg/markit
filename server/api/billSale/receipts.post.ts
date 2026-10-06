import { defineEventHandler, readBody, createError } from 'h3'
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope'
import { pool } from '~/server/db'
import { recordBillReceipt } from '~/server/utils/bill-receipts'

export default defineEventHandler(async event => {
  const session = await useCompanyRequestSession(event)
  const body = await readBody(event)
  if (body.companyId && body.companyId !== session.data.companyId) throw createError({statusCode:403,statusMessage:'Company access denied'})
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT set_config('app.status_source','bill.credit-receipt',true),set_config('app.status_actor',$1,true)`, ['user:'+session.data.id])
    const result = await recordBillReceipt(client,session.data.companyId,session.data.id,body)
    await client.query('COMMIT')
    return result
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
})
