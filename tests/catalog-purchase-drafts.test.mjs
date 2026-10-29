import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import ts from 'typescript'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { ref, computed, watch, reactive, nextTick, effectScope } from 'vue'

const createError = options => Object.assign(new Error(options.statusMessage), options)
function source(file) { return readFileSync(file, 'utf8') }
function javascript(code) {
  const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true })
  assert.equal(result.diagnostics?.length || 0, 0)
  return result.outputText.replace(/^import .*;?\r?\n/gm, '').replace(/export default /, 'return ').replace(/export /g, '')
}
function load(file, bindings, tail = '') {
  return new Function(...Object.keys(bindings), javascript(source(file)) + tail)(...Object.values(bindings))
}
const links = load('server/utils/purchase-product-links.ts', { createError }, '\nreturn {purchaseProductIds,linkPurchaseProducts}')
const result = rows => ({ rows, rowCount: rows.length })

test('link validation rejects malformed, missing, foreign and reassigned products before writing', async () => {
  assert.deepEqual(links.purchaseProductIds(['b', 'a', 'b']), ['a', 'b'])
  for (const value of [null, {}, [1], [''], Array(1001).fill('a')]) assert.throws(() => links.purchaseProductIds(value), { statusCode: 400 })
  for (const [rows, status] of [[[], 404], [[{ id: 'a', purchaseorder_id: 'another-po' }], 409]]) {
    const calls = []
    const db = { async query(sql, args) {
      calls.push({ sql, args })
      if (sql.includes('FROM purchase_orders')) return result([{ id: 'po' }])
      if (sql.includes('FROM products')) { assert.deepEqual(args, [['a'], 'owner']); return result(rows) }
      throw Error('Unexpected write')
    } }
    await assert.rejects(links.linkPurchaseProducts(db, 'owner', 'po', ['a']), { statusCode: status })
    assert.ok(calls.every(c => c.sql.startsWith('SELECT')))
    assert.ok(calls[1].sql.includes('FOR UPDATE'))
  }
  await assert.rejects(links.linkPurchaseProducts({ query: async () => result([]) }, 'foreign', 'po', ['a']), { statusCode: 404 })
})

test('existing-only batch saves attach under locks and recalculate inside one transaction; failures roll back', async () => {
  for (const scenario of ['success', 'conflict', 'totals-failure']) {
    const calls = []
    let assignment = null, backup
    const db = { release() {}, async query(raw, args = []) {
      const sql = raw.replace(/\s+/g, ' ').trim()
      calls.push(sql)
      if (sql === 'BEGIN') { backup = assignment; return result([]) }
      if (sql === 'ROLLBACK') { assignment = backup; return result([]) }
      if (sql === 'COMMIT') return result([])
      if (sql.startsWith('SELECT id FROM purchase_orders')) return result([{ id: 'po' }])
      if (sql.startsWith('SELECT id, purchaseorder_id')) return result([{ id: 'a', purchaseorder_id: scenario === 'conflict' ? 'other' : assignment }])
      if (sql.startsWith('UPDATE products')) { assert.deepEqual(args, ['po', ['a'], 'owner']); assignment = 'po'; return result([]) }
      if (sql.startsWith('SELECT p.id')) return result([])
      if (sql.startsWith('INSERT INTO save_error_requests')) return result([])
      throw Error(`Unexpected query ${sql}`)
    } }
    const save = load('server/api/products/save-batch.post.ts', {
      ...links, crypto: { randomUUID }, createError, defineEventHandler: x => x, readBody: async e => e.body,
      pool: { connect: async () => db }, useCompanyRequestSession: async () => ({ data: { companyId: 'owner' } }),
      lockCompanyRequest: async () => {},
      recalculatePurchaseOrderTotals: async () => { calls.push('RECALCULATE'); if (scenario === 'totals-failure') throw Error('Accounting failure') },
      updatePurchaseAccounting: async () => { calls.push('ACCOUNTING') },
      createPurchaseOrderPayment: async () => { throw Error('Existing PO payments must stay unchanged') },
    })
    const event = { body: { products: [], existingProductIds: ['a'], poId: 'po' } }
    if (scenario === 'success') {
      assert.equal((await save(event)).success, true)
      assert.equal(assignment, 'po')
      assert.ok(calls.indexOf('RECALCULATE') < calls.indexOf('COMMIT'))
      assert.ok(calls.indexOf('ACCOUNTING') < calls.indexOf('COMMIT'))
    } else {
      await assert.rejects(save(event), { statusCode: scenario === 'conflict' ? 409 : 500 })
      assert.equal(assignment, null)
      assert.ok(calls.includes('ROLLBACK'))
      assert.ok(!calls.includes('COMMIT'))
    }
    assert.ok(!calls.some(sql => sql.startsWith('INSERT INTO products') || sql.startsWith('INSERT INTO variants')))
    await assert.rejects(save({ body: { existingProductIds: ['a'] } }), { statusCode: 400 })
  }
})

test('new PO with existing products computes totals before creating its payment', async () => {
  const calls = []
  let poId, linked = false, total = 0
  const db = { release() {}, async query(raw, args = []) {
    const sql = raw.replace(/\s+/g, ' ').trim()
    calls.push(sql)
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return result([])
    if (sql.startsWith('UPDATE companies')) return result([{ purchase_counter: 2 }])
    if (sql.startsWith('INSERT INTO purchase_orders')) { poId = args[0]; return result([]) }
    if (sql.startsWith('SELECT id FROM purchase_orders')) return result([{ id: poId }])
    if (sql.startsWith('SELECT id, purchaseorder_id')) return result([{ id: 'saved', purchaseorder_id: null }])
    if (sql.startsWith('UPDATE products')) { assert.equal(args[0], poId); linked = true; return result([]) }
    if (sql.startsWith('SELECT p.id')) return result([])
    throw Error(`Unexpected query ${sql}`)
  } }
  const save = load('server/api/products/save-batch.post.ts', {
    ...links, crypto: { randomUUID }, createError, defineEventHandler: x => x, readBody: async e => e.body,
    pool: { connect: async () => db }, useCompanyRequestSession: async () => ({ data: { companyId: 'owner' } }),
    lockCompanyRequest: async () => {}, updatePurchaseAccounting: async () => {},
    recalculatePurchaseOrderTotals: async () => { assert.ok(linked); total = 100 },
    createPurchaseOrderPayment: async () => { assert.equal(total, 100); calls.push('PAYMENT') },
  })
  const saved = await save({ body: { existingProductIds: ['saved'], po: { paymentType: 'BANK' } } })
  assert.equal(saved.poId, poId)
  assert.equal(saved.purchaseOrderNo, 1)
  assert.ok(calls.indexOf('PAYMENT') < calls.indexOf('COMMIT'))
  assert.ok(!calls.some(sql => sql.startsWith('INSERT INTO products')))
})

test('product and PO search endpoints only read choices in the authorized form company', async () => {
  for (const file of ['server/api/products/unassigned.get.ts', 'server/api/purchaseorder/options.get.ts']) {
    const calls = []
    const handler = load(file, { defineEventHandler: x => x, getQuery: () => ({ search: 'Shirt' }),
      useCompanyRequestSession: async () => ({ data: { companyId: 'branch' } }),
      pool: { query: async (sql, args) => { calls.push({ sql, args }); return result([{ id: 'choice' }]) } },
    })
    assert.deepEqual(await handler({}), [{ id: 'choice' }])
    assert.equal(calls.length, 1)
    assert.equal(calls[0].args[0], 'branch')
    assert.ok(calls[0].sql.includes('company_id=$1'))
    assert.ok(calls[0].sql.trim().startsWith('SELECT'))
    if (file.includes('unassigned')) assert.ok(calls[0].sql.includes('purchaseorder_id IS NULL'))
  }
})

test('product readers return saved catalog numbers without changing stock or PO ownership', async () => {
  for (const file of ['server/api/products/by-ids.post.ts', 'server/api/products/[id].get.ts', 'server/api/purchaseorder/[id].get.ts']) {
    const queries = []
    const db = { release() {}, async query(sql) {
      queries.push(sql)
      if (sql.includes('FROM purchase_orders')) return result([{ id: 'po', company_id: 'branch', purchase_order_no: 2 }])
      if (sql.includes('FROM products p')) return result([{ id: 'product', company_id: 'branch', product_no: 4, purchaseorder_id: null }])
      if (sql.includes('FROM variants')) return result([{ id: 'variant', variant_no: 7, product_id: 'product' }])
      if (sql.includes('FROM items')) return result([{ id: 'item', variant_id: 'variant', qty: 2, initial_qty: 5 }])
      throw Error(`Unexpected query ${sql}`)
    } }
    const handler = load(file, { defineEventHandler: x => x, createError, getRouterParam: () => file.includes('purchaseorder') ? 'po' : 'product',
      readBody: async () => ({ ids: ['product'] }), getReadCompanyIds: async () => ['branch'], getAuthorizedCompanyIds: async () => ['branch'],
      pool: { connect: async () => db },
    })
    const response = await handler({})
    const product = Array.isArray(response) ? response[0] : response.products?.[0] || response
    assert.equal(product.productNo, 4)
    assert.equal(product.variants[0].variantNo, 7)
    assert.equal(product.variants[0].items[0].qty, 2)
    assert.equal(product.variants[0].items[0].initialQty, 5)
    assert.ok(queries.every(sql => sql.trim().startsWith('SELECT')))
  }
})

async function editor(query = {}, failSave = false) {
  const calls = [], toasts = [], invalidations = []
  const product = { id: 'saved', companyId: 'owner', productNo: 12, purchaseorderId: null, name: 'Shirt', variants: [
    { id: 'variant', variantNo: 18, name: 'Blue', pprice: 20, images: [], items: [{ id: 'item', qty: 2, initialQty: 5 }] },
  ] }
  const po = { id: 'po', companyId: 'owner', products: [], purchaseOrderNo: 3 }
  const draft = Object.fromEntries(Object.entries({ productIds: [], stagedProducts: [], existingProducts: [], purchaseInfo: {}, form: {}, draftNo: '1',
    draftProducts: [], selectedDraft: null, poId: null, isReady: false, isHydrating: false }).map(([k, value]) => [k, ref(value)]))
  Object.assign(draft, { resetDraft() { draft.stagedProducts.value = []; draft.existingProducts.value = []; draft.form.value = {}; draft.purchaseInfo.value = {} } })
  const route = reactive({ query, params: {} })
  const company = { ready: Promise.resolve(), companyId: ref('owner'), auth: { session: ref({ companyId: 'owner', variantInputs: {} }) },
    async fetch(url, options = {}) {
      calls.push({ url, ...options })
      if (url === '/api/products/by-ids') return [structuredClone(product)]
      if (url === '/api/purchaseorder/po') return structuredClone(po)
      if (url === '/api/products/category-tax') return null
      if (url === '/api/products/save-batch') {
        if (failSave) throw { data: { statusMessage: 'A product was linked elsewhere' } }
        if (options.body.poId) po.products = [structuredClone(product)]
        return { success: true, poId: 'po', products: [] }
      }
      if (url === '/api/purchaseorder/recalculate') return {}
      throw Error(`Unexpected request ${url}`)
    },
  }
  const bindings = { ref, computed, reactive, watch, nextTick, onMounted: () => {}, onBeforeUnmount: () => {},
    useCompanyScope: () => company, usePrint: () => ({ printLabel() {} }), useRouter: () => ({}), useRoute: () => route,
    useToast: () => ({ add: t => toasts.push(t) }), useOrganizationActions: () => ({ selectOwnerAndReload: async () => true }),
    useProductDraft: () => draft, useModelCache: () => ({ invalidateModels: async (...models) => invalidations.push(models) }),
    useSizeLabel: () => ({ defaultSizeLabel: ref('Size') }), uuidv4: randomUUID,
    AwsService: class { async deleteObjects() {} }, console: { log() {}, error() {} },
  }
  const code = parse(source('pages/products/add.vue')).descriptor.scriptSetup.content
  const fn = Object.getPrototypeOf(async function () {}).constructor
  const scope = effectScope()
  const ready = scope.run(() => new fn(...Object.keys(bindings), javascript(code) + `
    return {addExistingProduct,onDraftProductDeleted,tableProducts,existingProducts,stagedProducts,handleSaveWithPO,handleSaveEditedPurchaseOrder,handleAdd,name,category,variants,editPurchaseOrder,selectingExisting,isSave};
  `)(...Object.values(bindings)))
  const page = await ready
  draft.isReady.value = true
  await nextTick(); await new Promise(resolve => setTimeout(resolve, 5))
  return { page, calls, toasts, draft, product, company, route, invalidations, stop: () => scope.stop() }
}

test('product menu navigation stages and renders an existing product with zero database mutations; remove is local', async () => {
  const e = await editor({ from: 'distributor-purchase-order', productId: 'saved' })
  assert.deepEqual(e.page.tableProducts.value.map(p => p.id), ['saved'])
  assert.ok(e.calls.every(c => c.url === '/api/products/by-ids'))
  await e.page.addExistingProduct({ id: 'saved' })
  assert.equal(e.page.existingProducts.value.length, 1, 'Duplicate selections are ignored')
  await e.page.onDraftProductDeleted('saved')
  assert.equal(e.page.tableProducts.value.length, 0)
  assert.ok(!e.calls.some(c => /save|delete|update|create/.test(c.url)))
  e.stop()
})

test('new PO Save includes selected existing IDs; failure retains selection for retry', async () => {
  for (const fail of [false, true]) {
    const e = await editor({ from: 'distributor-purchase-order', productId: 'saved' }, fail)
    await e.page.handleSaveWithPO()
    const saves = e.calls.filter(c => c.url === '/api/products/save-batch')
    assert.equal(saves.length, 1)
    assert.deepEqual(saves[0].body.existingProductIds, ['saved'])
    assert.deepEqual(saves[0].body.products, [])
    assert.ok(saves[0].body.po)
    assert.equal(e.page.existingProducts.value.length, fail ? 1 : 0)
    e.stop()
  }
})

test('existing PO opens with selected product ready for Save; new additions also wait for Save', async () => {
  const e = await editor({ from: 'distributor-purchase-order', poId: 'po', isEdit: 'true', productId: 'saved' })
  assert.equal(e.page.tableProducts.value.length, 1)
  assert.equal(e.calls.filter(c => /save|update|create/.test(c.url)).length, 0)
  e.page.name.value = 'New product'
  e.page.category.value = { id: 'category', name: 'Clothing' }
  e.page.variants.value = [{ id: 'new-variant', key: '1', name: 'Red', sprice: 30, dprice: 20, pprice: 10, items: [{ id: 'new-item', qty: 1 }], images: [] }]
  await e.page.handleAdd({ preventDefault() {} })
  assert.equal(e.page.stagedProducts.value.length, 1)
  assert.equal(e.calls.filter(c => /save|update|create/.test(c.url)).length, 0)
  assert.deepEqual(e.draft.stagedProducts.value, [], 'Existing-PO draft never borrows new-product draft rows')
  await e.page.handleSaveEditedPurchaseOrder()
  const save = e.calls.find(c => c.url === '/api/products/save-batch')
  assert.equal(save.body.poId, 'po')
  assert.deepEqual(save.body.existingProductIds, ['saved'])
  assert.equal(save.body.products.length, 1)
  assert.equal(e.page.stagedProducts.value.length, 0)
  assert.equal(e.page.existingProducts.value.length, 0)
  e.stop()
})

test('removing a selected saved product never invokes the catalog delete endpoint; quantities use purchased amounts', () => {
  const props = { settledMap: new Map(), products: [{ id: 'saved', name: 'Shirt', variants: [{ pprice: 20, items: [{ qty: 2, initialQty: 5 }] }] }], localOnlyIds: ['saved'] }
  const emitted = [], requests = []
  const code = parse(source('components/AddProduct/Table.vue')).descriptor.scriptSetup.content
  const api = new Function('defineProps', 'defineEmits', 'useCompanyScope', 'useRoute', 'useToast', 'useModelCache', 'ref', 'computed', 'watch',
    javascript(code) + '\nreturn {removeProduct,totalAmount}')(
    () => props, () => (...args) => emitted.push(args), () => ({ fetch: (...args) => requests.push(args) }), () => ({ query: {} }), () => ({}), () => ({}), ref, computed, watch,
  )
  assert.equal(api.totalAmount.value, 100, 'Purchase uses initial quantity, not remaining stock')
  api.removeProduct('saved')
  assert.ok(emitted.some(([name, id]) => name === 'product-deleted' && id === 'saved'))
  assert.deepEqual(requests, [])
})

test('existing-product search is a toolbar input before delivery type', () => {
  const topBar = source('components/AddProduct/TopBar.vue')
  const addPage = source('pages/products/add.vue')
  const search = source('components/AddProduct/ExistingProducts.vue')
  assert.ok(topBar.indexOf('<slot name="product-search"') < topBar.indexOf('Delivery Type'))
  assert.match(addPage, /<template #product-search>[\s\S]*?<AddProductExistingProducts/)
  assert.doesNotMatch(addPage, /<UPageCard[^>]*>[\s\S]*?<AddProductExistingProducts/)
  assert.match(search, /placeholder="Search product name or product no"/)
  assert.match(search, /v-model:open="open"/)
})

test('all changed Vue scripts and templates compile', () => {
  for (const file of ['pages/products/index.vue', 'pages/products/add.vue', 'pages/products/edit/[id].vue', 'components/AddProduct/TopBar.vue', 'components/AddProduct/Table.vue', 'components/AddProduct/ExistingProducts.vue', 'components/Products/LinkPurchaseOrderModal.vue']) {
    const { descriptor, errors } = parse(source(file), { filename: file })
    assert.deepEqual(errors, [], file)
    const script = compileScript(descriptor, { id: file })
    assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors, [], file)
  }
  for (const file of ['composables/useProductDraft.ts', 'server/utils/purchase-product-links.ts',
    'server/api/products/[id].get.ts', 'server/api/products/by-ids.post.ts', 'server/api/products/save-batch.post.ts',
    'server/api/products/unassigned.get.ts', 'server/api/purchaseorder/[id].get.ts',
    'server/api/purchaseorder/options.get.ts', 'server/api/purchaseorder/save.post.ts']) javascript(source(file))
})
