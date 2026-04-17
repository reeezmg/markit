export const useExpenseTableStore = defineStore('expenseTable', {
  state: () => ({
    search: '',
    selectedStatus: [] as string[],
    selectedCategory: [] as string[],
    selectedUsers: [] as string[],
    selectedPaymentMode: [] as string[],
    minAmount: null as number | null,
    maxAmount: null as number | null,
    page: 1,
    pageCount: '10',
    sort: { column: 'id', direction: 'asc' as const },
    selectedDate: null as { start: string; end: string } | null,
    selectedColumnKeys: [] as string[],
  }),
})
