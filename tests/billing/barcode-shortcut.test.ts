import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { ref } from 'vue'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { billingBarcodeShortcut } from '../../utils/billing-barcode'
import { harness, billing, edit, row, read, script } from './harness'

test('slash barcode shortcuts pad only one to six digits', () => {
  for (const [input, expected] of [['/1', '000001'], ['/123', '000123'], ['/000123', '000123'], ['/999999', '999999'], [' /0 ', '000000']]) {
    assert.equal(billingBarcodeShortcut(input), expected)
  }
  for (const input of ['1A000123', '12AA000123', 'T', '', null]) assert.equal(billingBarcodeShortcut(input), null)
  for (const input of ['/', '/abc', '/1234567', '/12.3', '/-123']) assert.throws(() => billingBarcodeShortcut(input), /1 to 6 digits/)
})

function lookup(barcode: string, matches = ['12A000123']) {
  const calls: { sql: string; values: any[] }[] = []
  let released = false
  const context: any = {
    billingBarcodeShortcut, defineEventHandler: (handler: any) => handler,
    useCompanyRequestSession: async () => ({ data: { companyId: 'branch' } }), getQuery: () => ({ barcode }),
    createError: (options: any) => Object.assign(new Error(options.statusMessage), options),
    pool: { connect: async () => ({
      query: async (sql: string, values: any[]) => {
        calls.push({ sql, values })
        return sql.includes('SELECT DISTINCT') ? { rows: matches.map(barcode => ({ barcode })) }
          : { rows: [{ item_id: 'item', barcode: values[0], qty: 0, variant_id: 'variant', sprice: 100, dprice: 100, pprice: 50, tax: 5, discount: 0 }] }
      },
      release: () => { released = true },
    }) },
  }
  const source = script('server/api/bill/findFirstItem.get.ts').replace(/^import .*\r?\n/gm, '').replace('export default', 'globalThis.handler =')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context)
  return { run: () => context.handler({}), calls, released: () => released }
}

test('barcode lookup resolves the owned prefix, returns the full code and still allows zero stock', async () => {
  const h = lookup('/123', ['12AA000123'])
  const result = await h.run()
  assert.equal(result.barcode, '12AA000123'); assert.equal(result.qty, 0)
  assert.deepEqual(Array.from(h.calls[0].values), ['branch', '000123'])
  assert.deepEqual(Array.from(h.calls[1].values), ['12AA000123', 'branch'])
  assert.equal(h.released(), true)
  const normal = lookup('12A000123'); await normal.run()
  assert.equal(normal.calls.length, 1); assert.deepEqual(Array.from(normal.calls[0].values), ['12A000123', 'branch'])
})

test('unknown, ambiguous and malformed barcode shortcuts do not guess a product', async () => {
  const missing = lookup('/123', []); assert.equal(await missing.run(), null); assert.equal(missing.released(), true)
  const ambiguous = lookup('/123', ['12A000123', '12B000123'])
  await assert.rejects(ambiguous.run(), (error: any) => error.statusCode === 409 && /full barcode/.test(error.message))
  assert.equal(ambiguous.calls.length, 1); assert.equal(ambiguous.released(), true)
  const invalid = lookup('/1234567')
  await assert.rejects(invalid.run(), (error: any) => error.statusCode === 400)
  assert.equal(invalid.calls.length, 0)
})

for (const file of [billing, edit]) {
  test(`${file}: slash barcode Enter uses item lookup and preserves malformed input`, async t => {
    const fetched: any[] = [], added: number[] = []
    const h = harness(file, ['toast', 'handleEnterBarcode'], {
      items: ref([row({ barcode: '/123' })]),
      categoryStore: { resolveShortCut() { throw new Error('Barcode shortcuts must not resolve categories') } },
      fetchItemData: (...args: any[]) => fetched.push(args), addNewRow: (index: number) => added.push(index),
    }); t.after(h.stop)
    for (const value of ['/123', '/000123', '12AA000123']) h.context.handleEnterBarcode(value, 0)
    assert.deepEqual(fetched, [['/123', 0], ['/000123', 0], ['12AA000123', 0]]); assert.deepEqual(added, [0, 0, 0])
    for (const value of ['/', '/abc', '/1234567', '/12.3', '/-123']) h.context.handleEnterBarcode(value, 0)
    assert.equal(fetched.length, 3); assert.equal(h.toasts.length, 5); assert.equal(h.context.items.value[0].barcode, '/123')
  })
  test(`${file}: shortcut response replaces the typed abbreviation`, async t => {
    let h: any
    if (file === edit) h = harness(edit, ['processItemResponse'], { items: ref([row({ barcode: '/123' })]), categories: ref([]) })
    else h = harness('composables/useBillingItems.ts', ['useBillingItems'])
    t.after(h.stop)
    const data = { id: 'item', barcode: '12A000123', variant: { id: 'variant', product: { categoryId: 'cat' } } }
    if (file === edit) { h.context.processItemResponse(data, 0); assert.equal(h.context.items.value[0].barcode, '12A000123') }
    else {
      const items = ref([row({ barcode: '/123' })])
      h.context.$fetch = async () => data
      const state = h.run(() => h.context.useBillingItems(items, ref([]), { getCategoryById() {} }, ref(true), { code: ref(null), id: ref(null), name: ref(null) }, () => {}))
      await state.fetchItemData('/123', 0); assert.equal(items.value[0].barcode, '12A000123')
    }
  })
  test(`${file}: barcode page compiles`, () => {
    const { descriptor, errors } = parse(read(file)); assert.deepEqual(errors, [])
    const compiled = compileScript(descriptor, { id: 'barcode-shortcut' })
    assert.deepEqual(compileTemplate({ source: descriptor.template!.content, filename: file, id: 'barcode-shortcut', compilerOptions: { bindingMetadata: compiled.bindings } }).errors, [])
  })
}

test('read-only SQL proves barcode suffix isolation, multiple prefixes and duplicate-code handling', { skip: process.env.BARCODE_READONLY_DATABASE !== '1' }, async () => {
  const dotenv = await import('dotenv'); dotenv.config({ quiet: true } as any)
  const { Client } = await import('pg')
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000, statement_timeout: 8000 })
  try {
    await db.connect(); await db.query('BEGIN READ ONLY')
    const h = lookup('/123'); await h.run()
    const fixture = `WITH companies(id, storecode) AS (VALUES ('branch',12),('other',1)),
      items(company_id, barcode) AS (VALUES ('branch','12A000123'),('branch','12AA000123'),('branch','12A000123'),
        ('other','1A000123'),('branch','1A000123'),('branch','12A100123'),('branch','12A000124')) `
    const run = async (company: string, suffix: string) => (await db.query(fixture + h.calls[0].sql, [company, suffix])).rows.map(row => row.barcode).sort()
    assert.deepEqual(await run('branch', '000123'), ['12A000123', '12AA000123'])
    assert.deepEqual(await run('other', '000123'), ['1A000123'])
    assert.deepEqual(await run('branch', '000124'), ['12A000124'])
    assert.deepEqual(await run('branch', '999999'), [])
    await db.query('ROLLBACK')
  } finally { await db.end() }
})
