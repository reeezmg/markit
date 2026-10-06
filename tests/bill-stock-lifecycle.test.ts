import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import { applyBillStock, billStockDeltas } from '../server/utils/bill-stock'
import { assertNoBillReceipts } from '../server/utils/bill-receipts'

const entries = [
  { item_id: 'shirt', qty: 2, return: false },
  { item_id: 'shirt', qty: 3, return: false },
  { item_id: 'shirt', qty: 1, return: true },
  { item_id: 'shoe', qty: 2, return: true },
  { item_id: null, qty: 5, return: false },
]

test('duplicate sale/return lines combine and delete exactly reverses restore', () => {
  assert.deepEqual(billStockDeltas(entries, true), [
    { itemId: 'shirt', soldDelta: 4 }, { itemId: 'shoe', soldDelta: -2 },
  ])
  assert.deepEqual(billStockDeltas(entries, false), [
    { itemId: 'shirt', soldDelta: -4 }, { itemId: 'shoe', soldDelta: 2 },
  ])
  assert.deepEqual(billStockDeltas([
    { item_id: 'a', qty: 0, return: false },
    { item_id: 'a', qty: null, return: false },
    { item_id: 'a', qty: 2, return: false },
    { item_id: 'a', qty: 2, return: true },
  ], true), [{ itemId: 'a', soldDelta: 0 }])
})

// Execute the actual handlers with an in-memory transaction client. No DB connection.
function fixture() {
  let deleted = false
  let failCommit = false
  let foreignItem = false
  let hasReceipts = false
  let snapshot: any
  let stock = { shirt: { qty: 6, sold: 4 }, shoe: { qty: 12, sold: -2 } }
  const original = structuredClone(stock)
  const client = {
    release() {},
    async query(sql: string, args: any[] = []) {
      if (sql === 'BEGIN') snapshot = { deleted, stock: structuredClone(stock) }
      else if (sql === 'ROLLBACK') { deleted = snapshot.deleted; stock = structuredClone(snapshot.stock) }
      else if (sql === 'COMMIT') { if (failCommit) throw new Error('Deferred posting failure') }
      else if (sql.includes('FROM bills')) {
        assert.match(sql, /FOR UPDATE/)
        assert.deepEqual(args, ['bill', 'company'])
        const wantsDeleted = sql.includes('deleted = true')
        const rows = wantsDeleted === deleted ? [{ invoice_number: 1 }] : []
        return { rows, rowCount: rows.length }
      } else if (sql.includes('FROM payments')) {
        assert.deepEqual(args,['company','bill',['POS_CREDIT_RECEIPT']])
        return {rows:hasReceipts ? [{id:'receipt'}] : [],rowCount:hasReceipts ? 1 : 0}
      } else if (sql.includes('FROM entries')) {
        assert.deepEqual(args, ['bill'])
        return { rows: entries, rowCount: entries.length }
      } else if (sql.includes('SELECT id FROM items')) {
        assert.match(sql, /ORDER BY id FOR UPDATE/)
        assert.equal(args[1], 'company')
        return { rows: [], rowCount: foreignItem ? 1 : 2 }
      } else if (sql.includes('UPDATE items')) {
        assert.equal(args[2], 'company')
        for (let i = 0; i < args[0].length; i++) {
          const row = stock[args[0][i] as keyof typeof stock]
          row.qty -= args[1][i]
          row.sold += args[1][i]
        }
      } else if (sql.includes('FROM coupon_usages')) return { rows: [], rowCount: 0 }
      else if (sql.includes('UPDATE bills')) deleted = sql.includes('deleted = true')
      else if (!['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) throw new Error(`Unexpected SQL: ${sql}`)
      return { rows: [], rowCount: 0 }
    },
  }
  const require = createRequire(import.meta.url)
  function load(route: string) {
    const source = readFileSync(new URL(`../server/api/${route}.post.ts`, import.meta.url), 'utf8')
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    const module = { exports: {} as any }
    new Function('require', 'module', 'exports', output)((name: string) => {
      if (name === 'h3') return { ...require('h3'), defineEventHandler: (fn: any) => fn, readBody: async (event: any) => event }
      if (name === '~/server/db') return { pool: { connect: async () => client } }
      if (name === '~/server/utils/bill-stock') return { applyBillStock }
      if (name === '~/server/utils/bill-receipts') return { assertNoBillReceipts }
      if (name === '~/server/utils/user-ledger') return {}
      throw new Error(`Unexpected import: ${name}`)
    }, module, module.exports)
    return () => module.exports.default({ billId: 'bill', companyId: 'company' })
  }
  return { load, original, get stock() { return stock }, get deleted() { return deleted },
    fail() { failCommit = true }, foreign() { foreignItem = true }, receipt() {hasReceipts=true} }
}

for (const route of ['billSale/deleteBill', 'billEdit/deleteBill']) {
  test(`${route}: recorded receipt prevents deleting the invoice or changing stock`,async()=>{
    const f=fixture();f.receipt()
    await assert.rejects(f.load(route)(),(e:any)=>e.statusCode===409)
    assert.equal(f.deleted,false);assert.deepEqual(f.stock,f.original)
  })
  test(`${route}: repeated delete/restore cycles preserve qty and sold_qty`, async () => {
    const f = fixture()
    const remove = f.load(route)
    const restore = f.load('billSale/restoreBill')
    for (let cycle = 0; cycle < 3; cycle++) {
      await remove()
      assert.deepEqual(f.stock, { shirt: { qty: 10, sold: 0 }, shoe: { qty: 10, sold: 0 } })
      await assert.rejects(remove(), (e: any) => e.statusCode === 404)
      await restore()
      assert.deepEqual(f.stock, f.original)
      await assert.rejects(restore(), (e: any) => e.statusCode === 404)
      assert.deepEqual(f.stock, f.original)
    }
  })
  test(`${route}: missing/foreign items abort the operation`, async () => {
    const f = fixture()
    f.foreign()
    await assert.rejects(f.load(route)(), (e: any) => e.statusCode === 409)
    assert.equal(f.deleted, false)
    assert.deepEqual(f.stock, f.original)
  })
  test(`${route}: commit failure rolls back stock and deletion`, async () => {
    const f = fixture()
    f.fail()
    await assert.rejects(f.load(route)())
    assert.equal(f.deleted, false)
    assert.deepEqual(f.stock, f.original)
  })
}

test('restore failure rolls back stock and keeps the bill deleted', async () => {
  const f = fixture()
  await f.load('billSale/deleteBill')()
  const deletedStock = structuredClone(f.stock)
  f.fail()
  await assert.rejects(f.load('billSale/restoreBill')())
  assert.equal(f.deleted, true)
  assert.deepEqual(f.stock, deletedStock)
})
