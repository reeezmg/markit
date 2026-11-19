import { defineEventHandler, getQuery } from 'h3'
import { pool } from '../../db'
import { quoteCompany } from '../../utils/erp-quotes'
import { quoteListQuery } from '../../utils/quote-list'

export default defineEventHandler(async event => {
  const { companyId } = await quoteCompany(event)
  const query = quoteListQuery(companyId, getQuery(event))
  const { rows } = await pool.query(query.sql, query.values)
  return { ...rows[0], total: Number(rows[0].total) }
})
