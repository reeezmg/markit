import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { QueryClient } from '@tanstack/vue-query'

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 300000 } } })
const source = ts.transpileModule(readFileSync('composables/useModelCache.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '')
const revision = { value: 0 }
const useModelCache = new Function('useQueryClient', 'useState', `${source}\nreturn useModelCache`)(() => client, () => revision)

for (const model of ['Product', 'Variant', 'Item', 'PurchaseReturn', 'PurchaseOrder', 'DistributorCompany', 'DistributorPayment', 'DistributorCredit']) {
  client.setQueryData(['zenstack', model, 'findMany', { where: { companyId: 'fixture' } }, {}], [{ id: 'fixture' }])
}
const invalidated = model => client.getQueryCache().findAll({ queryKey: ['zenstack', model] })
  .every(query => query.state.isInvalidated)

await useModelCache().invalidateModels('Product', 'PurchaseOrder')
assert.ok(invalidated('PurchaseOrder'), 'Product PO save invalidates the PO table')
assert.ok(invalidated('DistributorCompany'), 'Product PO save invalidates embedded distributor totals')
assert.equal(invalidated('DistributorPayment'), false, 'Unrelated payment lists stay cached')

client.getQueryCache().findAll().forEach(query => query.setData(query.state.data))
await useModelCache().invalidateModels('DistributorPayment')
assert.ok(invalidated('DistributorPayment'), 'Payment save invalidates payment rows')
assert.ok(invalidated('PurchaseOrder'), 'Payment save invalidates calculated PO dues')
assert.ok(invalidated('DistributorCompany'), 'Payment save invalidates embedded distributor dues')

console.log('Purchase and payment saves invalidate PO and distributor table caches.')
client.getQueryCache().findAll().forEach(query => query.setData(query.state.data))
const beforeRevision = revision.value
await useModelCache().invalidateModels('PurchaseReturn')
for (const model of ['PurchaseReturn','PurchaseOrder','DistributorCompany','DistributorPayment','Product','Variant','Item']) {
  assert.ok(invalidated(model), `Return changes refresh ${model}`)
}
assert.equal(revision.value,beforeRevision+1,'Distributor accounting views receive a refresh signal')
client.getQueryCache().findAll().forEach(query => query.setData(query.state.data))
await useModelCache().invalidateModels('Distributor')
assert.ok(invalidated('DistributorCompany'),'Supplier edits refresh embedded names and balances')
