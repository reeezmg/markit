export const useTransferTableStore = defineStore('transferTable', {
  state: () => ({
    search: '',
    minAmount: null as number | null,
    maxAmount: null as number | null,
    fromTypeFilter: null as string | null,
    toTypeFilter: null as string | null,
    page: 1,
    pageCount: '10',
    sort: { column: 'createdAt', direction: 'desc' as const },
    selectedDate: null as { start: string; end: string } | null,
    selectedColumnKeys: [] as string[],
  }),
})
