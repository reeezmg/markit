/**
 * useBillingItems
 *
 * Manages bill row state:
 * - Barcode → item data fetching (with in-flight deduplication)
 * - Adding / removing rows
 * - Per-row tax and value calculation (deep watcher)
 * - Category deduplication watcher
 * - Handling product search and sales return results
 *
 * @param items         Reactive array of bill entries (from useBillingDraft)
 * @param categories    Reactive list of product categories (fetched in billing.vue)
 * @param categoryStore Pinia category store (for tax rules and shortcuts)
 * @param isTaxIncluded Whether tax is included in the base price (from session)
 * @param parentUser    Parent user tracking refs (from useBillingDraft)
 * @param focusBarcodeAt  Callback to focus the barcode input at a given row index
 */
export function useBillingItems(
  items: ReturnType<typeof ref>,
  categories: ReturnType<typeof ref>,
  categoryStore: ReturnType<typeof useCategoryStore>,
  isTaxIncluded: ReturnType<typeof ref>,
  parentUser: {
    code: ReturnType<typeof ref>
    id: ReturnType<typeof ref>
    name: ReturnType<typeof ref>
  },
  focusBarcodeAt: (index: number) => void
) {
  const toast = useToast()

  const loadingStates = ref<boolean[]>([])
  const currentRequestIds = ref<Record<number, string>>({})

  // ─── Watchers ───────────────────────────────────────────────────────────────

  // Keep only the latest category selection per row
  watch(
    items,
    (newItems: any[]) => {
      newItems.forEach((item, index) => {
        if (item.category.length > 1) {
          const lastCategory = item.category[item.category.length - 1]
          items.value[index].category = [lastCategory]
        }
      })
    },
    { deep: true }
  )

  // Recalculate discount, tax, and value for every row whenever items change
  watch(
    items,
    async () => {
      for (let index = 0; index < items.value.length; index++) {
        const item = items.value[index]

        // Step 1: Calculate discounted rate
        let discountedRate = item.rate
        const itemDiscount = !isNaN(Number(item.discount)) ? Number(item.discount) : 0
        if (itemDiscount < 0) {
          discountedRate -= Math.abs(itemDiscount)
        } else {
          discountedRate -= (discountedRate * itemDiscount) / 100
        }

        // Step 2: Resolve tax from category rules
        if (item.category[0]?.id) {
          const category = categoryStore.getCategoryById(item.category[0].id)
          if (category) {
            const { taxType, fixedTax, thresholdAmount, taxBelowThreshold, taxAboveThreshold } = category
            if (taxType === 'FIXED') {
              item.tax = fixedTax ?? 0
            } else {
              const effectiveValue = item.value / (item.qty || 1)
              item.tax = effectiveValue > thresholdAmount
                ? (taxAboveThreshold ?? 0)
                : (taxBelowThreshold ?? 0)
            }
          }
        }

        // Step 3: Calculate final row value
        let baseValue = discountedRate * (item.qty || 1)
        if (!isTaxIncluded.value) {
          baseValue += (baseValue * item.tax) / 100
        }
        item.value = parseFloat((baseValue || 0).toFixed(2))
      }
    },
    { deep: true }
  )

  // ─── Row management ─────────────────────────────────────────────────────────

  const addNewRow = async (index: number, moveToNextRow = true) => {
    const hasEmptyRow = items.value.some((item: any) =>
      !item.variantId?.trim() && !item.name?.trim() && !item.barcode?.trim() && !item.category?.length && item.qty > 0
    )

    if (!hasEmptyRow) {
      items.value.push({
        id: '', variantId: '', sn: items.value.length + 1, barcode: '',
        category: {}, size: '', name: '', qty: 1, rate: null, discount: null,
        tax: null, value: 0, sizes: {}, totalQty: 0, return: false, cost: 0,
        userCode: parentUser.code.value,
        user: parentUser.name.value,
        userId: parentUser.id.value,
      })
    }

    await nextTick()
    if (moveToNextRow) focusBarcodeAt(index + 1)
  }

  const removeRow = (event: Event, index: number, focusBarcodeAtPrev: (i: number) => void) => {
    const inputValue = (event.target as HTMLInputElement).value || null
    if (!inputValue) {
      event.preventDefault()
      if (items.value.length > 1) {
        items.value.splice(index, 1)
        items.value.forEach((item: any, i: number) => { item.sn = i + 1 })
      }
      focusBarcodeAtPrev(index - 1)
    }
  }

  // ─── Barcode / item fetching ─────────────────────────────────────────────────

  const fetchItemFromServer = async (barcode: string) => {
    try {
      if (!barcode) return null
      const data = await $fetch('/api/bill/findFirstItem', { query: { barcode } })
      return data ?? null
    } catch (error) {
      console.error('Error fetching item from server:', error)
      throw error
    }
  }

  const processItemResponse = (itemData: any, index: number) => {
    if (!items.value[index]) return

    const categoryId = itemData.variant.product.categoryId

    items.value[index].id = itemData.id ?? ''
    items.value[index].size = itemData.size ?? ''
    items.value[index].cost = itemData.variant?.pprice ?? 0
    items.value[index].name =
      `${itemData.variant.product.subcategory?.name ?? ''} ` +
      `${itemData.variant?.name ?? ''} ` +
      `${itemData.variant.product.name ?? ''}`
    items.value[index].category = categories.value.filter((c: any) => c.id === categoryId)
    items.value[index].rate = itemData.variant?.sprice ?? 0
    items.value[index].discount = (itemData.variant?.dprice ?? 0) - (itemData.variant?.sprice ?? 0)
    items.value[index].tax = itemData.variant?.tax ?? 0
    items.value[index].totalQty = itemData.qty ?? 0
    items.value[index].sizes = itemData.variant?.sizes ?? null
    items.value[index].variantId = itemData.variant?.id ?? ''
  }

  const handleInvalidBarcode = (index: number) => {
    if (!items.value[index]) return
    items.value[index].barcode = ''
    toast.add({ title: 'Barcode is invalid or item is empty!', color: 'red' })
  }

  const fetchItemData = async (barcode: string, index: number) => {
    if (!barcode || !items.value[index]) return

    loadingStates.value[index] = true
    currentRequestIds.value[index] = barcode

    try {
      const data = await fetchItemFromServer(barcode)
      if (currentRequestIds.value[index] !== barcode) return // stale response guard
      if (data) processItemResponse(data, index)
      else handleInvalidBarcode(index)
    } catch (error) {
      console.error('Error fetching item:', error)
      if (currentRequestIds.value[index] === barcode) handleInvalidBarcode(index)
    } finally {
      loadingStates.value[index] = false
      delete currentRequestIds.value[index]
    }
  }

  // ─── Bulk operations ────────────────────────────────────────────────────────

  const handleProductSelected = async (selectedItems: any[]) => {
    if (!selectedItems || selectedItems.length === 0) return
    for (const item of selectedItems) {
      const barcode = item.barcode
      if (!barcode) continue
      const index = items.value.length - 1
      items.value[index].barcode = barcode
      await fetchItemData(barcode, index)
      addNewRow(index, true)
    }
  }

  const handleReturnData = ({ returnedItems }: { returnedItems: any[] }) => {
    items.value = items.value.filter((item: any) =>
      item.name?.trim() || item.barcode?.trim() || item.category?.length > 0
    )
    const baseIndex = items.value.length
    returnedItems.forEach((item, i) => { item.sn = baseIndex + i + 1 })
    items.value.push(...returnedItems)
    addNewRow(items.value.length - 1)
  }

  return {
    loadingStates,
    currentRequestIds,
    addNewRow,
    removeRow,
    fetchItemData,
    handleProductSelected,
    handleReturnData,
  }
}
