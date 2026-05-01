/**
 * useBillingDraft
 *
 * Manages all bill state, localStorage draft persistence, and draft CRUD.
 * This is the foundation composable — all other billing composables consume refs returned here.
 */

const LOCAL_BILLS_KEY = 'bills'
const MAX_BILL_DRAFTS = 5

const PAYMENT_OPTIONS_IN_SPLIT = ['Cash', 'UPI', 'Card', 'Credit']

function makeEmptyItem() {
  return {
    id: '', variantId: '', name: '', sn: 1, barcode: '', category: [], size: '',
    item: '', qty: 1, rate: null, discount: null, tax: null, value: 0,
    cost: 0, sizes: {}, totalQty: 0, return: false, userCode: null, userId: null, user: null,
  }
}

function makeDefaultBill(billNo = '1') {
  return {
    billNo,
    date: new Date().toISOString(),
    parentUserCode: null,
    parentUserId: null,
    parentUserName: null,
    discount: 0,
    redeemedAmt: 0,
    paymentMethod: 'Cash',
    phoneNo: '',
    points: 0,
    clientName: '',
    clientId: '',
    couponValue: 0,
    splitPayments: [],
    isRedeemPoint: false,
    redeemedPoints: 0,
    selected: null,
    tempSplits: Object.fromEntries(PAYMENT_OPTIONS_IN_SPLIT.map(m => [m, { method: m, amount: null }])),
    items: [makeEmptyItem()],
  }
}

export function useBillingDraft() {
  // ─── Bill state refs ────────────────────────────────────────────────────────
  const billNo = ref('1')
  const date = ref(new Date().toISOString())
  const parentUserCode = ref(null)
  const parentUserId = ref(null)
  const parentUserName = ref(null)
  const discount = ref(0)
  const redeemedAmt = ref(0)
  const redeemedPoints = ref(0)
  const paymentMethod = ref('Cash')
  const phoneNo = ref('')
  const points = ref(0)
  const clientName = ref('')
  const clientId = ref('')
  const couponValue = ref(0)
  const splitPayments = ref([])
  const isRedeemPoint = ref(false)
  const selected = ref(null)
  const tempSplits = ref(
    Object.fromEntries(PAYMENT_OPTIONS_IN_SPLIT.map(m => [m, { method: m, amount: null }]))
  )
  const items = ref([makeEmptyItem()])

  // Draft list state
  const selectedDraft = ref(null)
  const draftBills = ref([])

  // ─── Computed totals ────────────────────────────────────────────────────────

  const returnAmt = computed(() =>
    items.value.reduce((sum, item) => {
      if (item.return) return sum + (item.qty || 1) * (item.rate || 0)
      return sum
    }, 0)
  )

  const subtotal = computed(() =>
    items.value.reduce((sum, item) => {
      const itemTotal = (item.qty || 1) * (item.rate || 0)
      return item.return ? sum - itemTotal : sum + itemTotal
    }, 0)
  )

  const grandTotal = computed(() => {
    const baseTotal = items.value.reduce((sum, item) => {
      const itemValue = item.value || 0
      return item.return ? sum - itemValue : sum + itemValue
    }, 0)

    const discStr = String(discount.value ?? '')
    const afterDiscount = discStr.startsWith('+')
      ? parseFloat((baseTotal + Math.abs(parseFloat(discStr))).toFixed(2))
      : Number(discount.value) < 0
        ? parseFloat((baseTotal - Math.abs(Number(discount.value))).toFixed(2))
        : parseFloat((baseTotal - (baseTotal * Number(discount.value)) / 100).toFixed(2))

    return afterDiscount - redeemedAmt.value
  })

  const tQty = computed(() =>
    items.value.reduce((sum, item) => {
      if (item.barcode || item.name || item.category.length > 0) return sum + (item.qty || 1)
      return sum
    }, 0)
  )

  const dateOnly = computed({
    get: () => date.value.split('T')[0],
    set: (val) => {
      const original = new Date(date.value)
      const updated = new Date(val + 'T' + original.toISOString().split('T')[1])
      date.value = updated.toISOString()
    },
  })

  // ─── localStorage sync ──────────────────────────────────────────────────────

  /** Aggregates all reactive bill state into a single snapshot for persistence. */
  const currentBill = computed(() => ({
    billNo: billNo.value,
    date: date.value,
    parentUserCode: parentUserCode.value,
    parentUserId: parentUserId.value,
    parentUserName: parentUserName.value,
    discount: discount.value,
    returnAmt: returnAmt.value,
    redeemedAmt: redeemedAmt.value,
    paymentMethod: paymentMethod.value,
    phoneNo: phoneNo.value,
    points: points.value,
    clientName: clientName.value,
    clientId: clientId.value,
    couponValue: couponValue.value,
    splitPayments: splitPayments.value,
    isRedeemPoint: isRedeemPoint.value,
    redeemedPoints: redeemedPoints.value,
    selected: selected.value,
    tempSplits: tempSplits.value,
    items: items.value,
  }))

  watch(currentBill, (newVal) => {
    const allBills = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]')
    const index = allBills.findIndex((b: any) => b.billNo === newVal.billNo)
    if (index !== -1) {
      allBills[index] = newVal
      localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify(allBills))
    }
    const updated = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]')
    draftBills.value = updated
    selectedDraft.value = updated.find((b: any) => b.billNo === newVal.billNo)
  }, { deep: true })

  // ─── Draft CRUD ─────────────────────────────────────────────────────────────

  function loadDraftBills() {
    try {
      draftBills.value = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]')
    } catch (e) {
      console.error('Failed to parse draft bills:', e)
      draftBills.value = []
    }
  }

  function loadBill(billNumber: string) {
    const bill = draftBills.value.find((b: any) => b.billNo === billNumber)
    if (!bill) return

    billNo.value = bill.billNo ?? ''
    date.value = new Date().toISOString()
    parentUserCode.value = bill.parentUserCode ?? null
    parentUserId.value = bill.parentUserId ?? null
    parentUserName.value = bill.parentUserName ?? null
    discount.value = bill.discount ?? 0
    redeemedAmt.value = bill.redeemedAmt ?? 0
    paymentMethod.value = bill.paymentMethod ?? 'Cash'
    phoneNo.value = bill.phoneNo ?? ''
    points.value = bill.points ?? 0
    clientName.value = bill.clientName ?? ''
    clientId.value = bill.clientId ?? ''
    couponValue.value = bill.couponValue ?? 0
    splitPayments.value = bill.splitPayments ?? []
    isRedeemPoint.value = bill.isRedeemPoint ?? false
    redeemedPoints.value = bill.redeemedPoints ?? 0
    selected.value = bill.selected ?? null
    const defaultSplits = Object.fromEntries(PAYMENT_OPTIONS_IN_SPLIT.map(m => [m, { method: m, amount: null }]))
    tempSplits.value = { ...defaultSplits, ...(bill.tempSplits ?? {}) }
    items.value = bill.items ?? []
  }

  function createNewBill() {
    const existing = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]')
    if (existing.length >= MAX_BILL_DRAFTS) return false
    const newBillNo = (existing.length + 1).toString()

    billNo.value = newBillNo
    date.value = new Date().toISOString()
    parentUserCode.value = null
    parentUserId.value = null
    parentUserName.value = null
    discount.value = 0
    redeemedAmt.value = 0
    paymentMethod.value = 'Cash'
    phoneNo.value = ''
    points.value = 0
    clientName.value = ''
    clientId.value = ''
    couponValue.value = 0
    splitPayments.value = []
    isRedeemPoint.value = false
    redeemedPoints.value = 0
    selected.value = null
    tempSplits.value = Object.fromEntries(PAYMENT_OPTIONS_IN_SPLIT.map(m => [m, { method: m, amount: null }]))
    items.value = [makeEmptyItem()]

    const newBill = currentBill.value
    existing.push(newBill)
    existing.forEach((b: any, i: number) => { b.billNo = (i + 1).toString() })
    localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify(existing))
    loadDraftBills()
    selectedDraft.value = newBill
    return true
  }

  function deleteBill(billNumber: string) {
    const deleted = draftBills.value.filter((b: any) => b.billNo !== billNumber)
    deleted.forEach((b: any, i: number) => { b.billNo = (i + 1).toString() })
    localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify(deleted))
    loadDraftBills()
    const updated = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]')
    if (updated.length > 0) selectedDraft.value = updated[0]
  }

  /**
   * Resets current draft to a blank slate.
   * Caller should also clear selectedCouponId and focus the first barcode input.
   */
  function resetDraft() {
    items.value = [{ ...makeEmptyItem(), rate: 0, discount: 0, tax: 0 }]
    discount.value = 0
    paymentMethod.value = 'Cash'
    clientName.value = ''
    clientId.value = ''
    phoneNo.value = ''
    points.value = 0
    selected.value = null
    date.value = new Date().toISOString()
    parentUserCode.value = null
    parentUserId.value = null
    parentUserName.value = null
    isRedeemPoint.value = false
    couponValue.value = 0
    redeemedAmt.value = 0
    redeemedPoints.value = 0
  }

  // Watch draft selection — load bill when user switches drafts
  watch(selectedDraft, (val: any) => {
    if (val && val.billNo !== billNo.value) {
      loadBill(val.billNo)
    }
  })

  // ─── Bootstrap on mount ─────────────────────────────────────────────────────

  onMounted(() => {
    const bills = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]')
    if (bills.length === 0) {
      localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify([makeDefaultBill()]))
    }
    const updated = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]')
    if (updated.length > 0) {
      loadDraftBills()
      selectedDraft.value = updated[0]
      loadBill(updated[0].billNo)
    }
  })

  return {
    // State
    billNo, date, parentUserCode, parentUserId, parentUserName,
    discount, redeemedAmt, redeemedPoints, paymentMethod,
    phoneNo, points, clientName, clientId, couponValue,
    splitPayments, isRedeemPoint, selected, tempSplits, items,
    draftBills, selectedDraft,
    // Computeds
    currentBill, returnAmt, subtotal, grandTotal, tQty, dateOnly,
    // Functions
    createNewBill, loadDraftBills, loadBill, deleteBill, resetDraft,
    LOCAL_BILLS_KEY, MAX_BILL_DRAFTS,
  }
}
