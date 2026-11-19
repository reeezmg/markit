export function serviceLabel(value: unknown) {
  const text = String(value || '')
  return text ? text.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : '—'
}
export function serviceStatusColor(value: string): 'green' | 'red' | 'orange' | 'blue' | 'gray' {
  if (['ACTIVE', 'COMPLETED', 'RESOLVED', 'APPROVED', 'PAID'].includes(value)) return 'green'
  if (['OVERDUE', 'REJECTED', 'RETURNED', 'EXPIRED'].includes(value)) return 'red'
  if (['PENDING', 'DUE', 'OPEN'].includes(value)) return 'orange'
  if (['SCHEDULED', 'IN_PROGRESS'].includes(value)) return 'blue'
  return 'gray'
}
export function serviceDate(value: unknown) {
  if (!value) return '—'
  const date = new Date(String(value))
  return Number.isFinite(+date) ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(date) : '—'
}
export function serviceCurrency(value: unknown, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value) || 0)
}
export function serviceMatches(row: any, query: string) {
  return !query.trim() || JSON.stringify(row).toLowerCase().includes(query.trim().toLowerCase())
}
