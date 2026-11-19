import { createError } from 'h3'
import { isQuoteProductSearchField, type QuoteProductSearchField } from '../../utils/quote-product-search'

const searchColumns: Record<Exclude<QuoteProductSearchField, 'all'>, string[]> = {
  barcode: ['i.barcode'], product: ['p.name'], variant: ['v.name'],
  brand: ['pb.name', 'vb.name'], category: ['c.name'], subcategory: ['sc.name'], collection: ['col.name'],
}

export function quoteProductSearchQuery(companyId: string, query: Record<string, any>) {
  const field = query.field === undefined ? 'all' : query.field
  if (!isQuoteProductSearchField(field)) throw createError({ statusCode: 400, statusMessage: 'Select a valid product search field.' })
  const q = String(query.q || query.search || '').trim().slice(0, 200)
  const requestedLimit = Number(query.limit ?? 3)
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw createError({ statusCode: 400, statusMessage: 'Invalid search limit.' })
  const limit = Math.min(requestedLimit, 10)
  const columns = field === 'all' ? Object.values(searchColumns).flat() : searchColumns[field]
  const matches = columns.map(column => `${column} ILIKE $2`).join(' OR ')
  const rank = field === 'all' ? `CASE
    WHEN i.barcode=$3 THEN 0 WHEN i.barcode ILIKE $4 THEN 1
    WHEN p.name ILIKE $4 THEN 2 WHEN v.name ILIKE $4 THEN 3
    WHEN pb.name ILIKE $4 OR vb.name ILIKE $4 THEN 4
    WHEN c.name ILIKE $4 THEN 5 WHEN col.name ILIKE $4 THEN 6 WHEN sc.name ILIKE $4 THEN 7 ELSE 8 END`
    : `CASE WHEN ${columns.map(column => `${column} ILIKE $3`).join(' OR ')} THEN 0
        WHEN ${columns.map(column => `${column} ILIKE $4`).join(' OR ')} THEN 1 ELSE 2 END`
  return { q, field, values: [companyId, `%${q}%`, q, `${q}%`, limit], sql: `
    SELECT i.id AS item_id,i.barcode,i.size,i.qty,
      v.id AS variant_id,v.name AS variant_name,v.unit,v.s_price AS sprice,v.d_price AS dprice,
      v.p_price AS pprice,v.tax,v.discount,vb.name AS variant_brand_name,
      p.name AS product_name,p.category_id,pb.name AS brand_name,col.name AS collection_name,
      sc.name AS subcategory_name,c.name AS category_name,c.tax_type,c.fixed_tax,
      c.threshold_amount,c.tax_below_threshold,c.tax_above_threshold
    FROM items i
    INNER JOIN variants v ON v.id=i.variant_id AND v.company_id=i.company_id
    INNER JOIN products p ON p.id=v.product_id AND p.company_id=i.company_id
    LEFT JOIN subcategories sc ON sc.id=p.subcategory_id AND sc.company_id=p.company_id
    LEFT JOIN categories c ON c.id=p.category_id AND c.company_id=p.company_id
    LEFT JOIN brands pb ON pb.id=p.brand_id AND pb.company_id=p.company_id
    LEFT JOIN brands vb ON vb.id=v.brand_id AND vb.company_id=v.company_id
    LEFT JOIN collections col ON col.id=p.collection_id AND col.company_id=p.company_id
    WHERE i.company_id=$1 AND COALESCE(i.qty,0)>0
      AND COALESCE(v.status,true)=true AND COALESCE(p.status,true)=true
      AND (${matches})
    ORDER BY ${rank},COALESCE(i.qty,0) DESC,p.name ASC,v.name ASC,i.id ASC
    LIMIT $5` }
}
