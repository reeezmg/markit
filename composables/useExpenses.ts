import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'

// Cached list + optimistic mutations for the expense feature, on top of the raw
// pg /api/accounts/expense* endpoints. All list variants are cached under
// ['expenses','list', <params>]; mutations patch every cached variant via the
// ['expenses','list'] prefix and reconcile with the server on settle.
const LIST_KEY = ['expenses', 'list'] as const

// Form payload → POST/PUT body (matches the server contract).
const buildBody = (e: any) => ({
  expenseDate: e.date,
  expensecategoryId: e.categoryId,
  userId: e.userId || null,
  totalAmount: Number(e.amount) || 0,
  paymentMode: e.paymentMode,
  status: e.status || 'Paid',
  note: e.note || null,
  receipt: e.receipt || null,
  receiptName: e.receiptName || null,
  taxAmount: Number(e.taxAmount || 0),
})

// Form payload → the row fields the table renders, for optimistic display. The
// form keeps the full category/user objects, so we can show names immediately.
const optimisticFields = (e: any) => ({
  expenseDate: e.date,
  note: e.note || null,
  paymentMode: e.paymentMode,
  status: e.status || 'Paid',
  totalAmount: Number(e.amount) || 0,
  taxAmount: Number(e.taxAmount || 0),
  expensecategoryId: e.categoryId,
  expensecategory: e.category
    ? { id: e.category.id, name: e.category.name }
    : e.categoryId
      ? { id: e.categoryId, name: '' }
      : null,
  userId: e.userId || null,
  user: e.user ? { userId: e.user.userId, name: e.user.name } : null,
})

// Pull the clean server message out of an ofetch error (h3 `createError` sets
// `statusMessage`), avoiding ofetch's verbose `[POST] "/url": 400 …` string.
const errMessage = (err: any): string =>
  err?.data?.statusMessage || err?.data?.message || err?.statusMessage || err?.message || 'Something went wrong'

export function useExpenseList(
  params: Ref<Record<string, any>> | ComputedRef<Record<string, any>>,
) {
  const useAuth = () => useNuxtApp().$auth
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: computed(() => [...LIST_KEY, params.value]),
    queryFn: () =>
      $fetch<{ rows: any[]; total: number }>('/api/accounts/expenses', { query: params.value }),
    placeholderData: (prev: any) => prev, // keep current page visible while the next loads
    enabled: computed(() => !!useAuth().session.value?.companyId),
  })

  return {
    rows: computed(() => query.data.value?.rows ?? []),
    total: computed(() => query.data.value?.total ?? 0),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  }
}

export function useExpenseMutations() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const requireOnline = () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.add({
        title: 'No internet connection',
        description: 'You can only save changes while online. Please reconnect and try again.',
        color: 'red',
      })
      return false
    }
    return true
  }

  // Snapshot every cached list variant so we can roll back on error.
  const snapshot = () => queryClient.getQueriesData({ queryKey: LIST_KEY })
  const restore = (snap: any) =>
    snap.forEach(([key, data]: any) => queryClient.setQueryData(key, data))
  const patchLists = (fn: (old: any) => any) =>
    queryClient.setQueriesData({ queryKey: LIST_KEY }, (old: any) => (old ? fn(old) : old))
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['expenses'] })
  const beginOptimistic = async () => {
    await queryClient.cancelQueries({ queryKey: LIST_KEY })
    return snapshot()
  }

  const create = useMutation({
    mutationFn: (e: any) => $fetch('/api/accounts/expenses', { method: 'POST', body: buildBody(e) }),
    onMutate: async (e: any) => {
      const snap = await beginOptimistic()
      const tempRow = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        expenseNumber: null,
        createdAt: new Date().toISOString(),
        ...optimisticFields(e),
        __optimistic: true,
      }
      patchLists((old) => ({ ...old, rows: [tempRow, ...old.rows], total: (old.total ?? 0) + 1 }))
      return { snap }
    },
    onError: (err: any, _e, ctx: any) => {
      if (ctx?.snap) restore(ctx.snap)
      toast.add({ title: 'Failed to create expense', description: errMessage(err), color: 'red' })
    },
    onSuccess: () => toast.add({ title: 'Expense added', color: 'green' }),
    onSettled: () => {
      // Fire-and-forget so mutateAsync resolves immediately (snappy UI); the
      // optimistic row stays until this background refetch reconciles.
      invalidate()
    },
  })

  const update = useMutation({
    mutationFn: (vars: { id: string; e: any }) =>
      $fetch(`/api/accounts/expenses/${vars.id}`, { method: 'PUT', body: buildBody(vars.e) }),
    onMutate: async (vars: { id: string; e: any }) => {
      const snap = await beginOptimistic()
      const fields = optimisticFields(vars.e)
      patchLists((old) => ({
        ...old,
        rows: old.rows.map((r: any) => (r.id === vars.id ? { ...r, ...fields } : r)),
      }))
      return { snap }
    },
    onError: (err: any, _v, ctx: any) => {
      if (ctx?.snap) restore(ctx.snap)
      toast.add({ title: 'Failed to update expense', description: errMessage(err), color: 'red' })
    },
    onSuccess: () => toast.add({ title: 'Expense updated', color: 'green' }),
    onSettled: () => {
      // Fire-and-forget so mutateAsync resolves immediately (snappy UI); the
      // optimistic row stays until this background refetch reconciles.
      invalidate()
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => $fetch(`/api/accounts/expenses/${id}`, { method: 'DELETE' }),
    onMutate: async (id: string) => {
      const snap = await beginOptimistic()
      patchLists((old) => ({
        ...old,
        rows: old.rows.filter((r: any) => r.id !== id),
        total: Math.max(0, (old.total ?? 0) - 1),
      }))
      return { snap }
    },
    onError: (err: any, _id, ctx: any) => {
      if (ctx?.snap) restore(ctx.snap)
      toast.add({ title: 'Error while deleting expense', description: errMessage(err), color: 'red' })
    },
    onSuccess: () => toast.add({ title: 'Expense deleted successfully!', color: 'green' }),
    onSettled: () => {
      // Fire-and-forget so mutateAsync resolves immediately (snappy UI); the
      // optimistic row stays until this background refetch reconciles.
      invalidate()
    },
  })

  const status = useMutation({
    mutationFn: (vars: { ids: string[]; status: string }) =>
      $fetch('/api/accounts/expenses/status', { method: 'POST', body: vars }),
    onMutate: async (vars: { ids: string[]; status: string }) => {
      const snap = await beginOptimistic()
      const ids = new Set(vars.ids)
      patchLists((old) => ({
        ...old,
        rows: old.rows.map((r: any) => (ids.has(r.id) ? { ...r, status: vars.status } : r)),
      }))
      return { snap }
    },
    onError: (err: any, _v, ctx: any) => {
      if (ctx?.snap) restore(ctx.snap)
      toast.add({ title: 'Failed to update status', description: errMessage(err), color: 'red' })
    },
    onSuccess: () => toast.add({ title: 'Status updated', color: 'green' }),
    onSettled: () => {
      // Fire-and-forget so mutateAsync resolves immediately (snappy UI); the
      // optimistic row stays until this background refetch reconciles.
      invalidate()
    },
  })

  return {
    creating: create.isPending,
    updating: update.isPending,
    createExpense: async (e: any) => {
      if (!requireOnline()) return false
      // Optimistic onMutate shows the row instantly; await the result so the
      // caller only resets the form on success — on failure the row is rolled
      // back and the inputs are kept so the user can fix and retry.
      try {
        await create.mutateAsync(e)
        return true
      } catch {
        return false
      }
    },
    updateExpense: async (id: string, e: any) => {
      if (!requireOnline()) return false
      try {
        await update.mutateAsync({ id, e })
        return true
      } catch {
        return false
      }
    },
    deleteExpense: async (id: string) => {
      if (!requireOnline()) return false
      try {
        await remove.mutateAsync(id)
        return true
      } catch {
        return false
      }
    },
    updateStatus: async (ids: string[], statusVal: string) => {
      if (!ids?.length) return false
      if (!requireOnline()) return false
      try {
        await status.mutateAsync({ ids, status: statusVal })
        return true
      } catch {
        return false
      }
    },
  }
}
