import { createHmac, timingSafeEqual } from 'node:crypto'
import nodemailer from 'nodemailer'
import { createError } from 'h3'
import { pool } from '~/server/db'
type MarketingClient = { query: (sql: string, params?: unknown[]) => Promise<any>; release: () => void }

export const segments = ['all', 'new', 'repeat', 'inactive', 'cart'] as const
export type Segment = typeof segments[number]
export function isSegment(value: unknown): value is Segment { return segments.includes(value as Segment) }

export const segmentPredicate: Record<Segment, string> = {
  all: 'true',
  new: `NOT EXISTS (SELECT 1 FROM ecomm_orders o WHERE o.company_id = cc.company_id AND o.client_id = cc.client_id AND o.status <> 'CANCELLED')`,
  repeat: `EXISTS (SELECT 1 FROM ecomm_orders o WHERE o.company_id = cc.company_id AND o.client_id = cc.client_id AND o.status <> 'CANCELLED' GROUP BY o.client_id HAVING count(*) >= 2)`,
  inactive: `EXISTS (SELECT 1 FROM ecomm_orders o WHERE o.company_id = cc.company_id AND o.client_id = cc.client_id AND o.status <> 'CANCELLED' HAVING max(o.created_at) < now() - interval '90 days')`,
  cart: `EXISTS (SELECT 1 FROM ecomm_carts ec WHERE ec.company_id = cc.company_id AND ec.client_id = cc.client_id AND ec.items::jsonb <> '[]'::jsonb)`,
}

export async function requireStorefrontStaff(event: any) {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  const userId = session.data?.id as string | undefined
  if (!companyId || !userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const { rows } = await pool.query(
    `SELECT role FROM company_users WHERE company_id = $1 AND user_id = $2
      AND status = true AND deleted = false LIMIT 1`,
    [companyId, userId],
  )
  if (!rows.length) throw createError({ statusCode: 403, statusMessage: 'Company access required' })
  return { companyId, userId, role: rows[0].role as string }
}

export async function requireMarketingManager(event: any) {
  const staff = await requireStorefrontStaff(event)
  if (!['admin', 'manager'].includes(staff.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Marketing manager access required' })
  }
  return staff.companyId
}

export async function recordMarketingAudit(companyId: string, userId: string, action: string, entityId?: string, client?: MarketingClient) {
  await (client || pool).query(`INSERT INTO ecomm_marketing_audit (company_id, actor_user_id, action, entity_id)
    VALUES ($1, $2, $3, $4)`, [companyId, userId, action, entityId || null])
}

export async function marketingTransaction<T>(operation: (client: MarketingClient) => Promise<T>): Promise<T> {
  const client = await pool.connect() as MarketingClient
  try {
    await client.query('BEGIN')
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export function unsubscribeToken(companyId: string, clientId: string) {
  const secret = process.env.MARKETING_LINK_SECRET
  if (!secret || secret.length < 32) throw new Error('MARKETING_LINK_SECRET must be at least 32 characters')
  return createHmac('sha256', secret).update(`${companyId}:${clientId}`).digest('hex')
}

export function validUnsubscribeToken(companyId: string, clientId: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false
  return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(unsubscribeToken(companyId, clientId), 'hex'))
}

export function renderMarketingBody(body: string, name: string) {
  return body.replaceAll('{name}', name || 'there')
}

export async function sendMarketingEmail(to: string, subject: string, body: string, unsubscribeUrl: string) {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !Number.isInteger(port) || !user || !pass) throw new Error('SMTP is not configured')
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  await transport.sendMail({ from: user, to, subject, text: `${body}\n\nUnsubscribe: ${unsubscribeUrl}`,
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` } })
}
