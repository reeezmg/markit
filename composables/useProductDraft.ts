import { v4 as uuidv4 } from 'uuid'

export const LOCAL_DRAFTS_KEY = 'product_drafts'
export const MAX_DRAFTS = 5

function makeEmptyVariant() {
  return {
    id: uuidv4(),
    key: uuidv4(),
    name: '',
    code: '',
    unit: 'Nos',
    qty: 0,
    sprice: 0,
    pprice: 0,
    dprice: 0,
    discount: 0,
    items: [{ id: uuidv4(), size: null, qty: undefined }],
    images: [],
  }
}

function makeEmptyForm() {
  return {
    editingProductId: '',
    name: '',
    brandId: '',
    description: '',
    category: {},
    subcategoryId: '',
    live: true,
    variants: [makeEmptyVariant()],
    deliveryType: '',
  }
}

function makeEmptyPurchaseInfo() {
  return {
    distributorId: '',
    billNo: '',
    billDate: new Date().toISOString().split('T')[0],
    paymentType: '',
    oldPaymentType: '',
    discount: 0,
    taxPercent: 0,
    adjustment: 0,
    subtotal: 0,
    total: 0,
  }
}

function makeDefaultDraft(draftNo = '1') {
  return {
    draftNo,
    poId: null,
    productIds: [],
    // Deferred add-products flow: full product objects staged client-side (image
    // uuids only — files already uploaded to S3) and NOT yet written to the DB.
    // They are batch-saved on Save and cleared only after the transaction succeeds.
    stagedProducts: [],
    form: makeEmptyForm(),
    purchaseInfo: makeEmptyPurchaseInfo(),
  }
}

function readDrafts() {
  if (!process.client) return []

  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_DRAFTS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Failed to parse product drafts:', error)
    return []
  }
}

function writeDrafts(drafts: any[]) {
  if (!process.client) return
  localStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(drafts))
}

function sameJson(a: any, b: any) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function useProductDraft() {
  const draftNo = ref('1')
  const poId = ref<string | null>(null)
  const productIds = ref<string[]>([])
  const stagedProducts = ref<any[]>([])
  const form = ref(makeEmptyForm())
  const purchaseInfo = ref(makeEmptyPurchaseInfo())
  const draftProducts = ref<any[]>([])
  const selectedDraft = ref<any>(null)
  const isHydrating = ref(false)
  // Flips to true only after the first hydration on mount. Until then,
  // we must NOT persist anything — child components (AddProductCreate,
  // AddProductVariants) emit `update` synchronously during their setup
  // via `{ immediate: true }` watchers, which would otherwise overwrite
  // the saved draft in localStorage with empty form data before hydration.
  const isReady = ref(false)

  const currentDraft = computed(() => ({
    draftNo: draftNo.value,
    poId: poId.value,
    productIds: productIds.value,
    stagedProducts: stagedProducts.value,
    form: form.value,
    purchaseInfo: purchaseInfo.value,
  }))

  function loadDrafts() {
    draftProducts.value = readDrafts()
  }

  function applyDraft(draft: any) {
    if (!draft) return

    isHydrating.value = true
    draftNo.value = draft.draftNo ?? '1'
    poId.value = draft.poId ?? null
    productIds.value = Array.isArray(draft.productIds) ? draft.productIds : []
    stagedProducts.value = Array.isArray(draft.stagedProducts) ? draft.stagedProducts : []
    form.value = { ...makeEmptyForm(), ...(draft.form ?? {}) }
    form.value.variants = Array.isArray(form.value.variants) && form.value.variants.length
      ? form.value.variants.map((variant: any) => ({
          ...makeEmptyVariant(),
          ...variant,
          images: [],
          items: Array.isArray(variant.items) && variant.items.length
            ? variant.items
            : [{ id: uuidv4(), size: null, qty: undefined }],
        }))
      : [makeEmptyVariant()]
    purchaseInfo.value = { ...makeEmptyPurchaseInfo(), ...(draft.purchaseInfo ?? {}) }
    selectedDraft.value = draftProducts.value.find((item: any) => item.draftNo === draftNo.value) ?? currentDraft.value
    nextTick(() => {
      isHydrating.value = false
    })
  }

  function loadDraft(nextDraftNo: string) {
    loadDrafts()
    const draft = draftProducts.value.find((item: any) => item.draftNo === nextDraftNo)
    if (draft) applyDraft(draft)
  }

  function createNewDraft() {
    loadDrafts()
    if (draftProducts.value.length >= MAX_DRAFTS) return false

    const used = new Set(draftProducts.value.map((draft: any) => String(draft.draftNo)))
    const nextNo = Array.from({ length: MAX_DRAFTS }, (_, index) => String(index + 1)).find(no => !used.has(no)) ?? String(draftProducts.value.length + 1)
    const draft = makeDefaultDraft(nextNo)
    const updated = [...draftProducts.value, draft]
    writeDrafts(updated)
    draftProducts.value = updated
    applyDraft(draft)
    return true
  }

  function deleteDraft(nextDraftNo: string) {
    loadDrafts()
    let updated = draftProducts.value.filter((draft: any) => draft.draftNo !== nextDraftNo)
    updated = updated.map((draft: any, index: number) => ({ ...draft, draftNo: String(index + 1) }))
    if (!updated.length) updated = [makeDefaultDraft()]
    writeDrafts(updated)
    draftProducts.value = updated
    applyDraft(updated[0])
  }

  function resetDraft() {
    form.value = makeEmptyForm()
    purchaseInfo.value = makeEmptyPurchaseInfo()
    poId.value = null
    productIds.value = []
    stagedProducts.value = []
  }

  watch(currentDraft, (draft) => {
    if (!process.client || !isReady.value || isHydrating.value) return

    const allDrafts = readDrafts()
    const index = allDrafts.findIndex((item: any) => item.draftNo === draft.draftNo)
    if (index === -1) {
      allDrafts.push(draft)
    } else if (!sameJson(allDrafts[index], draft)) {
      allDrafts[index] = draft
    } else {
      return
    }
    writeDrafts(allDrafts)
  }, { deep: true })

  watch(selectedDraft, (draft: any) => {
    if (!draft || draft.draftNo === draftNo.value) return
    loadDraft(draft.draftNo)
  })

  onMounted(() => {
    let drafts = readDrafts()
    if (!drafts.length) {
      drafts = [makeDefaultDraft()]
      writeDrafts(drafts)
    }
    draftProducts.value = drafts
    applyDraft(drafts[0])
    // Defer to nextTick so the hydration-triggered child re-emits run while
    // isHydrating is still true (their handlers skip on isHydrating), and only
    // mark ready after that settles — protecting the saved draft.
    nextTick(() => {
      isReady.value = true
    })
  })

  return {
    draftNo,
    poId,
    productIds,
    stagedProducts,
    form,
    purchaseInfo,
    draftProducts,
    selectedDraft,
    currentDraft,
    isReady,
    loadDraft,
    createNewDraft,
    deleteDraft,
    resetDraft,
    LOCAL_DRAFTS_KEY,
    MAX_DRAFTS,
  }
}
