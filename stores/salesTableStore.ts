export const useSalesTableStore = defineStore('salesTable', {
  state: () => ({
    search: '',
    selectedStatus: [] as string[],
    selectedPaymentMethods: [] as string[],
    minGrandTotal: null as number | null,
    maxGrandTotal: null as number | null,
    selectedDate: null as { start: string; end: string } | null,
    page: 1,
    pageCount: '5',
    sort: { column: 'invoiceNumber', direction: 'desc' as const },
    selectedColumnKeys: [] as string[],
  }),
})
