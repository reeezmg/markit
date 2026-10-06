import 'dotenv/config'
import assert from 'node:assert/strict'
import { createEvent, createError } from 'h3'
import { pool } from '../server/db'
import handler from '../server/api/bill/status-history.get'

let signedIn = true
Object.assign(globalThis, {
  requireAuthSession: async () => {
    if (!signedIn) throw createError({ statusCode: 401 })
    return { data: { companyId: 'own', id: 'staff' } }
  },
})
function event(query: string, company = 'own') {
  const e = createEvent({ url: `/api/bill/status-history?${query}`, method: 'GET', headers: { 'x-company-filter': company } } as any, {} as any)
  e.context.authorizedCompanyIds = Promise.resolve(['own'])
  return e
}
const original = pool.query
const calls: any[] = []
;(pool as any).query = async (sql: string, args: any[]) => {
  calls.push({ sql, args })
  const history = sql.includes('FROM document_status_history')
  assert.deepEqual(args.at(-1), ['own'])
  const id = args[history ? 1 : 0]
  const rows = id === 'foreign' ? [] : history
    ? [{ sequence: '1', field: 'payment_status', status: 'PAID' }]
    : id === 'deleted' ? [] : [{ id, companyId: 'own', paidAt: '2026-10-01T10:00:00Z' }]
  return { rows, rowCount: rows.length }
}
try {
  const result = await handler(event('id=bill-1'))
  assert.equal(result.document?.id, 'bill-1')
  assert.equal(result.history[0].status, 'PAID')
  for (const type of ['order', 'checkout']) await handler(event(`id=record&type=${type}`))
  assert.equal((await handler(event('id=deleted'))).document, null)
  await assert.rejects(handler(event('id=foreign')), (e: any) => e.statusCode === 404)
  const count = calls.length
  await assert.rejects(handler(event('id=x&type=constructor')), (e: any) => e.statusCode === 400)
  await assert.rejects(handler(event('type=bill')), (e: any) => e.statusCode === 400)
  await assert.rejects(handler(event('id=x', 'foreign')), (e: any) => e.statusCode === 403)
  signedIn = false
  await assert.rejects(handler(event('id=x')), (e: any) => e.statusCode === 401)
  assert.equal(calls.length, count, 'Invalid/unauthorized requests must not query documents or history')
  console.log('Status history reader passed: scope, authentication, allowlist, paid date and deleted-document history.')
} finally {
  pool.query = original
  await pool.end()
}
