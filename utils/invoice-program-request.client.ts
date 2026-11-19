/** Retain the same request after a timeout or page reload; clear only after confirmed success. */
const pending = new Map<string, { fingerprint: string; requestId: string }>()
export function programRequest(key: string, payload: any) {
  const fingerprint = JSON.stringify(payload), storageKey = 'invoice-program-request:' + key
  let previous: any = pending.get(storageKey)
  try { previous = JSON.parse(localStorage.getItem(storageKey) || 'null') || previous } catch { /* Storage may be disabled. */ }
  const requestId = previous?.fingerprint === fingerprint && typeof previous.requestId === 'string' ? previous.requestId : crypto.randomUUID()
  pending.set(storageKey, { fingerprint, requestId })
  try { localStorage.setItem(storageKey, JSON.stringify({ fingerprint, requestId })) } catch { /* In-memory retries remain available to the caller. */ }
  return { requestId, clear: () => { pending.delete(storageKey); try { localStorage.removeItem(storageKey) } catch { /* Optional storage. */ } } }
}

