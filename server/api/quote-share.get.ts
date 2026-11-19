import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { pool } from '../db'
import { sharedQuote } from '../utils/quote-share'
export default defineEventHandler(async event => {
  const token = getQuery(event).token
  if (typeof token !== 'string') throw createError({ statusCode: 404, statusMessage: 'Quote not found.' })
  setHeader(event, 'Cache-Control', 'no-store'); setHeader(event, 'Referrer-Policy', 'no-referrer')
  const db = await pool.connect()
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const result = await sharedQuote(db, token)
    await db.query('COMMIT')
    return result.publicData
  } catch (error) { await db.query('ROLLBACK'); throw error }
  finally { db.release() }
})
