export const useProductsTableStore = defineStore('productsTable', {
  state: () => ({
    selectedColumnKeys: [] as string[],
  }),
})
