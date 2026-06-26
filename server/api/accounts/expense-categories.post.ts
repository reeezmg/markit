import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<{ name?: string }>(event)
  const name = String(body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Category name is required' })

  const id = crypto.randomUUID()
  const res = await pool.query(
    `
    INSERT INTO expense_categories (id, company_id, name, status, created_at, updated_at)
    VALUES ($1, $2, $3, true, now(), now())
    RETURNING id, name
    `,
    [id, companyId, name],
  )
  return res.rows[0]
})
