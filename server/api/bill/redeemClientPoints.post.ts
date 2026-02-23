import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const {
    companyId,
    clientId,
    points,
    mode, // 'redeem' | 'revert'
  } = body || {}

if (
  !companyId ||
  !clientId ||
  points === undefined ||
  points === null ||
  !mode
) {
  throw createError({
    statusCode: 400,
    statusMessage: 'companyId, clientId, points and mode are required',
  })
}

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const query =
      mode === 'redeem'
        ? `
          UPDATE company_clients
          SET points = points - $3
          WHERE company_id = $1
            AND client_id = $2
            AND points >= $3
          RETURNING points;
        `
        : `
          UPDATE company_clients
          SET points = points + $3
          WHERE company_id = $1
            AND client_id = $2
          RETURNING points;
        `

    const res = await client.query(query, [
      companyId,
      clientId,
      points,
    ])

    if (res.rowCount === 0) {
      throw new Error('Insufficient points or client not found')
    }

    await client.query('COMMIT')

    return {
      points: res.rows[0].points,
    }
  } catch (err: any) {
    await client.query('ROLLBACK')

    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Failed to update points',
    })
  } finally {
    client.release()
  }
})
