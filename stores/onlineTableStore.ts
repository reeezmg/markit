export const useOnlineTableStore = defineStore('onlineTable', {
  state: () => ({
    search: '',
    selectedStatus: [] as string[],
    minGrandTotal: null as number | null,
    maxGrandTotal: null as number | null,
    page: 1,
    pageCount: '5',
    sort: { column: 'invoiceNumber', direction: 'desc' as const },
    selectedDate: null as { start: string; end: string } | null,
    selectedColumnKeys: [] as string[],
  }),
})
