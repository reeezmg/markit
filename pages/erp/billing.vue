<script setup>
const companyScope = useCompanyScope('form', true);
await companyScope.ready;
const $fetch = companyScope.fetch;
const salesWorkflow = useSalesWorkflow(companyScope.companyId, $fetch);
await salesWorkflow.ready;
const invoicingEnabled = computed(() => salesWorkflow.preferences.value.includeInvoicing);
const afterSalesEnabled = computed(() => salesWorkflow.preferences.value.includeAfterSales);

import { BillingAddClient } from '#components';
import BillingPaymentTerms from '~/components/Billing/PaymentTerms.vue';
import BillingDiscountAdjustment from '~/components/Billing/DiscountAdjustment.vue';
import { billingErrorMessage } from '~/utils/billing-error';
import { billSaveActionIcon, billSaveActionIcons } from '~/utils/bill-save-action-icon';
import '~/assets/css/billing-layout.css';
import { v4 as uuidv4 } from 'uuid';
import { Capacitor } from '@capacitor/core';
import { invoiceDetails } from '~/utils/invoice-flow';
import { billDiscountValue, billAdjustmentValue } from '~/utils/bill-adjustments';
import { receiptEntryAmounts, receiptEntryTotals } from '~/utils/receipt-entry-amounts';
const documentDefaults = {};
const defaultResults = await Promise.allSettled(['invoice', 'sale'].map(document => $fetch('/api/settings/billing-preferences', { query: { document } })));
defaultResults.forEach((result, index) => {
  if (result.status === 'fulfilled') {
    const value = result.value;
    documentDefaults[index === 0 ? 'invoice' : 'sale'] = value.preferences;
    if (index === 0) documentDefaults.terms = value.terms;
  }
});


const { printBill } = usePrint();
const useAuth = () => companyScope.auth;
const toast = useToast();
onMounted(() => {
  if (defaultResults.some(result => result.status === 'rejected')) toast.add({ title: 'Could not load document defaults', description: 'Check customer notes, terms and payment terms before saving.', color: 'orange' });
});
const isTaxIncluded = ref(useAuth().session.value?.isTaxIncluded);
const isUserTrackIncluded = ref(useAuth().session.value?.isUserTrackIncluded);
const paymentOptionsInsplit = ['Cash', 'UPI', 'Card','Credit']
const paymentOptions = ref(['Cash', 'UPI', 'Card','Credit'])

// ─── Draft / bill state ────────────────────────────────────────────────────
const {
  billNo, date, parentUserCode, parentUserId, parentUserName,
  discount, adjustment, redeemedAmt, redeemedPoints, paymentMethod,
  phoneNo, points, clientName, clientId, couponValue,
  splitPayments, isRedeemPoint, selected, tempSplits, items,
  draftBills, selectedDraft, requestId: uuid,
  currentBill, returnAmt, subtotal, grandTotal, tQty,
  dateInput, commitDateInput,
  createNewBill, loadDraftBills, loadBill, deleteBill, resetDraft,
  LOCAL_BILLS_KEY, MAX_BILL_DRAFTS,
  billingMode, dueDate, invoicePaymentTerms, invoiceReference,
  customerNotes, termsAndConditions,
  applyBillingModeDefaults,
} = useBillingDraft(documentDefaults)

const isInvoiceMode = computed(() => billingMode.value === 'invoice')
const isNotesOpen = ref(false)
const billingRoute = useRoute()
const billingRouter = useRouter()
onMounted(async () => {
  await nextTick()
  const mode = billingRoute.query.billingMode
  if (mode === 'invoice' || mode === 'paynow') {
    changeBillingMode(mode)
    const query = { ...billingRoute.query }
    delete query.billingMode
    await billingRouter.replace({ path: billingRoute.path, query })
  }
})
const billingModes = [{ label: 'Pay now', value: 'paynow' }, { label: 'Invoice', value: 'invoice' }]
function changeBillingMode(mode) {
  if (!invoicingEnabled.value) mode = 'paynow'
  applyBillingModeDefaults(mode)
  billingMode.value = mode
  selected.value = null
  splitPayments.value = []
  paymentMethod.value = mode === 'invoice' ? 'Credit' : 'Cash'
  if (mode === 'invoice') { dueDate.value ||= dateInput.value; invoicePaymentTerms.value ||= 'Due on receipt' }
}
watch([invoicingEnabled, billingMode], ([enabled, mode]) => {
  if (!enabled && mode !== 'paynow') changeBillingMode('paynow')
}, { immediate: true, flush: 'sync' })

const isProductSearchOpen = ref(false);
const RECENT_BILL_KEY = 'markit_recent_bill_id'

const scannedBarcode = ref("");
const barcodeInputs = ref([]);
const categoryInputs = ref([]);
const nameInputs = ref([]);
const phoneInputs = ref([]);
const qtyInputs = ref([]);
const rateInputs = ref([]);
const discountInputs = ref([]);
const userInputs = ref([]);
const taxInputs = ref([]);
const discountref = ref();
const paymentref = ref();
const saveref = ref();
const categoryStore = useCategoryStore()
const userStore = useUserStore()

const printModel = ref(false);
const isSaving = ref(false);
let printData = {}   
const isMobile = ref(false);
const showUnitColumn = computed(() => {
  const units = useAuth().session.value?.variantInputs?.unit
  return Array.isArray(units) && units.length > 1
})

const canCreateDraft = computed(() => draftBills.value.length < MAX_BILL_DRAFTS)

const handleCreateNewDraft = () => {
  const created = createNewBill()
  if (!created) {
    toast.add({
      title: `You can only keep ${MAX_BILL_DRAFTS} drafts at once.`,
      color: 'orange',
    })
  }
}


const showSplitModal = ref(false)
const isOpen = ref(false)
const issalesReturnModelOpen = ref(false);
const isClientAddModelOpen = ref(false);


const handleKeydown = async (e) => {
  if (e.key === 'F2') {
    e.preventDefault()
    await openRecentBill()
    return
  }

  if (e.key === 'Enter' && e.shiftKey) {

    e.preventDefault()

    await nextTick()

    phoneInputs.value?.$el
      ?.querySelector('input')
      ?.focus()
  }
}



/* =====================================================
   MOUNT / UNMOUNT
===================================================== */

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})




const categories = ref([])

// ─── Items (row management, barcode fetching, tax/value watchers) ────────────
const {
  loadingStates,
  currentRequestIds,
  addNewRow,
  removeRow: _removeRow,
  fetchItemData,
  handleProductSelected,
  handleReturnData,
} = useBillingItems(
  items,
  categories,
  categoryStore,
  isTaxIncluded,
  { code: parentUserCode, id: parentUserId, name: parentUserName },
  (index) => barcodeInputs.value[index]?.$el?.querySelector('input')?.focus()
)

// Thin wrapper so template call sites stay as removeRow($event, index)
const removeRow = (event, index) =>
  _removeRow(event, index, (i) => barcodeInputs.value[i]?.$el?.querySelector('input')?.focus())

const deleteRowByIndex = (index) => {
  if (items.value.length <= 1) return

  items.value.splice(index, 1)
  items.value.forEach((item, i) => {
    item.sn = i + 1
  })

  const component = barcodeInputs.value[index - 1]
  const input = component?.$el?.querySelector('input')
  input?.focus()
}

// Camera / barcode scanning (web Quagga2 + native Capacitor)
const { showCamera, videoRef, handleScan, stopCamera } = useBillingCamera((barcode) => {
  const lastIndex = items.value.length - 1
  if (lastIndex >= 0) {
    items.value[lastIndex].barcode = barcode
    fetchItemData(barcode, lastIndex)
    addNewRow(lastIndex, true)
  }
})


// ─── Client lookup + points redemption ──────────────────────────────────────
const {
  isClientLoading,
  clientMatches,
  redeeming,
  applySelectedClient,
  handleEnterPhone,
  handleClientAdded,
  handleRedeemPoints,
} =
  useBillingClient(
    phoneNo, clientId, clientName, points,
    redeemedAmt, redeemedPoints, isRedeemPoint, grandTotal,
    isClientAddModelOpen,
    () => {
      const input = discountref.value?.$el?.querySelector('input')
      input?.focus()
      input?.select()
    }
  )

const showClientSuggestions = ref(false)

const openClientSuggestions = () => {
  showClientSuggestions.value = Boolean(String(phoneNo.value || '').trim())
}

const handleClientSearchEnter = async () => {
  const result = await handleEnterPhone()
  showClientSuggestions.value = result === 'ambiguous' || result === 'loading'
}

const handleClientSuggestionSelect = (match) => {
  applySelectedClient(match)
  showClientSuggestions.value = false
}

watch(phoneNo, (newValue, oldValue) => {
  if (newValue === oldValue) return
  showClientSuggestions.value = Boolean(String(newValue || '').trim())
})

// ─── Coupons (fetch, eligibility, discount calc, watchers) ──────────────────
const { allCoupons, selectedCouponId, eligibleCoupons, couponRefetch } = useBillingCoupons(
  clientId, items, grandTotal, redeemedAmt, couponValue
)

const giftCouponLineKey = 'couponGiftCouponId'

const isEmptyBillingRow = (row) =>
  !row?.variantId?.trim?.() &&
  !row?.name?.trim?.() &&
  !row?.barcode?.trim?.() &&
  !(row?.category?.length > 0)

const removeGiftCouponProduct = (couponId) => {
  const coupon = allCoupons.value?.find((candidate) => candidate.id === couponId)
  const giftBarcode = String(coupon?.giftBarcode || '').trim()
  const index = items.value.findIndex((row) =>
    row?.[giftCouponLineKey] === couponId ||
    (giftBarcode && row?.barcode === giftBarcode && Number(row?.discount) === 100)
  )
  if (index >= 0) {
    items.value.splice(index, 1)
    items.value.forEach((item, i) => { item.sn = i + 1 })
  }
}

const addGiftCouponProduct = async (coupon) => {
  if (!coupon || coupon.type !== 'GIFT') return
  const barcode = String(coupon.giftBarcode || '').trim()
  if (!barcode) {
    toast.add({ title: 'Gift product barcode missing in coupon setup', color: 'red' })
    return
  }
  if (items.value.some((row) => row?.[giftCouponLineKey] === coupon.id)) return

  let index = items.value.findIndex(isEmptyBillingRow)
  if (index < 0) {
    await addNewRow(items.value.length - 1, false)
    index = items.value.findIndex(isEmptyBillingRow)
  }
  if (index < 0 || !items.value[index]) return

  items.value[index].barcode = barcode
  items.value[index][giftCouponLineKey] = coupon.id
  items.value[index].couponGiftCode = coupon.code

  await fetchItemData(barcode, index)

  if (items.value[index]?.variantId) {
    items.value[index][giftCouponLineKey] = coupon.id
    items.value[index].couponGiftCode = coupon.code
    items.value[index].qty = 1
    items.value[index].discount = 100
    await addNewRow(index, false)
    toast.add({ title: `Gift product added for coupon ${coupon.code}`, color: 'green' })
  }
}

watch(selectedCouponId, async (newCoupon, oldCoupon) => {
  if (newCoupon || oldCoupon) {
    await couponRefetch()
  }
  if (oldCoupon?.value) removeGiftCouponProduct(oldCoupon.value)
  const chosen = allCoupons.value?.find((coupon) => coupon.id === newCoupon?.value)
  if (chosen?.type === 'GIFT') await addGiftCouponProduct(chosen)
})

// ─── Reset (calls useBillingDraft.resetDraft + clears coupon + focuses barcode) ───
const reset = () => {
  resetDraft()
  selectedCouponId.value = null
  skipPoints.value = false
  barcodeInputs.value[0]?.$el?.querySelector('input')?.focus()
  couponRefetch()
}





const resizableTable = ref(null); // Reference to the table element
const billingTableStyle = useBillingTableLayout(resizableTable);

// Table column definitions — drives the <thead> via v-for
const columns = computed(() => {
const cols = [
    { key: 'sn', label: 'SN' },
    { key: 'barcode', label: 'Barcode' },
    { key: 'category', label: 'Category' },
    { key: 'name', label: 'Name' },
    { key: 'rate', label: 'Rate' },
    { key: 'qty', label: 'Qty' },
  ]
  if (showUnitColumn.value) cols.push({ key: 'unit', label: 'Unit' })
  cols.push({ key: 'discount', label: 'Discount' })
  if (isUserTrackIncluded.value) cols.push({ key: 'user', label: 'User' })
  cols.push({ key: 'tax', label: 'Tax' })
  if (useAuth().session.value?.role === 'admin' && useAuth().session.value?.isCostIncluded === true) {
    cols.push({ key: 'cost', label: 'Cost' })
  }
  cols.push({ key: 'value', label: 'Value' })
  cols.push({ key: 'actions', label: '' })
  return cols
})

let isResizing = false;
let startX = 0;
let startWidth = 0;
let columnIndex = 0;

watch(selected, (newSelected) => {
  if (String(newSelected || '').startsWith('__')) {
    selected.value = null
    return
  }
  if(newSelected){
    paymentMethod.value = 'Credit'
  }
})


watch(paymentMethod, (newMethod) => {
  if (newMethod !== 'Split') {
     const index = paymentOptions.value.indexOf('Split');
    if (index !== -1) {
      paymentOptions.value.splice(index, 1);
    }
  }else {
    if (!paymentOptions.value.includes('Split')) {
      paymentOptions.value.push('Split');
    }
  }
});





const startResize = (index, event) => {
  isResizing = true;
  columnIndex = index;
  startX = event.clientX;
  startWidth = resizableTable.value.querySelectorAll('th')[index].offsetWidth;

  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
};

const handleResize = (event) => {
  if (!isResizing) return;

  const currentX = event.clientX;
  const deltaX = currentX - startX;
  const newWidth = startWidth + deltaX;

  // Update the width of the column
  const th = resizableTable.value.querySelectorAll('th')[columnIndex];
  th.style.width = `${newWidth}px`;

  // Update the width of the corresponding cells
  const tds = resizableTable.value.querySelectorAll(`td:nth-child(${columnIndex + 1})`);
  tds.forEach((td) => {
    td.style.width = `${newWidth}px`;
  });
};

const stopResize = () => {
  isResizing = false;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
};




onMounted(() => {
  // Initialize column widths (optional)
  const ths = resizableTable.value.querySelectorAll('th');
  ths.forEach((th) => {
    th.style.width = `${th.offsetWidth}px`;
  });
});



const getCategories = async () => {
  try {
    const companyId = useAuth().session.value?.companyId
    if (!companyId) {
      console.warn('companyId not ready yet')
      return
    }

    const data = await $fetch('/api/bill/findManyCategory', {
      method: 'GET',
      query: {
        companyId,
      },
    })

    categories.value = data ?? []
  } catch (error) {
    console.error('Error fetching categories:', error)
  }
}


onMounted(async() => {
  await getCategories()
})




const handleEnterBarcode = (barcode,index) => {
 const pattern = /^\d+[A-Z]\d{6}$/;

  if(!barcode){
    const component = discountref.value;
    const input = component.$el.querySelector("input");
    input.focus();
    input.select();
  }else{
    if(!pattern.test(barcode)){
      const resolved = categoryStore.resolveShortCut(barcode)
      if (resolved?.category) {
        items.value[index].category = categories.value.filter(c => c.id === resolved.category.id)
        if (resolved.subcategory) {
          items.value[index].name = resolved.subcategory.name
          items.value[index].subcategoryId = resolved.subcategory.id
          items.value[index]._subcategory = resolved.subcategory
        } else {
          items.value[index].name = ''
          items.value[index].subcategoryId = null
          items.value[index]._subcategory = null
        }
      }
      items.value[index].barcode = '';
      const component = rateInputs.value[index];
      const input = component.$el.querySelector("input");
      input.select();
    }else{
      fetchItemData(barcode, index);
      addNewRow(index);
    }
}}

const handleEnterMainDiscount = () => {
  if (billingMode.value === 'invoice') { saveref.value?.$el?.focus(); return }
  const component = paymentref.value;
  const select = component.$el.querySelector("select");
  select.focus();
};

const handleEnterPayment = () => {
  const component = saveref.value;
  const button = component.$el;
  button.focus();
};



const selectAllText = (index) => {
  const component = barcodeInputs.value[index];
  if (component?.$el) {
    const input = component.$el.querySelector("input");
    if (input) {
      input.select();
    }
  }
};

const selectedAction = ref(null)

const STORAGE_KEY = 'markit_selected_action'

// 👉 Load saved action
onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY)
  selectedAction.value = saved && saved !== 'null' ? saved : null
})

function selectAction(action) {
  selectedAction.value = action

  if (action) {
    localStorage.setItem(STORAGE_KEY, action)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

const openRecentBill = async () => {
  const recentBillId = localStorage.getItem(RECENT_BILL_KEY)
  if (!recentBillId) {
    toast.add({
      title: 'No recent bill found',
      color: 'orange',
    })
    return
  }

  await navigateTo(`/erp/edit/${recentBillId}`)
}

const actionItems = [
  [
    { label: 'Print', icon: billSaveActionIcons.print, click: () => selectAction('print') },
    { label: 'Send', icon: billSaveActionIcons.send, click: () => selectAction('send') },
    { label: 'Download', icon: billSaveActionIcons.download, click: () => selectAction('download') },
    { label: 'None', icon: billSaveActionIcons.none, click: () => selectAction(null) }
  ]
]

const draftMenuItems = [
  [
    { label: 'Notes', icon: 'i-heroicons-document-text', click: () => { isNotesOpen.value = true } },
    { label: 'Reset', icon: 'i-heroicons-arrow-path', click: () => reset() },
    { label: 'Add Row', icon: 'i-heroicons-plus', click: () => addNewRow(0, false) },
    { label: 'Recent Bill', icon: 'i-heroicons-document-text', shortcuts: ['F2'], click: () => openRecentBill() },
  ],
]



const print = async() => {
  printModel.value = false
  try{
    await printBill(printData)
    toast.add({
      title: 'Printing Success!',
      color: 'green',
    });
  }catch(err){
      printModel.value = true
      toast.add({
        title: 'Printing failed!',
        description: billingErrorMessage(err, 'Unable to print the receipt. Check your printer and try again.'),
        color: 'red',
      });
  }
}

const download = async() => {
  printModel.value = false
  try{
   const { generateThermalReceiptPDF } = await import('~/utils/thermal-receipt.client')
    const ress = await generateThermalReceiptPDF(printData,"receipt.pdf")
  toast.add({
        title: 'Download Success!',
        color: 'green',
      });
  }catch(err){
      printModel.value = true
      toast.add({
        title: 'Download failed!',
        description: billingErrorMessage(err, 'Unable to download the receipt. Please try again.'),
        color: 'red',
      });
  }
}

const send = async() => {
  printModel.value = false
  try{
    if(!printData.clientPhone){
      throw new Error('Client phone number is missing')
    }
      const { shareReceiptPDF } = await import('~/utils/share-receipt.client')
      const receiptShare = await shareReceiptPDF(printData, String(printData.billId || uuid.value))
      const sent = await $fetch('/api/whatsapp/send-payment-template', {
        method: 'POST',
        body: {
          phone: printData.clientPhone,
          name: printData.clientName,
          billName: printData.companyName,
          amount: printData.grandTotal,
          paymentDate: printData.date,
          receiptId: receiptShare.receiptId,
          companyId: printData.companyId,
        },
      })
      if (!sent?.success) throw new Error(sent?.message || 'Could not send the receipt PDF. Please retry.')
      if (Array.isArray(printData.generatedCoupons) && printData.generatedCoupons.length) {
        await $fetch('/api/whatsapp/send-coupon-message', {
          method: 'POST',
          body: {
            phone: printData.clientPhone,
            name: printData.clientName,
            companyName: printData.companyName,
            coupons: printData.generatedCoupons,
          },
        })
      }
  toast.add({
        title: 'Receipt Sent Success!',
        color: 'green',
      });
  }catch(err){
      printModel.value = true
      toast.add({
        title: 'Receipt failed to Sent!',
        description: billingErrorMessage(err, 'Unable to send the receipt. Please try again.'),
        color: 'red',
      });
  }
}


// ─── handleSave helpers ───────────────────────────────────────────────────────

function validateBillEntries(rawItems) {
  const finalitems = (rawItems || []).filter(
    (item) => item?.name?.trim() || item?.barcode?.trim() || (item?.category?.length ?? 0) > 0
  )
  if (finalitems.length === 0) throw new Error('No valid items to bill.')
  finalitems.forEach((item, idx) => {
    const n = idx + 1
    if (!item?.category?.[0]?.id) throw new Error(`Row ${n}: category is required`)
    const qty = Number(item.qty ?? 1)
    if (!Number.isFinite(qty)) throw new Error(`Row ${n}: qty is not a valid number`)
    if (!item.return && qty <= 0) throw new Error(`Row ${n}: qty must be greater than 0`)
    const rate = Number(item.rate ?? 0)
    if (!Number.isFinite(rate)) throw new Error(`Row ${n}: rate is not a valid number`)
    if (rate < 0) throw new Error(`Row ${n}: rate cannot be negative`)
  })
  return finalitems
}

function validateBillState({ session, items, grandTotal, paymentMethod, splitPayments, redeemedAmt, date, currentRequestIds }) {
  if (!session?.companyId) throw new Error('Session expired. Please refresh and try again.')
  if (Object.keys(currentRequestIds).length > 0) throw new Error('Please wait for all items to finish loading.')

  // Items
  const validItems = (items || []).filter(
    (item) => item?.name?.trim() || item?.barcode?.trim() || (item?.category?.length ?? 0) > 0
  )
  if (validItems.length === 0) throw new Error('Add at least one item before saving.')

  // Totals
  const total = Number(grandTotal)
  if (!Number.isFinite(total)) throw new Error('Grand total is invalid. Check discount values.')


  // Redeemed amount can't exceed pre-discount total
  if (Number(redeemedAmt) > total + Number(redeemedAmt)) {
    // redeemedAmt is already subtracted in grandTotal, so raw check: just ensure total isn't negative
    // (already caught above)
  }

  // Payment method
  if (!paymentMethod) throw new Error('Select a payment method before saving.')
  if (paymentMethod === 'Split') {
    if (!splitPayments || splitPayments.length === 0)
      throw new Error('Confirm the split payment breakdown before saving.')
  }

  // Date
  if (!date || Number.isNaN(new Date(date).getTime()))
    throw new Error('Bill date is invalid.')
}

function buildEntriesData(finalitems, companyId) {
  return finalitems.map((item) => {
    const base = {
      name: item.name || '',
      qty: Number(item.qty || 1),
      rate: Number(item.rate || 0),
      discount: Number(item.discount || 0),
      tax: Number(item.tax || 0),
      value: Number(item.value || 0),
      cost: Number(item.cost || 0),
      return: Boolean(item.return),
    }
    if (item.size) base.size = item.size
    if (item.barcode) base.barcode = item.barcode
    if (item.id) base.item = { connect: { id: item.id } }
    if (item.variantId) base.variant = { connect: { id: item.variantId } }
    if (item.category?.[0]?.id) base.category = { connect: { id: item.category[0].id } }
    if (item.userId) {
      base.userName = item.user
      base.companyUser = { connect: { companyId_userId: { companyId, userId: item.userId } } }
    }
    return base
  })
}

const skipPoints = ref(false)

function computeBillPoints(session, grandTotalVal) {
  const pointsValue = Number(session?.pointsValue || 0)
  return pointsValue > 0 ? Math.round(Number(grandTotalVal || 0) / pointsValue) : 0
}

function buildBillPayload({ session, entriesData, billPoints, hasCreditPayment, refs }) {
  const { subtotal, discount, grandTotal, returnAmt, couponValue, paymentMethod,
          redeemedPoints, clientId, selected, splitPayments, date } = refs
  const creditParty = parseCreditParty(selected.value)
  return {
    // invoiceNumber is assigned server-side inside the create transaction
    subtotal: Number(subtotal.value) || 0,
    discount: billDiscountValue(discount.value),
    discountType: billDiscountValue(discount.value) < 0 ? 'flat' : 'percentage',
    adjustment: billAdjustmentValue(refs.adjustment?.value),
    grandTotal: Number(grandTotal.value) || 0,
    returnAmt: Number(returnAmt.value) || 0,
    couponValue: Number(couponValue.value) || 0,
    paymentMethod: paymentMethod.value || 'Cash',
    ...(redeemedPoints.value ? { redeemedPoints: Number(redeemedPoints.value) || 0 } : {}),
    ...(clientId.value ? { billPoints: Number(billPoints) } : { billPoints: 0 }),
    createdAt: new Date(date.value).toISOString(),
    paymentStatus: hasCreditPayment ? 'PENDING' : 'PAID',
    type: 'BILL',
    notes: refs.customerNotes?.value || '', termsAndConditions: refs.termsAndConditions?.value || '',
    entries: { create: entriesData },
    company: { connect: { id: session.companyId } },
    companyUser: { connect: { companyId_userId: { companyId: session.companyId, userId: session.id } } },
    ...(clientId.value && { client: { connect: { id: clientId.value } } }),
    ...(creditParty.kind === 'account' && { account: { connect: { id: creditParty.id } } }),
    ...(creditParty.kind === 'user' && { creditUserId: creditParty.id }),
    ...(paymentMethod.value === 'Split' && { splitPayments: splitPayments.value }),
  }
}

function buildPrintData({ billInv, session, finalitems, refs }) {
  const { subtotal, discount, grandTotal, paymentMethod, splitPayments,
          clientName, phoneNo, date, points, redeemedPoints, couponValue } = refs
  const units = session?.variantInputs?.unit
  const showUnit = Array.isArray(units) && units.length > 1
  return {
    invoiceNumber: billInv,
    notes: refs.customerNotes?.value || '', termsAndConditions: refs.termsAndConditions?.value || '',
    companyId: session.companyId,
    phone: session?.companyPhone,
    description: session?.description,
    thankYouNote: session?.thankYouNote,
    refundPolicy: session?.refundPolicy,
    returnPolicy: session?.returnPolicy,
    date: new Date(date.value).toISOString(),
    showUnit,
    entries: finalitems.map((entry) => {
      const discountVal = Number(entry.discount) < 0
        ? Number(entry.discount)
        : Number(entry.discount) > 0
        ? `${Number(entry.discount)}%`
        : 0
      return {
        description: entry.barcode ? entry.name : entry.category[0].name,
        hsn: entry.category[0].hsn,
        ...receiptEntryAmounts(entry),
        mrp: Number(entry.rate || 0),
        discount: discountVal,
        tax: Number(entry.tax || 0),
        size: entry.size || '',
        unit: entry.unit || 'Nos',
        barcode: entry.barcode,
      }
    }),
    subtotal: Number(subtotal.value) || 0,
    discount: String(discount.value ?? ''),
    adjustment: billAdjustmentValue(refs.adjustment?.value),
    grandTotal: Number(grandTotal.value) || 0,
    paymentMethod: paymentMethod.value,
    isTaxIncluded: session?.isTaxIncluded || false,
    companyName: session?.companyName || '',
    companyAddress: session?.address || {},
    gstin: session?.gstin || '',
    ...(paymentMethod.value === 'Split' && { splitPayments: splitPayments.value }),
    accHolderName: session?.accHolderName || '',
    upiId: session?.upiId || '',
    clientName: clientName.value,
    clientPhone: phoneNo.value,
    availablePoints: Number(points.value) || 0,
    redeemedPoints: Number(redeemedPoints.value) || 0,
    couponValue: Number(couponValue.value) || 0,
    ...receiptEntryTotals(finalitems),
  }
}

function fireFcmNotification(companyId, billInv, grandTotalVal, session) {
  ;(async () => {
    try {
      await $fetch('/api/notifyfcm', {
        method: 'POST',
        body: {
          companyId,
          excludeDeviceId: localStorage.getItem('device_id'),
          title: `New Bill Created in ${session?.companyName}`,
          body: `Invoice #${billInv} for ₹${Number(grandTotalVal) || 0} has been created.`,
          data: { url: '/erp/sales' },
        },
      })
    } catch {}
  })()
}

async function ensureClientExists() {
  if (!clientId.value) return
  const data = await $fetch('/api/bill/findUniqueClient', {
    query: { phone: `+91${phoneNo.value}` },
  })
  if (!data?.id || data.id !== clientId.value) {
    throw new Error('Client not found. Please re-add the client before saving.')
  }
}

// ─── Save handler (orchestrator) ─────────────────────────────────────────────

const serialRegistration = useBillingSerialNumbers(items, clientId, afterSalesEnabled, companyScope.companyId, $fetch);
const serviceCustomerRequired = serialRegistration.required;
const serviceUnits = serialRegistration.serviceUnits;
const returnedServiceUnitIds = serialRegistration.returnedUnitIds;
const handleSave = async () => {
  if (isSaving.value) return

  // Flush a date that is typed but not yet blurred.
  commitDateInput()

  isSaving.value = true
  try {
    if (process.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('No internet connection')
    }
    await nextTick()

    const session = useAuth().session.value
    billDiscountValue(discount.value)
    billAdjustmentValue(adjustment.value)
    let invoice = null
    if (billingMode.value === 'invoice') {
      if (!clientId.value) throw new Error('Select a client by name or phone before creating the invoice.')
      if (Number(grandTotal.value) <= 0) throw new Error('Invoice total must be greater than zero.')
      invoice = invoiceDetails({ dueDate: dueDate.value, invoicePaymentTerms: invoicePaymentTerms.value, subject: invoiceReference.value }, date.value)
      paymentMethod.value = 'Credit'; splitPayments.value = []; selected.value = null
    }

    // ── Pre-flight validation (runs before counter is incremented) ────────────
    validateBillState({
      session,
      items: items.value,
      grandTotal: grandTotal.value,
      paymentMethod: paymentMethod.value,
      splitPayments: splitPayments.value,
      redeemedAmt: redeemedAmt.value,
      date: date.value,
      currentRequestIds: currentRequestIds.value,
    })

    uuid.value ||= uuidv4()
    await nextTick()
    const companyId = session?.companyId
    const userId = session?.id

    const finalitems = validateBillEntries(items.value)

    await serialRegistration.waitUntilReady()
    if (serviceCustomerRequired.value && !clientId.value) throw new Error('Select a client for warranty, guarantee or maintenance registration.')
    await ensureClientExists()

    const billPoints = skipPoints.value ? 0 : computeBillPoints(session, grandTotal.value)
    const returnedItems = finalitems.filter((i) => i.return)
    const entriesData = buildEntriesData(finalitems, companyId)
    const hasCreditPayment =
      paymentMethod.value === 'Credit' ||
      (paymentMethod.value === 'Split' && splitPayments.value.some((p) => p?.method === 'Credit'))

    const draftRefs = { subtotal, discount, adjustment, grandTotal, returnAmt, couponValue, paymentMethod,
                        redeemedPoints, clientId, selected, splitPayments, date, clientName, phoneNo, points,
                        customerNotes, termsAndConditions }

    const payload = buildBillPayload({ session, entriesData, billPoints, hasCreditPayment, refs: draftRefs })
    if (invoice) Object.assign(payload, invoice, { billingMode: 'invoice' })

    const result = await $fetch('/api/bill/create', {
      method: 'POST',
      body: { uuid: uuid.value, payload, items: finalitems, returnedItems, billPoints, serviceUnits: serviceUnits.value, returnedServiceUnitIds: returnedServiceUnitIds.value,
              clientId: clientId.value, companyId, couponId: selectedCouponId.value?.value || null, userId },
    })
    if (result?.billId) {
      localStorage.setItem(RECENT_BILL_KEY, result.billId)
    }

    // Invoice number is assigned by the create transaction — use it for the receipt
    const billInv = result?.invoiceNumber
    printData = buildPrintData({ billInv, session, finalitems, refs: draftRefs })
    printData.billId = result?.billId || uuid.value
    if (invoice) Object.assign(printData, invoice, { billingMode: 'invoice', invoiceCode: `INV-${billInv}`, amountReceived: 0, balanceDue: grandTotal.value, invoicePaymentStatus: 'Unpaid' })
    printData.generatedCoupons = result?.generatedCoupons || []
    fireFcmNotification(companyId, billInv, grandTotal.value, session)

    const action = selectedAction.value
    if (invoice) printModel.value = true
    if (action === 'print') await print()
    else if (action === 'send') await send()
    else if (action === 'download') await download()

    toast.add({ title: invoice ? 'Invoice created — unpaid' : 'Bill created successfully!', color: 'green' })
    reset()
  } catch (error) {
    console.error('Error creating bill', error)
    toast.add({ title: 'Bill creation failed!', description: billingErrorMessage(error, 'Unable to save the bill. Please try again.'), color: 'red' })
  } finally {
    isSaving.value = false
  }
}



const accounts = ref([])

function parseCreditParty(value) {
  if (!value || String(value).startsWith('__')) return { kind: null, id: null }
  const raw = String(value)
  if (raw.startsWith('account:')) return { kind: 'account', id: raw.slice('account:'.length) }
  if (raw.startsWith('user:')) return { kind: 'user', id: raw.slice('user:'.length) }
  return { kind: 'account', id: raw }
}

function formatCreditPartyOption(option) {
  if (option?.kind === 'header') return option.name
  return option?.name || ''
}


const getAccounts = async () => {
  try {
    const companyId = useAuth().session.value?.companyId
    if (!companyId) {
      console.warn('companyId not ready yet, skipping fetch')
      return
    }

    const data = await $fetch('/api/bill/findManyAccount', {
      method: 'GET',
      query: { companyId, includeUsers: true },
    })

    accounts.value = data ?? []
  } catch (err) {
    console.error('Error fetching accounts:', err)
  } 
}

onMounted(async () => {
  await getAccounts()
})




const moveFocus = (currentRowIndex, currentField, direction) => {
  const fieldOrder = ['barcode', 'category', 'name', 'rate', 'qty', 'discount', ...(isUserTrackIncluded.value ? ['user'] : []), 'tax'];

  const currentFieldIndex = fieldOrder.indexOf(currentField);

  let nextRowIndex = currentRowIndex;
  let nextFieldIndex = currentFieldIndex;

  switch (direction) {
    case 'up':
      nextRowIndex = Math.max(0, currentRowIndex - 1);
      break;
    case 'down':
      nextRowIndex = Math.min(items.value.length - 1, currentRowIndex + 1);
      break;
    case 'left':
      nextFieldIndex = Math.max(0, currentFieldIndex - 1);
      break;
    case 'right':
      nextFieldIndex = Math.min(fieldOrder.length - 1, currentFieldIndex + 1);
      break;
  }

  // If we changed rows, keep the same column
  if (direction === 'up' || direction === 'down') {
    nextFieldIndex = currentFieldIndex;
  }

  focusInput(nextRowIndex, fieldOrder[nextFieldIndex]);
};

const focusInput = async (rowIndex, field) => {
  await nextTick();
  try {
    switch (field) {
      case 'barcode':
        barcodeInputs.value[rowIndex]?.$el?.querySelector('input')?.select();
        break;
      case 'category':
        categoryInputs.value[rowIndex]?.querySelector('button')?.focus();
        break;
      case 'name':
        nameInputs.value[rowIndex]?.$el?.querySelector('input')?.select();
        break;
      case 'qty':
        qtyInputs.value[rowIndex]?.$el?.querySelector('input')?.select();
        break;
      case 'rate':
        rateInputs.value[rowIndex]?.$el?.querySelector('input')?.select();
        break;
      case 'discount':
        discountInputs.value[rowIndex]?.$el?.querySelector('input')?.select();
        break;
      case 'user':
        if (isUserTrackIncluded) {
          userInputs.value[rowIndex]?.$el?.querySelector('input')?.select();
        }
        break;
      case 'tax':
        taxInputs.value[rowIndex]?.$el?.querySelector('input')?.select();
        break;
    }
  } catch (e) {
    console.error('Error focusing input:', e);
  }
};
const movecatgeory = (rowIndex) => {
  const td = categoryInputs.value[rowIndex];
  if (!td) return;

  const button = td.querySelector('button');
  if (!button) return;

  button.focus();
  button.click(); // Open the dropdown

  setTimeout(() => {
    const ul = td.querySelector('ul[role="listbox"]');
    if (!ul) return;

    // Set focus to the input inside the dropdown if available
    const comboInput = ul.querySelector('input[role="combobox"]');
    if (comboInput) {
      comboInput.focus();
    } else {
      ul.focus(); // fallback
    }  

    // Add key listener to ul
    ul.addEventListener('keydown', function handler(e) {
      if (e.key === 'ArrowRight') {
        button.click(); 
        nameInputs.value[rowIndex].$el.querySelector('input')?.focus();
       
      
      }
    });

    ul.addEventListener('keydown', function handler(e) {
      if (e.key === 'ArrowLeft') {
        button.click(); 
        barcodeInputs.value[rowIndex].$el.querySelector('input').focus();
        requestAnimationFrame(() => {
          barcodeInputs.value[rowIndex].$el.querySelector('input').select();
        });
      }
    });
  }, 100); // enough time for dropdown to render
};

onMounted(() => {
  nextTick(() => {
    const input = barcodeInputs.value[0]?.$el?.querySelector('input');
    input?.focus();
  });
});


watch(isClientAddModelOpen, async (val) => {
  if (val === true) {
    showClientSuggestions.value = false
  }

  if (val === false) {

    await nextTick()

    const input =
      discountref.value?.$el
        ?.querySelector('input')

    input?.focus()
    input?.select()
  }

})






const handleSplit = () => {
  showSplitModal.value = true
}

function onSplitConfirmed(confirmedPayments) {
  splitPayments.value = confirmedPayments
  if (!paymentOptions.value.includes('Split')) {
    paymentOptions.value.push('Split')
  }
  paymentMethod.value = 'Split'
}

function handleCategoryChange(category, rowIndex) {
  const isEmpty = !category || Object.keys(category).length === 0;

  if (!isEmpty) {
    rateInputs.value[rowIndex]?.$el?.querySelector('input')?.focus();
      addNewRow(rowIndex,false)
  }
}

onMounted(() => {
  isMobile.value = window.innerWidth < 1024;
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth < 1024;
  });
});

async function updateUserDetails(index, user) {
if(!user) return
  const userdetails = userStore.getuserByCode(user)

  if (userdetails) {
    items.value[index].userCode = user
    items.value[index].user = userdetails.name || null
    items.value[index].userId = userdetails.id || null

  } else {
    items.value[index].user = null // Optional: clear name if user not found
     toast.add({
    title: 'user code invalid!',
    color: 'red',
  });
  }
}

async function updateParentUserDetails(user) {
  if (!user) {
    parentUserCode.value = null
    parentUserName.value = null
    parentUserId.value = null
    items.value = items.value.map((item) => ({
      ...item,
      userCode: null,
      user: null,
      userId: null
    }))
    return
  }

  const userdetails = userStore.getuserByCode(Number(user))

  if (userdetails) {
    parentUserCode.value = Number(user)
    parentUserName.value = userdetails.name || null
    parentUserId.value = userdetails.id || null
    items.value = items.value.map((item) => ({
      ...item,
      userCode: Number(user),
      user: userdetails.name || null,
      userId: userdetails.id || null
    }))
  } else {
    parentUserCode.value = null
    parentUserName.value = null
    parentUserId.value = null
    toast.add({
      title: 'user code invalid!',
      color: 'red',
    });
  }
}

const handleDiscountEnter = (index) => {
  if (isUserTrackIncluded.value) {
    moveFocus(index, 'discount', 'right');
  } else {
    addNewRow(index);
  }
};





watch(() => companyScope.auth.session.value?.isTaxIncluded, value => { isTaxIncluded.value = value; });
watch(() => companyScope.auth.session.value?.isUserTrackIncluded, value => { isUserTrackIncluded.value = value; });
</script>


<template>
  <UDashboardPanelContent class="billing-page p-1">
      <CompanyFormField toolbar />
      <ClientOnly>
        <Teleport to="#page-navbar-actions">
          <USelect v-if="invoicingEnabled" :model-value="billingMode" :options="billingModes" aria-label="Billing mode" :disabled="isSaving" class="w-32" @update:model-value="changeBillingMode" />
        </Teleport>
      </ClientOnly>
                  
      <UCard :style="billingTableStyle" :inert="isSaving"
    :ui="{
      base: 'billing-card flex flex-col',
      rounded: '',
      ring: 'ring-0 lg:ring-1 lg:ring-gray-200 lg:dark:ring-gray-800', // force no ring on mobile
      divide: 'divide-y divide-gray-200 dark:divide-gray-700',
      body: {
        padding: '',
        base: 'billing-card-body divide-y divide-gray-200 dark:divide-gray-700 z-10'
      },
      footer: {
        base: 'divide-y divide-gray-200 dark:divide-gray-700',
        padding: ''
      },
       header: {
        base: '',
        padding: ''
      }
    }"
  >

    <template #header>
      <UAlert v-if="serialRegistration.error.value" :title="serialRegistration.error.value" color="orange" class="m-2"><template #actions><UButton size="xs" variant="soft" @click="serialRegistration.load">Retry</UButton></template></UAlert>
    <!-- 📷 Camera View -->
    <div class="relative px-2">
      <div
        v-if="showCamera"
        ref="videoRef"
        class="w-full h-[200px] bg-black rounded-lg overflow-hidden"
      ></div>

      <!-- ❌ Close Camera Button -->
      <UButton
        v-if="showCamera"
        icon="i-heroicons-x-mark"
        size="xs"
        color="gray"
        variant="solid"
        class="absolute top-2 right-2 z-10"
        @click="() => { showCamera = false; stopCamera() }"
      />
    </div>
     <div class="w-full flex flex-wrap gap-4 lg:hidden  py-2 px-2">
          <UButton color="blue" class="flex-1" block :disabled="!canCreateDraft" @click="handleCreateNewDraft" >New</UButton>
          <UButton  :loading="isSaving" :icon="billSaveActionIcon(selectedAction)" ref="saveref" color="green" class="flex-1" block @click="handleSave">{{ isInvoiceMode ? 'Create invoice' : 'Save' }}</UButton>
          <UButton class="flex-1" @click="issalesReturnModelOpen = true" block>Return</UButton>
        </div>
    
        <div  class="lg:hidden flex flex-row items-center justify-between lg:col-span-2 gap-2 py-2 px-2">
        <div class="flex-1 border border-primary-700 dark:border-primary-300 rounded-md">
          <div class="flex flex-col items-center justify-center py-3">
            <div class="text-s">Sub Total</div>
            <div class="text-primary-700 dark:text-primary-300 font-bold text-2xl leading-none">₹{{ subtotal.toFixed(2) }}</div>
          </div>
        </div>
            

          <!-- Grand Total Display -->
          <div class="flex-1 border border-green-700 dark:border-green-300 rounded-md">
          <div class="flex flex-col items-center justify-center py-3">
            <div class="text-s">Grand Total</div>
            <div class="text-green-700 dark:text-green-300 font-bold text-2xl leading-none ">₹{{ grandTotal.toFixed(2) }}</div>
          </div>
        </div>
        </div>
     
         <div class="lg:hidden col-span-2 flex flex-row flex-wrap items-end gap-2 py-2 px-2">
            <UInput
              v-model="dateInput"
              type="date"
              :aria-label="isInvoiceMode ? 'Invoice date' : 'Date'"
              class="flex-1 min-w-32"
              @change="commitDateInput"
              @blur="commitDateInput"
            />
            <UInput
              v-if="isUserTrackIncluded"
              v-model="parentUserCode"
              type="number"
              label="User Code"
              placeholder="Enter user code"
              class="flex-1"
              @keydown.enter.prevent="updateParentUserDetails(parentUserCode)"
              @blur="updateParentUserDetails(parentUserCode)"
            />
            <UButton color="primary" icon="i-heroicons-camera" label="Scan" block class="flex-1" @click="handleScan"/>
          </div>
        
       <div class="billing-topbar hidden lg:flex items-end gap-2 text-sm py-2 px-2">
          <UInput
            v-model="dateInput"
            type="date"
            :aria-label="isInvoiceMode ? 'Invoice date' : 'Date'"
            class="w-40"
            @change="commitDateInput"
            @blur="commitDateInput"
          />
          <UInput
            v-if="isUserTrackIncluded"
            v-model="parentUserCode"
            type="number"
            label="User Code"
            placeholder="Enter user code"
            class="w-40"
            @keydown.enter.prevent="updateParentUserDetails(parentUserCode)"
            @blur="updateParentUserDetails(parentUserCode)"
          />
  
  <!-- Draft and toolbar actions -->
<div class="ml-auto flex items-center gap-2">
    <USelectMenu
      v-model="selectedDraft"
      :options="draftBills"
      placeholder="Select Draft Bill"
      class="flex-1"
    >
      <template #label>
        <span>Draft {{ selectedDraft?.billNo }}</span>
      </template>

      <template #option="{ option: bill }">
        <div class="flex justify-between items-center w-full px-2">
          <div class="font-medium">Draft {{ bill.billNo }}</div>
          <UButton
            v-if="draftBills.length > 1"
            class="text-red-500 hover:text-red-700 ml-2"
            icon="i-heroicons-x-circle"
            variant="ghost"
            @mousedown.prevent.stop="deleteBill(bill.billNo)"
          />
        </div>
      </template>
    </USelectMenu>

    <UDropdown :items="draftMenuItems">
      <UButton
        color="primary"
        icon="i-heroicons-ellipsis-horizontal"
        class="flex-shrink-0"  
      />
    </UDropdown>
  </div>
   <UButton  v-if="Capacitor.isNativePlatform()" color="primary" icon="i-heroicons-camera" aria-label="Scan barcode" title="Scan barcode" square class="flex-shrink-0" @click="handleScan"/>
  
</div>


   <BillingInvoiceDetails v-if="isInvoiceMode && isMobile" v-model:due-date="dueDate" v-model:terms="invoicePaymentTerms" :invoice-date="dateInput" :disabled="isSaving" :show-reference="false" />
   </template>

    
<div  v-if="isMobile" class="block lg:hidden space-y-4 py-1 px-2">
  <div
    v-for="(row, index) in items"
    :key="row.sn"    
    :class="[
      'p-4 text-sm space-y-3',   
      index % 2 === 0 
        ? 'bg-gray-300 dark:bg-zinc-700'  // Even rows
        : 'bg-gray-100 dark:bg-zinc-900'     // Odd rows
    ]"
  >
    <!-- SN, Name, Value row -->
    <div class="flex justify-between text-gray-800 dark:text-gray-200 font-medium">
      <span  :class="{ 'text-red-600': row.return }">SN: {{ row.sn }}</span>
      <span  :class="{ 'text-red-600': row.return }">{{ row.name }}</span>
      <span v-if="((useAuth().session.value?.role === 'admin') && useAuth().session.value?.isCostIncluded === true)" :class="{ 'text-red-600': row.return }">₹{{ row.cost }}</span>
      <span  :class="{ 'text-red-600': row.return }">₹{{ row.value }}</span>
      <div class="flex items-center gap-1"><BillingSerialNumbers v-if="afterSalesEnabled" :item="row" :covered="serialRegistration.isCovered(row)" :owned="serialRegistration.owned.value" v-model:returned-unit-ids="returnedServiceUnitIds" :disabled="isSaving" @details="details => serialRegistration.setDetails(row, details)" /><UButton icon="i-heroicons-trash" color="red" variant="ghost" size="xs" aria-label="Delete row" @click="deleteRowByIndex(index)" /></div>
    </div>

    <!-- Row 1: Barcode | Qty | Discount -->
    <div class="grid grid-cols-3 gap-2">
      <UInput
        v-model="row.barcode"
        placeholder="Barcode"
        size="sm"
        ref="barcodeInputs"
        :color="row.return ? 'red' : undefined"
        @focus="selectAllText(index)"
        @keyup.delete="removeRow($event, index)"
        enterkeyhint="enter"
        @keyup.enter.prevent="handleEnterBarcode(row.barcode, index)"
        @keyup.tab.prevent="handleEnterBarcode(row.barcode, index)"
      />
       <UInput
        v-model="row.rate"
        ref="rateInputs"
        placeholder="Rate"
        type="number"
        size="sm"
         enterkeyhint="enter"
          :color="row.return ? 'red' : undefined"
        @keyup.enter="moveFocus(index, 'rate', 'right')"
        @keyup.tab.prevent="moveFocus(index, 'rate', 'right')"
      />
      
      <UInput
        v-model="row.discount"
        placeholder="Discount"
        ref="discountInputs" 
        type="text"
        size="sm"
        inputmode="decimal"
        pattern="^-?[0-9]*[.,]?[0-9]*$"
         enterkeyhint="enter"
          :color="row.return ? 'red' : undefined"
        @keyup.enter="addNewRow(index)"
        @keyup.tab.prevent="addNewRow(index)"
      />
    </div>

<!-- Row 2: Category | Qty | Unit | Tax -->
    <div :class="showUnitColumn ? 'grid grid-cols-4 gap-2 z-10' : 'grid grid-cols-3 gap-2 z-10'">
      <USelectMenu
        v-model="row.category"
        :options="categories"
        option-attribute="name"
         :color="row.return ? 'red' : undefined"
        @update:modelValue="() => handleCategoryChange(row.category, index)"
        track-by="id"
        multiple
        searchable
        placeholder="Category"
      >
        <template #label>
          <span v-if="row.category.length">{{ row.category.map(c => c.name).join(', ') }}</span>
          <span v-else class="text-gray-400">Category</span>
        </template>
      </USelectMenu>
      <UInput
        v-model="row.qty"
        placeholder="Qty"
        ref="qtyInputs" 
        type="number"
        size="sm"
         :color="row.return ? 'red' : undefined"
         enterkeyhint="enter"
       @keyup.enter="moveFocus(index, 'qty', 'right')"
       @keyup.tab.prevent="moveFocus(index, 'qty', 'right')"
      />
      <div v-if="showUnitColumn" class="flex items-center px-2 text-sm text-gray-500 dark:text-gray-400">
        {{ row.unit || 'Nos' }}
      </div>
     
      <UInput
        v-model="row.tax"
        ref="taxInputs"
        placeholder="Tax"
        type="number"
        size="sm"
         enterkeyhint="enter"
          :color="row.return ? 'red' : undefined"
       @keyup.enter="addNewRow(index)"
       @keyup.tab.prevent="addNewRow(index)"
      />
    </div>
  </div>
</div>

         <!-- pc view -->
        <div v-else class="billing-table-scroll p-3 hidden lg:block relative">
          <table class="divide-y divide-gray-50 dark:divide-gray-800 w-full" ref="resizableTable">
            <thead class="">
              <tr>
                <th
                  v-for="(column, index) in columns"
                  :key="column.key"
                  class="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative"
                >
                  {{ column.label }}
                  <!-- Draggable divider -->
                  <div
                    v-if="index < columns.length - 1"
                    class="absolute right-0 top-0 bottom-0 b-w cursor-col-resize dark:bg-gray-800 hover:bg-blue-300"
                    @mousedown="startResize(index, $event)"
                  ></div>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
  <tr v-for="(row, index) in items" :key="row.sn">
    <td class="py-1 whitespace-nowrap" :class="{ 'text-red-600': row.return }">
      {{ row.sn }}
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput
        v-model="row.barcode"
        ref="barcodeInputs"
        enterkeyhint="enter"
        size="sm"
        :loading="loadingStates[index] || false"
         :color="row.return ? 'red' : undefined"
        @focus="selectAllText(index)"
        @keydown.delete="removeRow($event, index)"
        @keydown.enter.prevent="handleEnterBarcode(row.barcode, index)"
        @keydown.up.prevent="moveFocus(index, 'barcode', 'up')"
        @keydown.down.prevent="moveFocus(index, 'barcode', 'down')"
        @keydown.left.prevent="moveFocus(index, 'barcode', 'left')"
        @keydown.right.prevent="moveFocus(index, 'barcode', 'right')"
      />
    </td>
    <td class="py-1 whitespace-nowrap"  ref="categoryInputs">
      <USelectMenu  
        v-model="row.category" 
        @update:modelValue="() => handleCategoryChange(row.category, index)"
        :options="categories" 
        option-attribute="name"  
        option-key="id" 
        track-by="id"
        multiple 
        searchable
        searchable-placeholder="Search a Category..."
         :color="row.return ? 'red' : undefined"
        @keydown.up.prevent="moveFocus(index, 'category', 'up')"
        @keydown.down.prevent="moveFocus(index, 'category', 'down')"
        @keydown.left.prevent="movecatgeory(index)"
        @keydown.right.prevent="movecatgeory(index)"
        @keydown.enter.prevent="movecatgeory(index)"
      >
        <template #label>
          <span v-if="row.category.length" class="truncate">
            {{ row.category.map(item => item.name).join(', ') }}
          </span>
          <span v-else>Select Category</span>
        </template>
        <template  #option="{ option: category }">
          <span class="truncate">{{ category.name }}</span>
        </template>
      </USelectMenu>
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput 
        v-model="row.name" 
        ref="nameInputs"
        size="sm"  
         :color="row.return ? 'red' : undefined"
        @keydown.enter="moveFocus(index, 'name', 'right')"
        @keydown.up.prevent="moveFocus(index, 'name', 'up')"
        @keydown.down.prevent="moveFocus(index, 'name', 'down')"
        @keydown.left.prevent="moveFocus(index, 'name', 'left')"
        @keydown.right.prevent="moveFocus(index, 'name', 'right')"
      />
    </td>
<td class="py-1 whitespace-nowrap">
      <UInput 
        v-model="row.rate" 
        type="number" 
        ref="rateInputs"
        size="sm"  
         :color="row.return ? 'red' : undefined"
        @keydown.enter="moveFocus(index, 'rate', 'right')"
        @keydown.up.prevent="moveFocus(index, 'rate', 'up')"
        @keydown.down.prevent="moveFocus(index, 'rate', 'down')"
        @keydown.left.prevent="moveFocus(index, 'rate', 'left')"
        @keydown.right.prevent="moveFocus(index, 'rate', 'right')"
      />
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput 
        v-model="row.qty"  
        ref="qtyInputs" 
        type="number" 
        size="sm"  
         :color="row.return ? 'red' : undefined"
         @keydown.enter="moveFocus(index, 'qty', 'right')"
        @keydown.up.prevent="moveFocus(index, 'qty', 'up')"
        @keydown.down.prevent="moveFocus(index, 'qty', 'down')"
        @keydown.left.prevent="moveFocus(index, 'qty', 'left')"
        @keydown.right.prevent="moveFocus(index, 'qty', 'right')"
      />
    </td>
    <td v-if="showUnitColumn" class="py-1 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
      {{ row.unit || 'Nos' }}
    </td>
   <td class="py-1 whitespace-nowrap">
    <UInput 
      v-model="row.discount" 
      type="number"
      ref="discountInputs" 
      size="sm"  
       :color="row.return ? 'red' : undefined"
      @keydown.enter="handleDiscountEnter(index)"
      @keydown.up.prevent="moveFocus(index, 'discount', 'up')"
      @keydown.down.prevent="moveFocus(index, 'discount', 'down')"
      @keydown.left.prevent="moveFocus(index, 'discount', 'left')"
      @keydown.right.prevent="moveFocus(index, 'discount', 'right')"
    />
  </td>

    <td class="py-1 whitespace-nowrap" v-if="isUserTrackIncluded">
      <UInput 
        v-model="row.user" 
        type="text"
        ref="userInputs" 
        enterkeyhint="enter"
        size="sm"  
         :color="row.return ? 'red' : undefined"
        @keydown.enter="addNewRow(index); updateUserDetails(index,Number(row.user))"
        @keydown.up.prevent="moveFocus(index, 'user', 'up')"
        @keydown.down.prevent="moveFocus(index, 'user', 'down')"
        @keydown.left.prevent="moveFocus(index, 'user', 'left')"
        @keydown.right.prevent="moveFocus(index, 'user', 'right')"
      />
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput 
        v-model="row.tax" 
          ref="taxInputs"
          enterkeyhint="enter"
        type="number" 
        size="sm" 
         :color="row.return ? 'red' : undefined"
        @keydown.enter="addNewRow(index)"
        @keydown.up.prevent="moveFocus(index, 'tax', 'up')"
        @keydown.down.prevent="moveFocus(index, 'tax', 'down')"
        @keydown.left.prevent="moveFocus(index, 'tax', 'left')"
        @keydown.right.prevent="moveFocus(index, 'tax', 'right')"
      />
    </td>
    <td v-if="((useAuth().session.value?.role === 'admin') && useAuth().session.value?.isCostIncluded === true)" class="py-1 ps-2 whitespace-nowrap"  :class="{ 'text-red-600': row.return }">
      {{ row.cost }}
    </td>
    <td class="py-1 ps-2 whitespace-nowrap"  :class="{ 'text-red-600': row.return }">
      {{ row.value }}
    </td>
    <td class="py-1 whitespace-nowrap text-right">
      <BillingSerialNumbers v-if="afterSalesEnabled" :item="row" :covered="serialRegistration.isCovered(row)" :owned="serialRegistration.owned.value" v-model:returned-unit-ids="returnedServiceUnitIds" :disabled="isSaving" @details="details => serialRegistration.setDetails(row, details)" />
      <UButton
        icon="i-heroicons-trash"
        color="red"
        variant="ghost"
        size="xs"
        square
        title="Delete row"
        aria-label="Delete row"
        @click="deleteRowByIndex(index)"
      />
    </td>
  </tr>
</tbody>


          </table>
          
        </div>

         

  <template #footer>
    <div class="billing-footer-bar  w-full flex justify-between  px-3 py-2">
        <div>
           Qty: {{ tQty }}
        </div>
        <div v-if="isInvoiceMode" class="billing-invoice-subject">
          <label for="invoice-subject" class="text-gray-700 font-medium">Subject</label>
          <UInput id="invoice-subject" v-model="invoiceReference" placeholder="Let your customer know what this invoice is for" maxlength="500" :disabled="isSaving" aria-label="Invoice subject" />
        </div>

</div>
        <!-- Other form elements -->
         <div v-if="!isMobile" class="billing-summary hidden lg:grid text-sm px-3 py-3">
<div>
<div class="billing-summary-total border border-primary-700 dark:border-primary-300 rounded-md mb-7">
  <div class="flex flex-col items-center justify-center py-3">
    <div class="text-s">Subtotal</div>
    <div class="text-primary-700 dark:text-primary-300 font-bold text-3xl leading-none">₹{{ subtotal.toFixed(2) }}</div>
  </div>
</div>
<BillingDiscountAdjustment ref="discountref" v-model:discount="discount" v-model:adjustment="adjustment" :disabled="isSaving" @enter="handleEnterMainDiscount()" />
<div class="billing-primary-action flex">

    <!-- Save -->
    <UButton
      :loading="isSaving"
      :icon="billSaveActionIcon(selectedAction)"
      ref="saveref" :title="(isInvoiceMode ? 'Create invoice' : 'Save') + (selectedAction ? ' & ' + selectedAction : '')"
      color="green"
      class="flex-1 rounded-r-none"
      block
      @keydown.enter.prevent="handleSave"
      @click="handleSave"
    >
      {{ isInvoiceMode ? 'Create invoice' : 'Save' }}
    </UButton>

    <!-- Dropdown -->
    <UDropdown :items="actionItems">
      <UButton
        color="green"
        class="rounded-l-none px-3"
        icon="i-heroicons-chevron-up"
      />
    </UDropdown>

  </div>
</div>
<div>
<div class="billing-summary-grand-total billing-summary-total border border-green-700 dark:border-green-300 rounded-md">
  <div class="flex flex-col items-center justify-center py-3">
    <div class="text-s">Total</div>
    <div class="text-green-700 dark:textgreen-300 font-bold text-3xl leading-none ">₹{{ grandTotal.toFixed(2) }}</div>
  </div>
</div>
<div v-if="!isInvoiceMode" class="mb-4">
              <label class="block text-gray-700 font-medium">Payment</label>
              <div class="w-full flex flex-row gap-2">
                <USelect
                  ref="paymentref"
                  v-model="paymentMethod"
                  :options="paymentOptions"
                  @keydown.enter.prevent="handleEnterPayment(index)"
                  class="flex-1"
                />
                <UButton
                  icon="i-heroicons-scissors"
                  size="sm"
                  color="primary"
                  square
                  variant="solid"
                  class="w-auto"
                  @click="handleSplit"
                />
              </div>
            </div>
<div v-else>
  <label for="invoice-payment-terms" class="block text-gray-700 font-medium">Payment terms</label>
  <BillingPaymentTerms id="invoice-payment-terms" v-model:terms="invoicePaymentTerms" v-model:due-date="dueDate" :invoice-date="dateInput" :disabled="isSaving" />
</div>
<div class="billing-row-action"><UButton icon="i-heroicons-trash" aria-label="Delete" title="Delete" block variant="solid" color="gray" class="w-full" disabled>Delete</UButton></div>
</div>
<div>
<div class="billing-summary-pair">
<div class="mb-4">
              <label class="block text-gray-700 font-medium">Return</label>
              <UInput v-model="returnAmt" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Redeemed</label>
              <UInput v-model = redeemedAmt  />
            </div>
</div>
<div v-if="!isInvoiceMode" class="billing-summary-account flex gap-2">
              <UInputMenu v-model="selected" placeholder="Account" aria-label="Account Name" :options="accounts" value-attribute="id" option-attribute="name">
                <template #option="{ option }">
                  <div
                    :class="option.kind === 'header'
                      ? 'px-1 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500'
                      : 'flex items-center justify-between gap-2'"
                  >
                    <span>{{ formatCreditPartyOption(option) }}</span>
                    <UBadge v-if="option.kind === 'user' && option.code" color="gray" variant="subtle" size="xs">{{ option.code }}</UBadge>
                  </div>
                </template>
              </UInputMenu>
            <UButton icon="i-heroicons-plus" aria-label="Add account" title="Add account" square @click="isOpen=true" />
</div>
<div v-else>
  <label for="invoice-due-date" class="block text-gray-700 font-medium">Due date <span class="text-red-500" aria-hidden="true">*</span></label>
  <UInput id="invoice-due-date" v-model="dueDate" type="date" :min="dateInput" :disabled="isSaving" required aria-label="Invoice due date" />
</div>
<div class="billing-row-action"><UButton icon="i-heroicons-arrow-uturn-left" aria-label="Sales Return" title="Sales Return" block variant="solid" class="w-full" @click="issalesReturnModelOpen = true">Return</UButton></div>
</div>
<div>
<div class="mb-4">
              <label class="block text-gray-700 font-medium">Coupon</label>
              <div class="flex gap-2">
                <USelectMenu
                  v-model="selectedCouponId"
                  :options="eligibleCoupons"
                  placeholder="Coupon"
                  class="flex-1"
                />
                <UButton
                  v-if="selectedCouponId"
                  icon="i-heroicons-x-mark"
                  color="red"
                  variant="soft"
                  @click="selectedCouponId = null"
                />
              </div>
            </div>
<div class="billing-summary-pair">
<div class="mb-4">
              <label class="block text-gray-700 font-medium">Eligible</label>
              <UInput :value="eligibleCoupons.length" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Value</label>
              <UInput v-model="couponValue" />
            </div>
</div>
<div class="billing-search-actions flex gap-2">
<UButton color="blue" block class="flex-1" aria-label="New bill" title="New bill" @click="handleCreateNewDraft" :disabled="!canCreateDraft">New</UButton>
<UButton block class="flex-1" aria-label="Product search" title="Product search" @click="isProductSearchOpen = true">Search</UButton>
</div>
</div>
<div>
<div class="mb-4">
              <label class="block text-gray-700 font-medium">Phone</label>
              <div class="billing-client-input-row flex items-center gap-2">
<div class="relative flex-1 min-w-0">
                <UInput
                  ref="phoneInputs"
                  v-model="phoneNo"
                  :loading="isClientLoading"
                  icon="i-heroicons-magnifying-glass-20-solid"
                  @focus="openClientSuggestions"
                  @input="openClientSuggestions"
                  @keydown.enter.prevent="handleClientSearchEnter"
                />
                <div
                  v-if="showClientSuggestions && phoneNo"
                  class="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
                >
                  <button
                    v-for="client in clientMatches"
                    :key="client.id"
                    type="button"
                    class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                    @mousedown.prevent="handleClientSuggestionSelect(client)"
                  >
                    <span>{{ client.name }}</span>
                    <span class="text-xs text-gray-500">{{ client.phone }}</span>
                  </button>
                <div
                  v-if="isClientLoading && !clientMatches.length"
                  class="px-3 py-2 text-xs text-gray-500"
                >
                  Searching company clients...
                </div>
                <div
                  v-if="!isClientLoading && !clientMatches.length"
                  class="px-3 py-2 text-xs text-gray-500"
                >
                    No matching company client. Press Enter to create a new client.
                  </div>
                </div>
              </div>
<UButton class="flex-shrink-0" icon="i-heroicons-user-plus" size="sm" variant="solid" square aria-label="Add client" title="Add client" @click="isClientAddModelOpen = true" />
</div>
            </div>
<div class="billing-summary-pair billing-summary-client-details">
<div class="mb-4">
              <label class="block text-gray-700 font-medium">Name</label>
              <UInput v-model="clientName" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Points</label>
              <UInput v-model="points" />
            </div>
</div>
<div class="billing-summary-actions flex gap-2 mt-9">
              <UButton v-if="!isRedeemPoint" color="green" class="flex-1" block @click="handleRedeemPoints" :loading="redeeming">Redeem</UButton>
              <UButton v-else-if="isRedeemPoint" color="red" class="flex-1" block @click="handleRedeemPoints" :loading="redeeming">Undo</UButton>
              <UButton v-if="!skipPoints" color="red" class="flex-1" block @click="skipPoints = true">Skip</UButton>
              <UButton v-else color="green" class="flex-1" block @click="skipPoints = false">Include</UButton>
            </div>
</div>
</div>


        <!-- mobile view -->
        <div  v-if="isMobile" class="lg:hidden flex flex-col gap-3 py-3 text-sm px-2" >
        <BillingDiscountAdjustment ref="discountref" v-model:discount="discount" v-model:adjustment="adjustment" :disabled="isSaving" @enter="handleEnterMainDiscount()" />

        <div v-if="!isInvoiceMode" class="">
          <label class="block text-gray-700 font-medium">Payment Method</label>
          <div class="w-full flex flex-row gap-2">
            <USelect
            ref="paymentref"
            v-model="paymentMethod"
            :options="paymentOptions"
            @keydown.enter.prevent="handleEnterPayment(index)"
            class="flex-1"
            />
            <UButton
            icon="i-heroicons-scissors"
            size="sm"
            color="primary"
            square
            variant="solid"
            class="w-auto"
            @click="handleSplit"
            />
          </div>    
        </div>    

        <div class="">
          <label class="block text-gray-700 font-medium">Sales Return AMT</label>
          <UInput v-model="returnAmt" />
        </div>

     <div class="flex flex-row gap-2 w-full">
  <div class="flex-1">
    <label class="block text-gray-700 font-medium">Cell No.</label>
    <div class="relative">
      <UInput
        v-model="phoneNo"
        :loading="isClientLoading"
        icon="i-heroicons-magnifying-glass-20-solid"
        @focus="openClientSuggestions"
        @input="openClientSuggestions"
        @keydown.enter.prevent="handleClientSearchEnter"
      />
      <div
        v-if="showClientSuggestions && phoneNo"
        class="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
      >
        <button
          v-for="client in clientMatches"
          :key="client.id"
          type="button"
          class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          @mousedown.prevent="handleClientSuggestionSelect(client)"
        >
          <span>{{ client.name }}</span>
          <span class="text-xs text-gray-500">{{ client.phone }}</span>
        </button>
        <div
          v-if="isClientLoading && !clientMatches.length"
          class="px-3 py-2 text-xs text-gray-500"
        >
          Searching company clients...
        </div>
        <div
          v-if="!isClientLoading && !clientMatches.length"
          class="px-3 py-2 text-xs text-gray-500"
        >
          No matching company client. Press Enter to create a new client.
        </div>
      </div>
    </div>
  </div>
  <div class="flex-1">
    <label class="block text-gray-700 font-medium">Name</label>
    <UInput v-model="clientName" />
  </div>
</div>


        <div class="">
          <div class="w-full flex flex-row gap-2">
            <UInputMenu v-if="!isInvoiceMode" class="flex-1" v-model="selected" placeholder="Account Name" aria-label="Account Name" :options="accounts" value-attribute="id" option-attribute="name">
              <template #option="{ option }">
                <div
                  :class="option.kind === 'header'
                    ? 'px-1 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500'
                    : 'flex items-center justify-between gap-2'"
                >
                  <span>{{ formatCreditPartyOption(option) }}</span>
                  <UBadge v-if="option.kind === 'user' && option.code" color="gray" variant="subtle" size="xs">{{ option.code }}</UBadge>
                </div>
              </template>
            </UInputMenu>
            <UButton
            icon="i-heroicons-plus"
            size="sm"
            color="primary"
            square
            variant="solid"
            class="w-auto"
            v-if="!isInvoiceMode" @click="isOpen=true"
            />
          </div>
        </div>


        </div>



          <div v-if="isMobile" class="w-full flex flex-wrap gap-4  px-3 py-3 lg:hidden">
          <UButton color="blue" class="flex-1" block :disabled="!canCreateDraft" @click="handleCreateNewDraft" >New</UButton>
          <div class="flex flex-1">
            <UButton :loading="isSaving" :icon="billSaveActionIcon(selectedAction)" ref="saveref" color="green" class="flex-1" :class="{ 'rounded-r-none': isInvoiceMode }" block @click="handleSave">{{ isInvoiceMode ? 'Create invoice' : 'Save' }}</UButton>
            <UDropdown v-if="isInvoiceMode" :items="actionItems">
              <UButton color="green" class="rounded-l-none px-3" icon="i-heroicons-chevron-up" aria-label="Invoice receipt action" />
            </UDropdown>
          </div>
          <UButton  class="flex-1" @click="issalesReturnModelOpen = true" block>Return</UButton>
        </div>
        </template>
      </UCard>
  </UDashboardPanelContent>

  <BillingAccountModal v-model="isOpen" @account-created="getAccounts" />
  <BillingNotesModal v-model="isNotesOpen" v-model:notes="customerNotes" v-model:terms-and-conditions="termsAndConditions" :disabled="isSaving" />


     
<!-- sales return -->
<BillingSalesReturn
  v-model="issalesReturnModelOpen"
  @totalreturnvalue="handleReturnData"
/>
<BillingAddClient
  v-model:model="isClientAddModelOpen"
  v-model:phoneNo="phoneNo"
  :onVerify="handleEnterPhone"
  :clientAdded="handleClientAdded"
/>

<BillingProductSearch
  :open="isProductSearchOpen"
  @done="handleProductSelected"
  @close="isProductSearchOpen = false"
/>

<!-- split payment modal -->
<BillingSplitModal
  v-model="showSplitModal"
  v-model:tempSplits="tempSplits"
  :grand-total="grandTotal"
  :payment-options-in-split="paymentOptionsInsplit"
  @confirmed="onSplitConfirmed"
/>


    <UDashboardModal
        v-model="printModel"
        title="Invoice Actions"
        description="Choose an action to perform on the invoice."
        icon="i-heroicons-exclamation-circle"
        prevent-close
        :close-button="null"
        :ui="{
            icon: {
                base: 'text-red-500 dark:text-red-400',
            },
            footer: {
                base: 'ml-16',
            },
        }"
    >
        <template #footer>
            <UButton
                color="green"
                label="Print"
                :disabled = "!printModel"
                @click="print"
            />
        <UButton
                color="primary"
                label="Send"
                :disabled = "!printModel"
                @click="send"
            /> 
            <UButton
                color="blue"
                label="Download"
                :disabled = "!printModel"
                @click="download"
            />
            <UButton color="red" label="Cancel" @click="printModel = false" />
        </template>
    </UDashboardModal>

</template>


<style scoped>
.relative {
  position: relative;
}

.cursor-col-resize {
  cursor: col-resize;
}

.hover\:bg-blue-300:hover {
  background-color: #93c5fd;
}

.b-w{
  width:1px;
}
</style>
