import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

const SORT_COLUMNS: Record<string, string> = {
  id: 'e.id',
  expenseNumber: 'e.expense_number',
  expenseDate: 'e.expense_date',
  'expensecategory.name': 'ec.name',
  'user.name': 'cu.name',
  note: 'e.note',
  paymentMode: 'e.payment_mode',
  totalAmount: 'e.total_amount',
  status: 'e.status',
}

const toArray = (val: any): string[] => {
  if (val == null) return []
  return (Array.isArray(val) ? val : [val]).map((v) => String(v)).filter((v) => v.length > 0)
}

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const query = getQuery(event)

  const search = (query.search ? String(query.search) : '').trim()
  const statuses = toArray(query.status)
  const paymentModes = toArray(query.paymentMode)
  const categoryIds = toArray(query.categoryIds)
  const userIds = toArray(query.userIds)
  const from = query.from ? new Date(String(query.from)) : null
  const to = query.to ? new Date(String(query.to)) : null
  const minAmount = query.minAmount != null && query.minAmount !== '' ? Number(query.minAmount) : null
  const maxAmount = query.maxAmount != null && query.maxAmount !== '' ? Number(query.maxAmount) : null

  const sortColumn = SORT_COLUMNS[String(query.sortColumn || 'id')] || 'e.id'
  const sortDirection = String(query.sortDirection || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'

  const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1)
  const pageCount = Math.max(1, parseInt(String(query.pageCount || '10'), 10) || 10)
  const offset = (page - 1) * pageCount

  // Build shared WHERE clause + params
  const conditions: string[] = ['e.company_id = $1']
  const params: any[] = [companyId]
  const add = (clause: string, value: any) => {
    params.push(value)
    conditions.push(clause.replace('$$', `$${params.length}`))
  }

  if (search) {
    params.push(search)
    const p = `$${params.length}`
    conditions.push(`(e.note ILIKE '%' || ${p} || '%' OR ec.name ILIKE '%' || ${p} || '%' OR cu.name ILIKE '%' || ${p} || '%')`)
  }
  if (statuses.length) add('e.status = ANY($$)', statuses)
  if (paymentModes.length) add('e.payment_mode::text = ANY($$)', paymentModes)
  if (categoryIds.length) add('e.expense_category_id = ANY($$)', categoryIds)
  if (userIds.length) add('e.from_id = ANY($$)', userIds)
  if (from) add('e.expense_date >= $$', from)
  if (to) add('e.expense_date <= $$', to)
  if (minAmount != null && Number.isFinite(minAmount)) add('e.total_amount >= $$', minAmount)
  if (maxAmount != null && Number.isFinite(maxAmount)) add('e.total_amount <= $$', maxAmount)

  const whereSql = conditions.join(' AND ')
  const joinSql = `
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.expense_category_id
    LEFT JOIN company_users cu ON cu.company_id = e.company_id AND cu.user_id = e.from_id
  `

  const client = await pool.connect()
  try {
    const countRes = await client.query(`SELECT COUNT(*)::int AS total ${joinSql} WHERE ${whereSql}`, params)
    const total = countRes.rows[0]?.total ?? 0

    const dataParams = [...params, pageCount, offset]
    const dataRes = await client.query(
      `
      SELECT
        e.id,
        e.expense_number AS "expenseNumber",
        e.expense_date AS "expenseDate",
        e.created_at AS "createdAt",
        e.note,
        e.payment_mode AS "paymentMode",
        e.status,
        e.receipt,
        e.receipt_name AS "receiptName",
        e.tax_amount AS "taxAmount",
        e.total_amount AS "totalAmount",
        e.expense_category_id AS "expensecategoryId",
        e.from_id AS "userId",
        ec.id AS "categoryId",
        ec.name AS "categoryName",
        cu.user_id AS "cuUserId",
        cu.name AS "cuName",
        cu.phone AS "cuPhone"
      ${joinSql}
      WHERE ${whereSql}
      ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, e.id ASC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
      `,
      dataParams,
    )

    const rows = dataRes.rows.map((r: any) => ({
      id: r.id,
      expenseNumber: r.expenseNumber,
      expenseDate: r.expenseDate,
      createdAt: r.createdAt,
      note: r.note,
      paymentMode: r.paymentMode,
      status: r.status,
      receipt: r.receipt,
      receiptName: r.receiptName,
      taxAmount: r.taxAmount,
      totalAmount: r.totalAmount,
      expensecategoryId: r.expensecategoryId,
      expensecategory: r.categoryId ? { id: r.categoryId, name: r.categoryName } : null,
      userId: r.userId,
      user: r.cuUserId ? { userId: r.cuUserId, name: r.cuName, phone: r.cuPhone } : null,
    }))

    return { rows, total }
  } finally {
    client.release()
  }
})
