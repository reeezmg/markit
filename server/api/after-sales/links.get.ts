import { afterSalesRoute } from '../../utils/after-sales-route'
export default afterSalesRoute(false, async (db, company, _actor, query) => (await db.query(`SELECT l.product_id,l.configuration_id,c.name,c.kind,c.archived,c.rules
  FROM product_service_links l JOIN service_configurations c ON c.id=l.configuration_id AND c.company_id=l.company_id
  WHERE l.company_id=$1 AND l.product_id=ANY($2::text[])`, [company, String(query.productIds || '').split(',').filter(Boolean).slice(0, 200)])).rows)
