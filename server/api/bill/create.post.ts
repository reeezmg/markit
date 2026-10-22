import { lockCompanyRequest } from '~/server/utils/lockCompanyRequest';
import { setDocumentStatusContext } from '~/server/utils/document-status-context'
import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { saveSourceRequest } from '~/server/utils/source-save-request'
import { createBillSource } from '~/server/utils/create-bill-source'


const TRANSIENT_ERROR_CODES = [
  '40001',
  '40P01',
  '53300',
  '57P01',
  '55006',
  '08006',
  '08003',
  'P1001',
]

async function logError(error: any, body: any) {
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO save_error_requests (id, created_at, company_id, request_data, error_message)
       VALUES (gen_random_uuid()::text, now(), $1, $2, $3)`,
      [
        body?.companyId || null,
        JSON.stringify(body),
        error?.message || 'Unknown error',
      ],
    )
  } catch (logErr: any) {
    console.error('Failed to log bill create error:', logErr?.message || logErr)
  } finally {
    client.release()
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  async function runCreate(attempt = 1): Promise<any> {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await setDocumentStatusContext(event, client, 'bill.create')
      await lockCompanyRequest(event, client)
      const result = await saveSourceRequest(client, body.companyId, body.userId || 'billing', 'bill-create', body.uuid, body, async () => {
        return createBillSource(client, body)
      })
      await client.query('COMMIT')
      return result
    } catch (error: any) {
      await client.query('ROLLBACK')
      console.error(`Bill create attempt ${attempt} failed:`, error?.message || error)

      if (TRANSIENT_ERROR_CODES.includes(error?.code) && attempt < 3) {
        const delay = 200 * Math.pow(2, attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, delay))
        return runCreate(attempt + 1)
      }

      await logError(error, body)
      throw error
    } finally {
      client.release()
    }
  }

  try {
    return await runCreate()
  } catch (error: any) {
    throw createError({
      statusCode: error?.statusCode || 500,
      statusMessage: error?.message || 'Failed to create bill after retries',
    })
  }
})
