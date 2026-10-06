/** Keep request URLs, database details and runtime errors out of billing toasts. */
export function billingErrorMessage(error: any, fallback = 'Unable to complete this action. Please try again.'): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'No internet connection'
  }

  const status = Number(error?.statusCode || error?.status || error?.response?.status || 0)
  const details = [error?.name, error?.message, error?.cause?.name, error?.cause?.message, error?.cause?.code]
    .filter(Boolean).join(' ')

  if (/timeout|timed out|ETIMEDOUT/i.test(details) || status === 408 || status === 504) {
    return 'The request took too long. Please try again.'
  }
  if (!status && /failed to fetch|fetch failed|network\s?error|network request failed|load failed|ERR_NETWORK|ENOTFOUND|ECONNREFUSED|ECONNRESET|\[no response\]/i.test(details)) {
    return 'Unable to connect. Check your internet connection and try again.'
  }

  const technical = /https?:\/\/|\/api\/|\[object Object\]|\b(?:SQL|Prisma|Postgres|syntax error|invalid input syntax|constraint|duplicate key|deadlock|permission denied for|relation .*does not exist|column .*does not exist|stack trace|TypeError|ReferenceError|Cannot read|is not a function|unexpected token)\b|\bat \S+.*:\d+|\b(?:select|insert into|update|delete from)\s+.*\b(?:from|where|values|set)\b/i
  for (const value of [error?.data?.statusMessage, error?.data?.message, error?.info?.message, error?.statusMessage, error?.message]) {
    if (typeof value !== 'string') continue
    const message = value.trim()
    if (!message || message.length > 300 || technical.test(message)) continue
    if (/^(?:\[.*\]|\d{3}\b|internal server error|bad request|bad gateway|gateway timeout|fetch failed|unknown error|error$|unauthorized|forbidden|not found$|service unavailable)/i.test(message)) continue
    return message
  }

  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return 'You do not have permission to perform this action.'
  if (status === 404) return 'The requested record could not be found. Please refresh and try again.'
  if (status === 429) return 'Too many requests. Please wait a moment and try again.'
  return fallback
}
