import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { nextTick, reactive, ref } from 'vue'
import { quoteProductSearchFields, isQuoteProductSearchField } from '../../utils/quote-product-search'
import { deferred, harness, item, plain } from './harness'

const product = (barcode = '1A123456') => ({ ...item(barcode), barcode })

function setup(fetch: (url: string, options: any) => Promise<any> = async () => []) {
  let timer: (() => Promise<void>) | undefined
  const props = reactive({ disabled: false }), companyId = ref('branch'), selected: any[] = [], calls: any[] = []
  const h = harness('components/Billing/InlineProductSearch.vue', undefined, {
    defineProps: () => props, defineEmits: () => (_name: string, product: any) => selected.push(product),
    quoteProductSearchFields, isQuoteProductSearchField,
    useCompanyScope: () => ({ companyId, fetch: (url: string, options: any) => { calls.push({ url, ...options, companyId: companyId.value }); return fetch(url, options) } }),
    setTimeout: (callback: () => Promise<void>) => { timer = callback; return 1 },
    clearTimeout: () => { timer = undefined },
  })
  const state = vm.runInContext('({ query, field, products, loading, error, selectProduct, clearSearch })', h.context)
  return { ...h, ...state, props, companyId, selected, calls, search: () => { assert.ok(timer); const callback = timer; timer = undefined; return callback() }, hasTimer: () => Boolean(timer) }
}

test('inline search restores the field preference, scopes suggestions and emits the selected barcode', async t => {
  const h = setup(async () => [product('selected')]); t.after(h.stop)
  h.storage.set('erp:billing-product-search-field:v1', 'brand'); await h.mount()
  assert.equal(h.field.value, 'brand')
  h.query.value = 'shirt'
  assert.equal(h.loading.value, true); assert.equal(h.calls.length, 0, 'Search is debounced')
  await h.search()
  assert.deepEqual(plain(h.calls), [{ url: '/api/bill/searchItems', query: { q: 'shirt', limit: 5, field: 'brand' }, companyId: 'branch' }])
  assert.equal(h.products.value[0].barcode, 'selected')
  h.field.value = 'barcode'; await nextTick()
  assert.equal(h.storage.get('erp:billing-product-search-field:v1'), 'barcode')
  await h.search()
  h.selectProduct(h.products.value[0])
  assert.equal(h.selected[0].barcode, 'selected'); assert.equal(h.query.value, ''); assert.equal(h.products.value.length, 0)
})

test('changing field or company discards older in-flight suggestions', async t => {
  const old = deferred(), current = deferred(), branch = deferred()
  let count = 0
  const h = setup(async () => [old, current, branch][count++].promise); t.after(h.stop)
  h.query.value = 'shirt'; const first = h.search()
  h.field.value = 'brand'; const second = h.search()
  old.resolve([product('old')]); await first
  assert.equal(h.products.value.length, 0); assert.equal(h.loading.value, true)
  current.resolve([product('current')]); await second
  assert.deepEqual(plain(h.products.value), [product('current')])
  h.companyId.value = 'other-branch'
  assert.equal(h.products.value.length, 0)
  const third = h.search(); branch.resolve([product('branch')]); await third
  assert.equal(h.calls.at(-1).companyId, 'other-branch'); assert.equal(h.products.value[0].barcode, 'branch')
})

test('save/marketplace locks cancel requests and block selections; failures remain readable', async t => {
  const pending = deferred()
  const h = setup(async () => pending.promise); t.after(h.stop)
  h.query.value = 'shirt'; const search = h.search()
  h.props.disabled = true
  pending.resolve([product()]); await search
  assert.equal(h.products.value.length, 0); assert.equal(h.loading.value, false)
  h.selectProduct(product()); assert.equal(h.selected.length, 0)
  h.props.disabled = false; await h.search()
  assert.equal(h.products.value.length, 1)
  h.clearSearch(); assert.equal(h.hasTimer(), false)

  const failed = setup(async () => { throw new Error('Failed to fetch') }); t.after(failed.stop)
  failed.query.value = 'shirt'; await failed.search()
  assert.ok(failed.error.value); assert.equal(failed.loading.value, false); assert.deepEqual(plain(failed.products.value), [])
})
