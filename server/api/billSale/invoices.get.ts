import { defineEventHandler, getQuery } from 'h3'
import { pool } from '../../db'
import { getReadCompanyIds } from '../../utils/organizationReadScope'
import { invoiceListQuery } from '../../utils/invoice-lists'
export default defineEventHandler(async event => {
  const query = invoiceListQuery(await getReadCompanyIds(event), getQuery(event))
  const result = await pool.query(query.sql,query.values)
  return {...result.rows[0],total:Number(result.rows[0].total)}
})
