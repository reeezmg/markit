import { defineEventHandler, setHeader } from 'h3'
import { pool } from '../../db'
import { getReadCompanyId } from '../../utils/organizationReadScope'
import { productNumberingRoles, readProductNumbering } from '../../utils/customer-product-numbering'
export default defineEventHandler(async event => {
  const companyId = await getReadCompanyId(event), session = await requireAuthSession(event)
  setHeader(event, 'Cache-Control', 'no-store')
  return { ...await readProductNumbering(pool, companyId), canEdit: productNumberingRoles.includes(session.data.role) }
})
