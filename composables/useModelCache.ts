import { useQueryClient } from '@tanstack/vue-query'

// ZenStack's tanstack-query runtime keys every hook query as
// ['zenstack', <Model>, <operation>, <args>, <flags>], so passing the first two
// segments as a prefix matches every findMany/findUnique/count query for a model.
const QUERY_KEY_PREFIX = 'zenstack'

/**
 * Raw-SQL endpoints (server/api/products/*, server/api/purchaseorder/*) write
 * straight to Postgres and never touch the ZenStack hook cache. With the global
 * 5-minute `staleTime` (plugins/vue-query.ts) a list page mounted right after
 * such a write serves stale rows until a hard refresh — e.g. products saved on
 * /products/add were missing from /products. Call this after every raw-SQL write
 * so the affected model queries refetch on their next mount.
 */
export const useModelCache = () => {
  const queryClient = useQueryClient()

  const invalidateModels = (...models: string[]) => {
    const affected = new Set(models)
    // Supplier tables embed purchase orders and their payments in a
    // DistributorCompany query. Invalidating the source model alone leaves
    // those nested totals and dues cached after raw-SQL saves.
    if (affected.has('PurchaseOrder') || affected.has('DistributorPayment') || affected.has('DistributorCredit') || affected.has('PurchaseReturn')) {
      affected.add('DistributorCompany')
    }
    if (affected.has('DistributorPayment')) affected.add('PurchaseOrder')
    const queries = [...affected].map((model) =>
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY_PREFIX, model] })
      )
    if (['PurchaseOrder', 'DistributorPayment', 'DistributorCredit', 'PurchaseReturn', 'Bill', 'Expense', 'MoneyTransaction', 'Product', 'Item', 'Variant'].some(model => affected.has(model))) {
      queries.push(queryClient.invalidateQueries({ predicate: query =>
        query.queryKey[0] === 'accountant-v2' && ['chart-directory', 'chart-ledger'].includes(String(query.queryKey[2]))
      }))
    }
    return Promise.all(queries)
  }

  return { invalidateModels }
}
