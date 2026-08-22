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

  const invalidateModels = (...models: string[]) =>
    Promise.all(
      models.map((model) =>
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY_PREFIX, model] })
      )
    )

  return { invalidateModels }
}
