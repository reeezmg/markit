import { defineEventHandler, readBody, createError } from 'h3'
import crypto from 'crypto'
import { pool } from '~/server/db'

// Create a dimension preset — a packaging "box" or a "product" dimension preset.
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<{
    name?: string; type?: string
    weight?: number | null; length?: number | null; width?: number | null; height?: number | null
  }>(event)

  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const type = body?.type === 'product' ? 'product' : 'box'
  const num = (v: any) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v))

  const id = crypto.randomUUID()
  const { rows } = await pool.query(
    `INSERT INTO shipping_boxes (id, created_at, updated_at, name, type, weight, length, width, height, status, company_id)
     VALUES ($1, now(), now(), $2, $3, $4, $5, $6, $7, true, $8)
     RETURNING id, name, type, weight, length, width, height, status`,
    [id, name, type, num(body?.weight), num(body?.length), num(body?.width), num(body?.height), companyId],
  )
  return { dimension: rows[0] }
})
