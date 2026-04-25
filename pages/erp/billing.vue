<script setup>
import { BillingAddClient } from '#components';
import { v4 as uuidv4 } from 'uuid';
import { Capacitor } from '@capacitor/core';

const uuid = ref('')

const { printBill } = usePrint();
const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const isTaxIncluded = ref(useAuth().session.value?.isTaxIncluded);
const isUserTrackIncluded = ref(useAuth().session.value?.isUserTrackIncluded);
const paymentOptionsInsplit = ['Cash', 'UPI', 'Card','Credit']
const paymentOptions = ref(['Cash', 'UPI', 'Card','Credit'])

// ─── Draft / bill state ────────────────────────────────────────────────────
const {
  billNo, date, parentUserCode, parentUserId, parentUserName,
  discount, redeemedAmt, redeemedPoints, paymentMethod,
  phoneNo, points, clientName, clientId, couponValue,
  splitPayments, isRedeemPoint, selected, tempSplits, items,
  draftBills, selectedDraft,
  currentBill, returnAmt, subtotal, grandTotal, tQty, dateOnly,
  createNewBill, loadDraftBills, loadBill, deleteBill, resetDraft,
  LOCAL_BILLS_KEY,
} = useBillingDraft()

const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref({})
const isProductSearchOpen = ref(false);

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


const showSplitModal = ref(false)
const isOpen = ref(false)
const issalesReturnModelOpen = ref(false);
const isClientAddModelOpen = ref(false);


const handleKeydown = async (e) => {

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
const { isClientLoading, redeeming, handleEnterPhone, handleClientAdded, handleRedeemPoints } =
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

// Table column definitions — drives the <thead> via v-for
const columns = computed(() => {
  const cols = [
    { key: 'sn', label: 'SN' },
    { key: 'barcode', label: 'Barcode' },
    { key: 'category', label: 'Category' },
    { key: 'name', label: 'Name' },
    { key: 'rate', label: 'Rate' },
    { key: 'qty', label: 'Qty' },
    { key: 'discount', label: 'Discount' },
  ]
  if (isUserTrackIncluded.value) cols.push({ key: 'user', label: 'User' })
  cols.push({ key: 'tax', label: 'Tax' })
  if (useAuth().session.value?.role === 'admin' && useAuth().session.value?.isCostIncluded === true) {
    cols.push({ key: 'cost', label: 'Cost' })
  }
  cols.push({ key: 'value', label: 'Value' })
  return cols
})

let isResizing = false;
let startX = 0;
let startWidth = 0;
let columnIndex = 0;

watch(selected, (newSelected) => {
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
      const categorystore = categoryStore.getCategoryByShortCut(barcode)
      items.value[index].category = categories.value.filter(category =>category.id === categorystore.id)
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

const actionItems = [
  [
    { label: 'Print', click: () => selectAction('print') },
    { label: 'Send', click: () => selectAction('send') },
    { label: 'Download', click: () => selectAction('download') },
    { label: 'None', click: () => selectAction(null) }
  ]
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
        description: err.message,
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
        description: err.message,
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
      await $fetch('/api/whatsapp/send-payment-template', {
        method: 'POST',
        body: {
          phone: printData.clientPhone,
          name: printData.clientName,
          billName: printData.companyName,
          amount: printData.grandTotal,
          paymentDate: printData.date,
          receiptId: uuid.value,
        },
      })
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
        description: err.message,
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
    if (Number.isNaN(qty)) throw new Error(`Row ${n}: qty is not a valid number`)
    if (!item.return && qty <= 0) throw new Error(`Row ${n}: qty must be greater than 0`)
    const rate = Number(item.rate ?? 0)
    if (Number.isNaN(rate)) throw new Error(`Row ${n}: rate is not a valid number`)
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
  if (Number.isNaN(total)) throw new Error('Grand total is invalid. Check discount values.')


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

function buildBillPayload({ billInv, session, entriesData, billPoints, hasCreditPayment, refs }) {
  const { subtotal, discount, grandTotal, returnAmt, couponValue, paymentMethod,
          redeemedPoints, clientId, selected, splitPayments, date } = refs
  return {
    invoiceNumber: billInv,
    subtotal: Number(subtotal.value) || 0,
    discount: String(discount.value ?? '').startsWith('+') ? 0 : (Number(discount.value) || 0),
    grandTotal: Number(grandTotal.value) || 0,
    returnAmt: Number(returnAmt.value) || 0,
    couponValue: Number(couponValue.value) || 0,
    paymentMethod: paymentMethod.value || 'Cash',
    ...(redeemedPoints.value ? { redeemedPoints: Number(redeemedPoints.value) || 0 } : {}),
    ...(clientId.value ? { billPoints: Number(billPoints) } : { billPoints: 0 }),
    createdAt: new Date(date.value).toISOString(),
    paymentStatus: hasCreditPayment ? 'PENDING' : 'PAID',
    type: 'BILL',
    entries: { create: entriesData },
    company: { connect: { id: session.companyId } },
    companyUser: { connect: { companyId_userId: { companyId: session.companyId, userId: session.id } } },
    ...(clientId.value && { client: { connect: { id: clientId.value } } }),
    ...(selected.value && { account: { connect: { id: selected.value } } }),
    ...(paymentMethod.value === 'Split' && { splitPayments: splitPayments.value }),
  }
}

function buildPrintData({ billInv, session, finalitems, refs }) {
  const { subtotal, discount, grandTotal, paymentMethod, splitPayments,
          clientName, phoneNo, date, points, redeemedPoints, couponValue } = refs
  return {
    invoiceNumber: billInv,
    phone: session?.companyPhone,
    description: session?.description,
    thankYouNote: session?.thankYouNote,
    refundPolicy: session?.refundPolicy,
    returnPolicy: session?.returnPolicy,
    date: new Date(date.value).toISOString(),
    entries: finalitems.map((entry) => {
      const discountVal = Number(entry.discount) < 0
        ? Number(entry.discount)
        : Number(entry.discount) > 0
        ? `${Number(entry.discount)}%`
        : 0
      return {
        description: entry.barcode ? entry.name : entry.category[0].name,
        hsn: entry.category[0].hsn,
        qty: Number(entry.qty || 1),
        mrp: Number(entry.rate || 0),
        discount: discountVal,
        tax: Number(entry.tax || 0),
        value: Number(entry.qty || 1) * Number(entry.rate || 0),
        size: entry.size || '',
        barcode: entry.barcode,
        tvalue: Number(entry.value || 0),
      }
    }),
    subtotal: Number(subtotal.value) || 0,
    discount: String(discount.value ?? ''),
    grandTotal: Number(grandTotal.value) || 0,
    paymentMethod: paymentMethod.value,
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
    tqty: finalitems.reduce((sum, e) => sum + Number(e.qty || 1), 0),
    tvalue: finalitems.reduce((sum, e) => sum + Number(e.qty || 1) * Number(e.rate || 0), 0),
    ttvalue: finalitems.reduce((sum, e) => sum + Number(e.value || 0), 0),
    tdiscount: finalitems.reduce((sum, e) => {
      const qty = Number(e.qty || 1)
      const rate = Number(e.rate || 0)
      const d = Number(e.discount || 0)
      return sum + (d < 0 ? Math.abs(d) * qty : ((rate * d) / 100) * qty)
    }, 0),
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

const handleSave = async () => {
  if (isSaving.value) return

  isSaving.value = true
  try {
    if (process.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('No internet connection')
    }
    await nextTick()

    const session = useAuth().session.value

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

    uuid.value = uuidv4()
    const companyId = session?.companyId
    const userId = session?.id

    const finalitems = validateBillEntries(items.value)
    // Reserve invoice number atomically before save so printData is ready immediately
    const billInv = await $fetch('/api/bill/findBillCounter', { method: 'POST', body: { companyId, userId } })

    await ensureClientExists()

    const billPoints = skipPoints.value ? 0 : computeBillPoints(session, grandTotal.value)
    const returnedItems = finalitems.filter((i) => i.return)
    const entriesData = buildEntriesData(finalitems, companyId)
    const hasCreditPayment =
      paymentMethod.value === 'Credit' ||
      (paymentMethod.value === 'Split' && splitPayments.value.some((p) => p?.method === 'Credit'))

    const draftRefs = { subtotal, discount, grandTotal, returnAmt, couponValue, paymentMethod,
                        redeemedPoints, clientId, selected, splitPayments, date, clientName, phoneNo, points }

    const payload = buildBillPayload({ billInv, session, entriesData, billPoints, hasCreditPayment, refs: draftRefs })
    printData = buildPrintData({ billInv, session, finalitems, refs: draftRefs })

    const result = await $fetch('/api/bill/create', {
      method: 'POST',
      body: { uuid: uuid.value, payload, items: finalitems, returnedItems, billPoints,
              clientId: clientId.value, companyId, couponId: selectedCouponId.value?.value || null, userId },
    })
    printData.generatedCoupons = result?.generatedCoupons || []
    fireFcmNotification(companyId, billInv, grandTotal.value, session)

    if (selectedAction.value === 'print') await print()
    else if (selectedAction.value === 'send') await send()
    else if (selectedAction.value === 'download') await download()

    toast.add({ title: 'Bill created successfully!', color: 'green' })
    reset()
  } catch (error) {
    console.error('Error creating bill', error)
    toast.add({ title: 'Bill creation failed!', description: error?.message || 'Unknown error', color: 'red' })
  } finally {
    isSaving.value = false
  }
}



const accounts = ref([])


const getAccounts = async () => {
  try {
    const companyId = useAuth().session.value?.companyId
    if (!companyId) {
      console.warn('companyId not ready yet, skipping fetch')
      return
    }

    const data = await $fetch('/api/bill/findManyAccount', {
      method: 'GET',
      query: { companyId },
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
  const baseFieldOrder = ['barcode', 'category', 'name', 'rate', 'qty', 'discount', 'tax'];
  const fieldOrder = isUserTrackIncluded ? [...baseFieldOrder.slice(0, 6), 'user', 'tax'] : baseFieldOrder;

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





</script>


<template>
  <UDashboardPanelContent class="p-1">
      <UCard 
    :ui="{
      base: 'h-full flex flex-col',
      rounded: '',
      ring: 'ring-0 lg:ring-1 lg:ring-gray-200 lg:dark:ring-gray-800', // force no ring on mobile
      divide: 'divide-y divide-gray-200 dark:divide-gray-700',
      body: {
        padding: '',
        base: 'lg:flex-1 lg:min-h-40 lg:flex lg:flex-col lg:overflow-hidden grow divide-y divide-gray-200 dark:divide-gray-700 z-10'
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
          <UButton color="blue" class="flex-1" block @click="createNewBill" >New</UButton>
          <UButton  :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleSave">Save</UButton>
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
     
         <div class="lg:hidden col-span-2 flex flex-row gap-2 py-2 px-2">
            <UInput v-model="dateOnly" type="date" label="Date" class="flex-1" />
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
        
       <div class="lg:grid grid-cols-1 lg:grid-cols-12 gap-4 text-sm hidden py-2 px-2">
          <UInput v-model="dateOnly" type="date" label="Date" class="lg:col-span-2" />
          <UInput
            v-if="isUserTrackIncluded"
            v-model="parentUserCode"
            type="number"
            label="User Code"
            placeholder="Enter user code"
            class="lg:col-span-2"
            @keydown.enter.prevent="updateParentUserDetails(parentUserCode)"
            @blur="updateParentUserDetails(parentUserCode)"
          />
  
  <!-- Draft Selector + Reset -->
<div
  :class="[
    Capacitor.isNativePlatform()
      ? 'lg:col-start-8 lg:col-span-3'
      : 'lg:col-start-10 lg:col-span-3',
    'flex flex-row items-center gap-2'
  ]"
>

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

    <UButton
      color="primary"
      icon="i-heroicons-arrow-path"
      class="flex-shrink-0"
      @click="reset"
    />
    <UButton
      color="primary"
      icon="i-heroicons-plus"
      class="flex-shrink-0"
      @click="addNewRow(0,false)"
    />
  </div>
   <UButton  v-if="Capacitor.isNativePlatform()" color="primary" icon="i-heroicons-camera" label="Scan" block class="lg:col-start-11 lg:col-span-2" @click="handleScan"/>
  
</div>


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

    <!-- Row 2: Category | Rate | Tax -->
    <div class="grid grid-cols-3 gap-2 z-10 ">
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
        <div v-else class="overflow-x-auto p-3 hidden lg:block pb-24 h-full relative">    
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
    <td class="py-1 whitespace-nowrap" :class="{ 'text-red-600': row.return }" @click="(event) => {
      isDeleteModalOpen = true;
      deletingRowIdentity = { index, event };}">
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
  </tr>
</tbody>


          </table>
          
        </div>

         

  <template #footer>
    <div class=" w-full flex justify-between  px-3 py-2">
        <div>
           Qty: {{ tQty }}
        </div>
  
      </div>
        <!-- Other form elements -->
         <div v-if="!isMobile" class="lg:grid hidden grid-cols-1  lg:grid-cols-4 gap-4 text-sm px-3 py-3">

          <div class="">

        <!-- Discount Input -->
        <div class="mb-6">
          <label class="block text-gray-700 font-medium">Dis % (+) / Round Off (-) / Add (+n)</label>
          <UInput
            ref="discountref"
            type="text"
            inputmode="decimal"
            v-model="discount"
            @keydown.enter.prevent="handleEnterMainDiscount()"
            placeholder="e.g. 10, -5, +50"
          />
        </div>

  <!-- Subtotal Display -->
  <div class="border border-primary-700 dark:border-primary-300 rounded-md mb-7">
  <div class="flex flex-col items-center justify-center py-3">
    <div class="text-s">Sub Total</div>
    <div class="text-primary-700 dark:text-primary-300 font-bold text-3xl leading-none">₹{{ subtotal.toFixed(2) }}</div>
  </div>
</div>
    

  <!-- Grand Total Display -->
   <div class="border border-green-700 dark:border-green-300 rounded-md">
  <div class="flex flex-col items-center justify-center py-3">
    <div class="text-s">Grand Total</div>
    <div class="text-green-700 dark:textgreen-300 font-bold text-3xl leading-none ">₹{{ grandTotal.toFixed(2) }}</div>
  </div>
</div>

</div>

          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Sales Return AMT</label>
              <UInput v-model="returnAmt" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Total Redeemed AMT</label>
              <UInput v-model = redeemedAmt  />
            </div>
             <div class="mb-4">
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


            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Account Name</label>
              <UInputMenu v-model="selected" :options="accounts" value-attribute="id" option-attribute="name"/>
            </div>    
          </div>

          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Apply Coupon</label>
              <div class="flex gap-2">
                <USelectMenu
                  v-model="selectedCouponId"
                  :options="eligibleCoupons"
                  placeholder="Select a coupon"
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
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Eligible Coupons</label>
              <UInput :value="eligibleCoupons.length" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Total Value</label>
              <UInput v-model="couponValue" />
            </div>
            <div class="mt-9">
              <UButton color="primary" block @click="isOpen=true">Add Account</UButton>
            </div>
          </div>
          
          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Cell No.</label>
              <UInput ref="phoneInputs" v-model="phoneNo" :loading="isClientLoading" icon="i-heroicons-magnifying-glass-20-solid" @keydown.enter.prevent="handleEnterPhone"/>
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Name</label>
              <UInput v-model="clientName" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Points</label>
              <UInput v-model="points" />
            </div>
            <div class="flex gap-2 mt-9">
              <UButton v-if="!isRedeemPoint" color="green" class="flex-1" block @click="handleRedeemPoints" :loading="redeeming">Redeem</UButton>
              <UButton v-else-if="isRedeemPoint" color="red" class="flex-1" block @click="handleRedeemPoints" :loading="redeeming">Cancel Redeem</UButton>
              <UButton v-if="!skipPoints" color="red" class="flex-1" block @click="skipPoints = true">Skip Points</UButton>
              <UButton v-else color="green" class="flex-1" block @click="skipPoints = false">Assign Points</UButton>
            </div>
          </div>
        </div>

        <!-- mobile view -->
        <div  v-if="isMobile" class="lg:hidden flex flex-col gap-3 py-3 text-sm px-2" >
        <div class="">
          <label class="block text-gray-700 font-medium">Dis % (+) / Round Off (-) / Add (+n)</label>
          <UInput
          ref="discountref"
          type="text"
          v-model="discount"
          inputmode="text"
          @keydown.enter.prevent="handleEnterMainDiscount()"
          placeholder="e.g. 10, -5, +50"
          pattern="^[+\-]?[0-9]*[.,]?[0-9]*$"
          />
        </div>

        <div class="">
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
    <UInput
      v-model="phoneNo"
      :loading="isClientLoading"
      icon="i-heroicons-magnifying-glass-20-solid"
      @keydown.enter.prevent="handleEnterPhone"
    />
  </div>
  <div class="flex-1">
    <label class="block text-gray-700 font-medium">Name</label>
    <UInput v-model="clientName" />
  </div>
</div>


        <div class="">
          <label class="block text-gray-700 font-medium">Account Name</label>
          <div class="w-full flex flex-row gap-2">
            <UInputMenu class="flex-1" v-model="selected" :options="accounts" value-attribute="id" option-attribute="name"/>
            <UButton
            icon="i-heroicons-plus"
            size="sm"
            color="primary"
            square
            variant="solid"
            class="w-auto"
            @click="isOpen=true"
            />
          </div>
        </div>


        </div>

       <div v-else class="w-full gap-4 px-3 py-3 hidden lg:flex items-center">
  
  <UButton color="blue" class="flex-1" block @click="createNewBill">
    New
  </UButton>

  <!-- ✅ Split Button Wrapper -->
  <div class="flex-1 flex">
    
    <!-- Save -->
    <UButton
      :loading="isSaving"
      ref="saveref"
      color="green"
      class="flex-1 rounded-r-none"
      block
      @keydown.enter.prevent="handleSave"
      @click="handleSave"
    >
      Save{{ selectedAction ? ' & ' + selectedAction : '' }}
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

  <UButton color="gray" class="flex-1" block disabled>
    Delete
  </UButton>

  <UButton class="flex-1" block @click="isProductSearchOpen = true">
    Product Search
  </UButton>

  <UButton class="flex-1" block @click="issalesReturnModelOpen = true">
    Sales Return
  </UButton>

  <UButton class="flex-1" block @click="isClientAddModelOpen = true">
    Add Client
  </UButton>

</div>

          <div v-if="isMobile" class="w-full flex flex-wrap gap-4  px-3 py-3 lg:hidden">
          <UButton color="blue" class="flex-1" block @click="createNewBill" >New</UButton>
          <UButton  :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleSave">Save</UButton>
          <UButton  class="flex-1" @click="issalesReturnModelOpen = true" block>Return</UButton>
        </div>
        </template>
      </UCard>
  </UDashboardPanelContent>

  <BillingAccountModal v-model="isOpen" @account-created="getAccounts" />


     
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
  v-model="isProductSearchOpen"
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

     <UDashboardModal
        v-model="isDeleteModalOpen"
        title="Delete Entry"
        :description="`Are you sure you want to delete Entry No ${deletingRowIdentity.index}?`"
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
                color="red"
                label="Delete"
                @click="() => {removeRow( deletingRowIdentity.event,deletingRowIdentity.index);isDeleteModalOpen = false; }"
            />
            <UButton color="white" label="Cancel" @click="isDeleteModalOpen = false" />
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
