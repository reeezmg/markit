export const useAccountsTableStore = defineStore('accountsTable', {
  state: () => ({
    search: '',
    selectedStatus: [] as string[],
    page: 1,
    pageCount: '5',
    sort: { column: 'name', direction: 'asc' as const },
    selectedDate: null as { start: string; end: string } | null,
    selectedColumnKeys: [] as string[],
  }),
})
