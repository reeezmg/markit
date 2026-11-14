import { createError } from 'h3'
export type CarrierFetch = typeof globalThis.fetch
export const shippingError = (message: string, statusCode = 400) => createError({ statusCode, statusMessage: message, message })
export function carrierError(data: any, fallback: string): string {
  const value = data?.error || data?.data || data?.message || data
  return typeof value === 'string' && value.trim() ? value.trim() : value && Object.keys(value).length ? JSON.stringify(value) : fallback
}
/** Native fetch never retries carrier mutations. Keep upstream credentials out of errors. */
export async function carrierRequest(fetcher: CarrierFetch, url: string, options: RequestInit = {}, timeout = 20000) {
  let response: Response
  try { response = await fetcher(url, { ...options, signal: AbortSignal.timeout(timeout) }) }
  catch { throw shippingError('Could not reach the shipping carrier. Please try again shortly.', 502) }
  const text = await response.text()
  let data: any
  try { data = text ? JSON.parse(text) : {} } catch { data = text }
  if (!response.ok) throw shippingError(carrierError(data, 'Carrier request failed'), response.status >= 500 ? 502 : 400)
  return data
}
export function withQuery(url: string, query: Record<string, any>) {
  const parsed = new URL(url)
  for (const [key, value] of Object.entries(query)) if (value != null) parsed.searchParams.set(key, String(value))
  return parsed.toString()
}
