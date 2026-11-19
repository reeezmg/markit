import assert from 'node:assert/strict'
import { test } from 'node:test'
import { quoteProductSearchFields, isQuoteProductSearchField } from '../utils/quote-product-search'
import { quoteProductSearchQuery } from '../server/utils/quote-product-search'

test('product search accepts only supported fields and binds search, company and bounded limit', () => {
  for (const { value } of quoteProductSearchFields) assert.ok(isQuoteProductSearchField(value))
  for (const value of [null, '', 'unknown', 'barcode; DROP TABLE items', ['barcode']]) {
    assert.equal(isQuoteProductSearchField(value), false)
    assert.throws(() => quoteProductSearchQuery('company', { q: 'shirt', field: value }))
  }
  for (const limit of [0, -1, 1.5, 'invalid']) assert.throws(() => quoteProductSearchQuery('company', { q: 'shirt', limit }))
  const query = quoteProductSearchQuery('branch', { q: "customer's brand", limit: 100 })
  assert.equal(query.field, 'all')
  assert.deepEqual(query.values, ['branch', "%customer's brand%", "customer's brand", "customer's brand%", 10])
  assert.doesNotMatch(query.sql, /customer's brand/)
  assert.match(query.sql, /v\.company_id=i\.company_id/)
  assert.match(query.sql, /col\.company_id=p\.company_id/)
  assert.equal(quoteProductSearchQuery('company', { q: '   ' }).q, '')
})

test('single-field searches restrict matching to that field; all includes brand, category and collection', () => {
  const expected = {
    barcode: ['i.barcode'], product: ['p.name'], variant: ['v.name'],
    brand: ['pb.name', 'vb.name'], category: ['c.name'], subcategory: ['sc.name'], collection: ['col.name'],
  }
  for (const { value } of quoteProductSearchFields) {
    const query = quoteProductSearchQuery('company', { q: 'Needle', field: value })
    const predicate = query.sql.split('AND (').at(-1)!.split(')\n    ORDER BY')[0]
    const columns = value === 'all' ? Object.values(expected).flat() : expected[value]
    assert.deepEqual([...predicate.matchAll(/([a-z]+\.[a-z]+) ILIKE \$2/g)].map(match => match[1]), columns)
    assert.match(query.sql, /COALESCE\(i.qty,0\)>0/)
    assert.match(query.sql, /COALESCE\(v.status,true\)=true/)
    assert.match(query.sql, /COALESCE\(p.status,true\)=true/)
    assert.doesNotMatch(query.sql, /\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/)
  }
})

function catalogFixture() {
  const data: Record<string, any[]> = { items: [], variants: [], products: [], brands: [], categories: [], subcategories: [], collections: [] }
  const targets = ['barcode', 'product', 'variant', 'product-brand', 'variant-brand', 'category', 'subcategory', 'collection', 'empty', 'inactive-product', 'inactive-variant', 'foreign', 'foreign-brand']
  for (const target of targets) {
    const company = target === 'foreign' ? 'other-company' : 'company'
    const id = (kind: string) => `${target}-${kind}`
    data.items.push({ id: target, company_id: company, variant_id: id('variant'), barcode: ['barcode', 'empty', 'inactive-product', 'inactive-variant', 'foreign'].includes(target) ? 'Needle' : id('code'), size: 'M', qty: target === 'empty' ? 0 : 5 })
    data.variants.push({ id: id('variant'), company_id: company, product_id: id('product'), name: target === 'variant' ? 'Needle blue' : id('variant-name'), unit: 'pcs', s_price: 118, d_price: 100, p_price: 90, tax: 18, discount: 0, status: target !== 'inactive-variant', brand_id: id('variant-brand') })
    data.products.push({ id: id('product'), company_id: company, name: target === 'product' ? 'Needle shirt' : id('product-name'), status: target !== 'inactive-product', category_id: id('category'), subcategory_id: id('subcategory'), brand_id: id('brand'), collection_id: id('collection') })
    data.brands.push({ id: id('brand'), company_id: target === 'foreign-brand' ? 'other-company' : company, name: ['product-brand', 'foreign-brand'].includes(target) ? 'Needle brand' : 'Plain brand' },
      { id: id('variant-brand'), company_id: company, name: target === 'variant-brand' ? 'Needle maker' : 'Plain maker' })
    data.categories.push({ id: id('category'), company_id: company, name: target === 'category' ? 'Needle category' : 'Plain category', tax_type: 'FIXED', fixed_tax: 18, threshold_amount: 1000, tax_below_threshold: 5, tax_above_threshold: 12 })
    data.subcategories.push({ id: id('subcategory'), company_id: company, name: target === 'subcategory' ? 'Needle subcategory' : 'Plain subcategory' })
    data.collections.push({ id: id('collection'), company_id: company, name: target === 'collection' ? 'Needle summer' : 'Plain collection' })
  }
  // An item cannot expose another company's variant/product through a stale link.
  data.items.push({ id: 'foreign-link', company_id: 'company', variant_id: 'foreign-variant', barcode: 'Needle', size: 'M', qty: 5 })
  const columns = {
    items: 'id text,company_id text,variant_id text,barcode text,size text,qty numeric',
    variants: 'id text,company_id text,product_id text,name text,unit text,s_price numeric,d_price numeric,p_price numeric,tax numeric,discount numeric,status boolean,brand_id text',
    products: 'id text,company_id text,name text,status boolean,category_id text,subcategory_id text,brand_id text,collection_id text',
    brands: 'id text,company_id text,name text',
    categories: 'id text,company_id text,name text,tax_type text,fixed_tax numeric,threshold_amount numeric,tax_below_threshold numeric,tax_above_threshold numeric',
    subcategories: 'id text,company_id text,name text', collections: 'id text,company_id text,name text',
  }
  const entries = Object.entries(columns)
  return {
    sql: 'WITH ' + entries.map(([table, fields], index) => `${table} AS (SELECT * FROM jsonb_to_recordset($${index + 6}::jsonb) AS row(${fields}))`).join(', ') + '\n',
    values: entries.map(([table]) => JSON.stringify(data[table])),
  }
}

test('read-only PostgreSQL proves field isolation, case-insensitive matches, ranking, stock and tenant boundaries', {
  skip: process.env.QUOTE_READONLY_DATABASE !== '1',
}, async () => {
  const dotenv = await import('dotenv'); dotenv.config({ quiet: true } as any)
  const { Client } = await import('pg')
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 })
  try {
    await db.connect(); await db.query('BEGIN READ ONLY')
    const fixture = catalogFixture()
    for (const { value: field } of quoteProductSearchFields) {
      const query = quoteProductSearchQuery('company', { q: 'nEeDlE', field, limit: 10 })
      await db.query('EXPLAIN ' + query.sql, query.values)
      const { rows } = await db.query(fixture.sql + query.sql, [...query.values, ...fixture.values])
      const expected = field === 'all' ? ['barcode', 'product', 'variant', 'product-brand', 'variant-brand', 'category', 'subcategory', 'collection']
        : field === 'brand' ? ['product-brand', 'variant-brand'] : [field]
      assert.deepEqual(rows.map(row => row.item_id).sort(), expected.sort(), field)
    }
    const ranked = quoteProductSearchQuery('company', { q: 'Needle', field: 'all', limit: 2 })
    const { rows } = await db.query(fixture.sql + ranked.sql, [...ranked.values, ...fixture.values])
    assert.equal(rows.length, 2); assert.equal(rows[0].item_id, 'barcode')
    assert.equal(rows[0].brand_name, 'Plain brand')
    await db.query('ROLLBACK')
  } finally { await db.end() }
})
