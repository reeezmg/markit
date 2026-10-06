import { createHash } from 'node:crypto'
import { createError } from 'h3'

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]))
  return value
}
/** Caller owns the transaction: the receipt commits with the source and its journals. */
export async function saveSourceRequest(db: any, companyId: string, userId: string, resource: string, requestId: string, payload: any, save: () => Promise<any>) {
  if (!requestId || !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)) throw createError({ statusCode: 400, statusMessage: 'A valid request ID is required' })
  const id = 'source-save:' + createHash('sha256').update(`${companyId}:${resource}:${requestId}`).digest('hex')
  const fingerprint = createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex')
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [id])
  const previous = (await db.query('SELECT "after" FROM accountant_v2_accountant_audit WHERE id=$1 AND company_id=$2', [id, companyId])).rows[0]?.after
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw createError({ statusCode: 409, statusMessage: 'This request already saved different details. Review the saved entry before starting a new request.' })
    return previous.result
  }
  const result = await save()
  await db.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
    VALUES($1,$2,$3,'saved',$4,$5,$6::jsonb,now())`, [id, companyId, userId, resource, requestId, JSON.stringify({ fingerprint, result })])
  return result
}
