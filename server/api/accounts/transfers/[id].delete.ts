import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'
import { deleteAccountLedgerForSource } from '~/server/utils/account-ledger'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Transfer id is required' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await deleteAccountLedgerForSource(client, { companyId, sourceType: 'ACCOUNT_TRANSFER', sourceId: id })
    const res = await client.query(`DELETE FROM account_transfers WHERE id = $1 AND company_id = $2`, [id, companyId])
    if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Transfer not found' })
    await client.query('COMMIT')
    return { success: true }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})
