import { companyStorageKey } from '~/utils/companyStorageKey';
import { billTotal, splitBillDiscount } from '~/utils/bill-adjustments';
import { newBillingDocumentValues, type BillingDefaults } from '~/utils/billing-preferences';
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
    id: '', variantId: '', name: '', sn: 1, barcode: '', category: [], size: '', unit: '',
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
    adjustment: 0,
    redeemedAmt: 0,
    paymentMethod: 'Cash',
    billingMode: 'paynow', dueDate: '', invoicePaymentTerms: '', invoiceReference: '',
    notes: '', termsAndConditions: '',
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

export function useBillingDraft(defaults: BillingDefaults = {}) {
  const companyScope = useCompanyScope();
  const $fetch = companyScope.fetch;
  const LOCAL_BILLS_KEY = companyStorageKey('bills', companyScope.companyId.value, useNuxtApp().$auth.session.value?.companyId || '');
  const BILLING_MODE_KEY = `markit_billing_mode:${companyScope.companyId.value}`;

  // ─── Bill state refs ────────────────────────────────────────────────────────
  const billNo = ref('1')
  const requestId = ref('')
  const date = ref(new Date().toISOString())
  const parentUserCode = ref(null)
  const parentUserId = ref(null)
  const parentUserName = ref(null)
  const discount = ref<string | number>(0)
  const adjustment = ref<string | number>(0)
  const redeemedAmt = ref(0)
  const redeemedPoints = ref(0)
  const paymentMethod = ref('Cash')
  const billingMode = ref('paynow')
  watch(billingMode, (mode) => {
    if (process.client) localStorage.setItem(BILLING_MODE_KEY, mode)
  }, { flush: 'sync' })
  const dueDate = ref('')
  const invoicePaymentTerms = ref('')
  const invoiceReference = ref('')
  const customerNotes = ref('')
  const termsAndConditions = ref('')
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

  function applyNewDocumentDefaults() {
    const values = newBillingDocumentValues(billingMode.value, toDateInputValue(date.value), defaults)
    customerNotes.value = values.notes; termsAndConditions.value = values.termsAndConditions
    dueDate.value = values.dueDate; invoicePaymentTerms.value = values.invoicePaymentTerms
  }
  function applyBillingModeDefaults(mode: string) {
    const previous = newBillingDocumentValues(billingMode.value, dateInput.value, defaults)
    const next = newBillingDocumentValues(mode, dateInput.value, defaults)
    if (customerNotes.value === previous.notes) customerNotes.value = next.notes
    if (termsAndConditions.value === previous.termsAndConditions) termsAndConditions.value = next.termsAndConditions
    if (mode === 'invoice' && !invoicePaymentTerms.value) {
      invoicePaymentTerms.value = next.invoicePaymentTerms; dueDate.value = next.dueDate
    }
  }

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

    return billTotal(baseTotal, discount.value, adjustment.value, redeemedAmt.value)
  })

  const tQty = computed(() =>
    items.value.reduce((sum, item) => {
      if (item.barcode || item.name || item.category.length > 0) return sum + (item.qty || 1)
      return sum
    }, 0)
  )

  // Date input model. A native date input emits '' on every keystroke until all
  // three segments are filled, so it holds its own string and only commits a
  // complete, valid date on change/blur (`commitDateInput`); anything else snaps
  // back to the last good value. Values are local-day, matching how dates are
  // rendered everywhere else (`toLocaleString`).
  const dateInput = ref(toDateInputValue(date.value))

  watch(date, (val) => {
    dateInput.value = toDateInputValue(val)
  })

  const commitDateInput = () => {
    const updated = applyDateInputValue(date.value, dateInput.value)
    if (updated) date.value = updated
    else dateInput.value = toDateInputValue(date.value)
  }

  // ─── localStorage sync ──────────────────────────────────────────────────────

  /** Aggregates all reactive bill state into a single snapshot for persistence. */
  const currentBill = computed(() => ({
    requestId: requestId.value,
    billNo: billNo.value,
    date: date.value,
    parentUserCode: parentUserCode.value,
    parentUserId: parentUserId.value,
    parentUserName: parentUserName.value,
    discount: discount.value,
    adjustment: adjustment.value,
    returnAmt: returnAmt.value,
    redeemedAmt: redeemedAmt.value,
    paymentMethod: paymentMethod.value,
    billingMode: billingMode.value, dueDate: dueDate.value,
    invoicePaymentTerms: invoicePaymentTerms.value, invoiceReference: invoiceReference.value,
    notes: customerNotes.value, termsAndConditions: termsAndConditions.value,
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
    requestId.value = bill.requestId ?? ''
    date.value = requestId.value ? bill.date : new Date().toISOString()
    parentUserCode.value = bill.parentUserCode ?? null
    parentUserId.value = bill.parentUserId ?? null
    parentUserName.value = bill.parentUserName ?? null
    const amounts = splitBillDiscount(bill.discount, bill.adjustment)
    discount.value = amounts.discount
    adjustment.value = amounts.adjustment
    redeemedAmt.value = bill.redeemedAmt ?? 0
    const invoice = billingMode.value === 'invoice'
    paymentMethod.value = invoice ? 'Credit' : bill.billingMode === 'invoice' ? 'Cash' : bill.paymentMethod ?? 'Cash'
    dueDate.value = bill.dueDate || (invoice ? toDateInputValue(date.value) : '')
    invoicePaymentTerms.value = bill.invoicePaymentTerms || (invoice ? 'Due on receipt' : '')
    invoiceReference.value = bill.invoiceReference || ''
    customerNotes.value = bill.notes || ''
    termsAndConditions.value = bill.termsAndConditions || ''
    phoneNo.value = bill.phoneNo ?? ''
    points.value = bill.points ?? 0
    clientName.value = bill.clientName ?? ''
    clientId.value = bill.clientId ?? ''
    couponValue.value = bill.couponValue ?? 0
    splitPayments.value = invoice ? [] : bill.splitPayments ?? []
    isRedeemPoint.value = bill.isRedeemPoint ?? false
    redeemedPoints.value = bill.redeemedPoints ?? 0
    selected.value = invoice ? null : bill.selected ?? null
    const defaultSplits = Object.fromEntries(PAYMENT_OPTIONS_IN_SPLIT.map(m => [m, { method: m, amount: null }]))
    tempSplits.value = { ...defaultSplits, ...(bill.tempSplits ?? {}) }
    items.value = (bill.items ?? []).map((item: any) => ({
      unit: item.unit ?? '',
      ...item,
    }))
  }

  function createNewBill() {
    const existing = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]')
    if (existing.length >= MAX_BILL_DRAFTS) return false
    const newBillNo = (existing.length + 1).toString()

    billNo.value = newBillNo
    requestId.value = ''
    date.value = new Date().toISOString()
    parentUserCode.value = null
    parentUserId.value = null
    parentUserName.value = null
    discount.value = 0
    adjustment.value = 0
    redeemedAmt.value = 0
    paymentMethod.value = billingMode.value === 'invoice' ? 'Credit' : 'Cash'
    dueDate.value = billingMode.value === 'invoice' ? toDateInputValue(date.value) : ''
    invoicePaymentTerms.value = billingMode.value === 'invoice' ? 'Due on receipt' : ''
    invoiceReference.value = ''
    applyNewDocumentDefaults()
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
    requestId.value = ''
    items.value = [{ ...makeEmptyItem(), rate: 0, discount: 0, tax: 0 }]
    discount.value = 0
    adjustment.value = 0
    date.value = new Date().toISOString()
    paymentMethod.value = billingMode.value === 'invoice' ? 'Credit' : 'Cash'
    dueDate.value = billingMode.value === 'invoice' ? toDateInputValue(date.value) : ''
    invoicePaymentTerms.value = billingMode.value === 'invoice' ? 'Due on receipt' : ''
    invoiceReference.value = ''
    applyNewDocumentDefaults()
    clientName.value = ''
    clientId.value = ''
    phoneNo.value = ''
    points.value = 0
    selected.value = null
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
    const savedMode = localStorage.getItem(BILLING_MODE_KEY)
    billingMode.value = savedMode === 'invoice' || savedMode === 'paynow'
      ? savedMode : bills[0]?.billingMode === 'invoice' ? 'invoice' : 'paynow'
    localStorage.setItem(BILLING_MODE_KEY, billingMode.value)
    if (bills.length === 0) {
      localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify([{ ...makeDefaultBill(), billingMode: billingMode.value,
        ...newBillingDocumentValues(billingMode.value, toDateInputValue(date.value), defaults) }]))
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
    discount, adjustment, redeemedAmt, redeemedPoints, paymentMethod, billingMode, dueDate, invoicePaymentTerms, invoiceReference,
    customerNotes, termsAndConditions,
    phoneNo, points, clientName, clientId, couponValue,
    splitPayments, isRedeemPoint, selected, tempSplits, items,
    draftBills, selectedDraft, requestId,
    // Computeds
    currentBill, returnAmt, subtotal, grandTotal, tQty,
    // Date input model
    dateInput, commitDateInput,
    // Functions
    createNewBill, loadDraftBills, loadBill, deleteBill, resetDraft,
    applyBillingModeDefaults,
    LOCAL_BILLS_KEY, MAX_BILL_DRAFTS,
  }
}
