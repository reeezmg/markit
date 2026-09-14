import { createError, getQuery, setHeader } from 'h3'
import { pool } from '~/server/db'
import { validUnsubscribeToken } from '~/server/utils/ecommMarketing'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const company = String(q.company || '')
  const client = String(q.client || '')
  const token = String(q.token || '')
  if (!company || !client || !validUnsubscribeToken(company, client, token)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid unsubscribe link' })
  }
  await pool.query(`UPDATE company_clients SET marketing_opt_in_at = NULL,
    marketing_opt_in_requested_at = NULL, marketing_opt_in_email = NULL
    WHERE company_id = $1 AND client_id = $2`, [company, client])
  await pool.query(`UPDATE ecomm_marketing_jobs SET status = 'CANCELLED'
    WHERE company_id = $1 AND client_id = $2 AND status IN ('PENDING','FAILED')`, [company, client])
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribed</title></head><body style="font:16px system-ui;max-width:36rem;margin:3rem auto;padding:1rem"><h1>You are unsubscribed</h1><p>No further marketing messages will be sent from this store.</p></body></html>'
})
