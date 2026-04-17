export const usePurchaseReturnTableStore = defineStore('purchaseReturnTable', {
  state: () => ({
    search: '',
    minTotal: null as number | null,
    maxTotal: null as number | null,
    page: 1,
    pageCount: '10',
    sort: { column: 'createdAt', direction: 'desc' as const },
    selectedDate: null as { start: string; end: string } | null,
    selectedColumnKeys: [] as string[],
  }),
})
