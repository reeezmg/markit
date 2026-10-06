import crypto from 'node:crypto'
import { pool } from '~/server/db'

export async function storefrontUsesAws(companyId: string) {
  const { rows } = await pool.query('SELECT repository_provider FROM storefront_sources WHERE company_id=$1', [companyId])
  return rows[0]?.repository_provider === 'codecommit'
}

export async function storefrontTransport<T>(path: string, init: RequestInit = {}, companyId?: string, forceAws = false): Promise<T> {
  const parsed = typeof init.body === 'string' ? JSON.parse(init.body) : null
  const company = companyId || parsed?.companyId || new URL(path, 'http://internal').searchParams.get('companyId')
  const aws = forceAws || (company ? await storefrontUsesAws(company) : false)
  const url = process.env[aws ? 'EDIT_AWS_ORCHESTRATOR_URL' : 'EDIT_ORCHESTRATOR_URL'] || ''
  const secret = process.env[aws ? 'AWS_ORCHESTRATOR_SHARED_SECRET' : 'ORCHESTRATOR_SHARED_SECRET'] || ''
  if (!url || !secret) throw new Error('The storefront editing service is not configured')
  if (aws && !url.startsWith('https://')) throw new Error('AWS storefront service requires HTTPS')
  const timeout = aws && /^\/agent\/(undo|fork)$/.test(path) ? 12 * 60_000 : 55_000
  const attempts = !init.method || init.method === 'GET' ? 3 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    const body = typeof init.body === 'string' ? init.body : ''
    const timestamp = String(Date.now())
    const signature = crypto.createHmac('sha256', secret).update(`${timestamp}\n${path}\n${body}`).digest('hex')
    const response = await fetch(`${url}${path}`, { ...init, signal: init.signal || AbortSignal.timeout(timeout), headers: {
      ...init.headers, 'Content-Type': 'application/json', 'x-markit-timestamp': timestamp, 'x-markit-signature': signature,
    } })
    if (response.ok) return await response.json() as T
    const transient = response.status === 429 || response.status >= 500
    if (!transient || attempt === attempts - 1) {
      const detail = await response.json().catch(() => ({})) as { error?: string }
      throw Object.assign(new Error(detail.error || 'Storefront service request failed'), { statusCode: response.status, transient })
    }
    await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt))
  }
  throw new Error('Storefront service request failed')
}
