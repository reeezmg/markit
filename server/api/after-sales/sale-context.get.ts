import { afterSalesRoute } from '../../utils/after-sales-route'
export default afterSalesRoute(false, async (db, company, _actor, query) => {
  const ids=String(query.itemIds||'').split(',').filter(Boolean).slice(0,200)
  return (await db.query(`SELECT DISTINCT i.id AS item_id,p.id AS product_id,c.id AS configuration_id,c.kind,c.name
    FROM items i JOIN variants v ON v.id=i.variant_id AND v.company_id=i.company_id
    JOIN products p ON p.id=v.product_id AND p.company_id=i.company_id
    JOIN product_service_links l ON l.product_id=p.id AND l.company_id=i.company_id
    JOIN service_configurations c ON c.id=l.configuration_id AND c.company_id=i.company_id
    WHERE i.company_id=$1 AND i.id=ANY($2::text[]) ORDER BY i.id,c.kind,c.name`,[company,ids])).rows
})
