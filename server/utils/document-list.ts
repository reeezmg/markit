import { createError } from 'h3'

export function documentListOptions(query: Record<string, any>, sorts: readonly string[], defaultSort: string) {
  const invalid = (message: string): never => { throw createError({ statusCode: 400, statusMessage: message }) }
  const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 20)
  if (!Number.isInteger(page) || page < 1 || page > 100000) invalid('Invalid page.')
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) invalid('Invalid page size.')
  const sort = String(query.sort || defaultSort), order = String(query.order || 'desc')
  if (!sorts.includes(sort) || !['asc', 'desc'].includes(order)) invalid('Invalid table sort.')
  const dates: Record<string, string> = {}
  for (const key of ['from', 'to']) {
    if (!query[key]) continue
    const date = String(query[key]), time = new Date(date + 'T00:00:00Z')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+time) || time.toISOString().slice(0, 10) !== date) invalid('Select valid dates.')
    dates[key] = date
  }
  if (dates.from && dates.to && dates.from > dates.to) invalid('End date must follow the start date.')
  const amounts: Record<string, number> = {}
  for (const key of ['min', 'max']) {
    if (query[key] === undefined || query[key] === '') continue
    const amount = Number(query[key])
    if (!Number.isFinite(amount) || amount < 0) invalid('Select valid amounts.')
    amounts[key] = amount
  }
  if (amounts.min !== undefined && amounts.max !== undefined && amounts.min > amounts.max) invalid('Maximum amount must follow the minimum.')
  return { page, pageSize, sort, order: order.toUpperCase(), dates, amounts }
}

/** Timestamp columns in these source tables store UTC without a timezone. */
export function documentDateSql(column: string, dates: Record<string, string>, values: any[], dateOnly = false) {
  let sql = ''
  for (const [key, operator] of [['from', '>='], ['to', '<']] as const) {
    if (!dates[key]) continue
    values.push(dates[key])
    const boundary = `($${values.length}::date ${key === 'to' ? "+ INTERVAL '1 day'" : ''})`
    sql += ` AND ${column} ${operator} ${dateOnly ? boundary : `(${boundary}::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC'`}`
  }
  return sql
}

export function documentAmountSql(column: string, amounts: Record<string, number>, values: any[]) {
  let sql = ''
  for (const [key, operator] of [['min', '>='], ['max', '<=']] as const) {
    if (amounts[key] === undefined) continue
    values.push(amounts[key])
    sql += ` AND ${column} ${operator} $${values.length}::numeric`
  }
  return sql
}
