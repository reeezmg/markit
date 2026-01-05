<script setup>
import { BillingAddClient } from '#components';
import { useQueryClient } from '@tanstack/vue-query';
import Quagga from '@ericblade/quagga2'
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint
} from '@capacitor/barcode-scanner'
import { Capacitor } from '@capacitor/core';
const config = useRuntimeConfig();
const serverUrl = config.public.serverUrl
// import { generateThermalReceiptPDF } from '~/utils/thermal-receipt.client';
const isClientLoading = ref(false);
const isCouponLoading = ref(false)
const allCoupons = ref([])


const queryClient = useQueryClient();
const { generatableCoupons, loading:generatableCouponsLoading, error:generatableCouponsError, generateCoupons } = useGenerateCoupons()
const currentRequestIds = ref({});
const { printBill } = usePrint();
const redeeming = ref(false);
const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const router = useRouter();
const isTaxIncluded = ref(useAuth().session.value?.isTaxIncluded);
const isUserTrackIncluded = ref(useAuth().session.value?.isUserTrackIncluded);
const billNo = ref('1');
const loadingStates = ref([]);
const paymentOptionsInsplit = ['Cash', 'UPI', 'Card','Credit']
const paymentOptions = ref(['Cash', 'UPI', 'Card','Credit'])
const tempSplits = ref(
  Object.fromEntries(paymentOptionsInsplit.map(method => [method, { method, amount: null }]))
)

const date = ref(new Date().toISOString());
const discount = ref(0);
const redeemedAmt = ref(0);
const redeemedPoints = ref(0);
const paymentMethod = ref('Cash');
const phoneNo = ref('');
const points = ref(0);
const clientName = ref('');
const clientId = ref('');
const couponValue = ref(0);
const splitPayments = ref([])
const isRedeemPoint = ref(false);
const selected = ref(null);
const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref({})
const isProductSearchOpen = ref(false);

const account = ref({
    name: '',
    phone:'',
    street: '',
    locality: '',
    city: '',
    state: '',
    pincode: '',
});
const scannedBarcode = ref("");
const barcodeInputs = ref([]);
const categoryInputs = ref([]);
const nameInputs = ref([]);
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
const isOpen = ref(false);
const isSavingAcc = ref(false)
const issalesReturnModelOpen = ref(false);
const isClientAddModelOpen = ref(false);

const returnAmt = computed(() => {
  return items.value.reduce((sum, item) => {
    if (item.return) {
      const itemTotal = (item.qty || 1) * (item.rate || 0);
      return sum + itemTotal;
    }
    return sum;
  }, 0);
});


const subtotal = computed(() => {
  return items.value.reduce((sum, item) => {
    const itemTotal = (item.qty || 1) * (item.rate || 0);
    return item.return ? sum - itemTotal : sum + itemTotal;
  }, 0);
});

const grandTotal = computed(() => {
  const baseTotal = items.value.reduce((sum, item) => {
    const itemValue = item.value || 0;
    return item.return ? sum - itemValue : sum + itemValue;
  }, 0);

  let afterDiscount = 0;

  if (discount.value < 0) {
    afterDiscount = parseFloat((baseTotal - Math.abs(discount.value)).toFixed(2));
  } else {
    afterDiscount = parseFloat((baseTotal - (baseTotal * discount.value) / 100).toFixed(2));
  }

  return afterDiscount - redeemedAmt.value;
});


const dateOnly = computed({
  get: () => date.value.split('T')[0],
  set: val => {
    // Preserve original time, but update the date
    const original = new Date(date.value)
    const updated = new Date(val + 'T' + original.toISOString().split('T')[1])
    date.value = updated.toISOString()
  }
})

const items = ref([
  { id:'', variantId:'',name:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: null, discount: null, tax: null, value: 0,sizes:{}, totalQty:0 ,return:false, userCode:null, userId:null, user:null},
]);

const selectedDraft = ref(null);
const draftBills = ref([]);
const LOCAL_BILLS_KEY = 'bills';


const result = ref('')
const showCamera = ref(false)
const videoRef = ref(null)

const requestCameraAccess = async () => {
  try {
    await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { exact: 'environment' },
      },
    })
  } catch (err) {
    console.error('🚫 Error accessing camera:', err)
    toast.add({
      title: 'Camera Access Blocked',
      description:
        'Unable to access camera. Please allow permission from your browser settings.',
      color: 'red',
    })
  }
}

const askCameraPermission = async () => {
  if (!('permissions' in navigator)) return requestCameraAccess()

  try {
    const res = await navigator.permissions.query({ name: 'camera' })
    if (res.state === 'granted') {
    } else {
      requestCameraAccess()
    }
  } catch (e) {
    console.warn('❗Permissions API error:', e)
    requestCameraAccess()
  }
}

const startCamera = async () => {
  await askCameraPermission()

  result.value = ''
  showCamera.value = true

  try {
    await nextTick()

    Quagga.init(
      {
        inputStream: {
          type: 'LiveStream',
          target: videoRef.value,
          constraints: {
            facingMode: 'environment',
          },
        },
        locator: {
          patchSize: 'medium',
          halfSample: true,
        },
        decoder: {
          readers: ['code_128_reader', 'ean_reader', 'ean_8_reader'],
        },
        locate: true,
      },
      (err) => {
        if (err) {
          console.error('Quagga init error:', err)
          toast.add({
            title: 'Camera Error',
            description: err.message,
            color: 'red',
          })
          return
        }
        Quagga.start()
      }
    )

    Quagga.onDetected((data) => {
      const scanned = data?.codeResult?.code
      if (!scanned) return

      result.value = scanned
      const lastIndex = items.value.length - 1
      if (lastIndex >= 0) {
        items.value[lastIndex].barcode = result.value
        fetchItemData(result.value, lastIndex)
         addNewRow(lastIndex,true)  
      }

      stopCamera()
    })
  } catch (err) {
    console.error('Camera access error:', err)

    if (err.name === 'NotAllowedError') {
      toast.add({
        title: 'Camera Permission Denied',
        description: 'Please allow camera access in your browser settings.',
        color: 'red',
        icon: 'i-heroicons-exclamation-triangle',
      })
    } else if (err.name === 'NotFoundError') {
      toast.add({
        title: 'No Camera Found',
        description: 'We could not detect a camera on this device.',
        color: 'orange',
        icon: 'i-heroicons-video-camera-slash',
      })
    } else {
      toast.add({
        title: 'Unexpected Error',
        description:
          err.message || 'Something went wrong while accessing the camera.',
        color: 'gray',
        icon: 'i-heroicons-bug-ant',
      })
    }

    stopCamera()
  }
}

const stopCamera = () => {
  try {
    Quagga.stop()
    Quagga.offDetected()
    result.value = ''
  } catch (e) {
    console.warn('⚠️ Error while stopping Quagga:', e)
  }
  showCamera.value = false
}

onUnmounted(() => {
  stopCamera()
})


const scannerResult = ref('')

const scanCode128 = async () => {
  try {
    const result =
      await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.CODE_128, // ✅ Only Code 128
        scanInstructions: 'Align barcode within the frame',
      })

    if (result.ScanResult) {
        const pattern = /^\d+[A-Z]\d{6}$/ // required format

        if (!pattern.test(result.ScanResult)) {
         toast.add({
              title: 'Scanned Barcode Is Invalid!',
              color: 'red',
            });
          return
        }
      scannerResult.value = result.ScanResult

      // Example: update last item
      const lastIndex = items.value.length - 1
      if (lastIndex >= 0) {
        items.value[lastIndex].barcode = scannerResult.value
        fetchItemData(scannerResult.value, lastIndex)
        addNewRow(lastIndex, true)
      }
    }
  } catch (err) {
    console.error('🚫 Scan error:', err)
  }
}

const handleScan = () => {
  if (Capacitor.isNativePlatform()) {
    scanCode128()
  } else {
    startCamera()
  }
}


onMounted(() => {
  const bills = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]');

  if (bills.length === 0) {
    const defaultBill = {
      billNo: '1',
      date: new Date().toISOString(),
      discount: 0,
      returnAmt: 0,
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
      tempSplits: Object.fromEntries(['Cash', 'UPI', 'Card','Credit'].map(method => [method, { method, amount: null }])),
      items: [{
        id: '', variantId: '', name: '', sn: 1, barcode: '', category: [], size: '',
        item: '', qty: 1, rate: null, discount: null, tax: null, value: 0,
        sizes: {}, totalQty: 0, return: false, userCode: null, userId: null, user: null
      }]
    };
    localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify([defaultBill]));
  }

  const updated = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY));
  if (updated.length > 0) {
    loadDraftBills();
    selectedDraft.value = updated[0];
    loadBill(updated[0].billNo);
  }
});

// ✅ Single computed object to track all changes
const currentBill = computed(() => ({
  billNo: billNo.value,
  date: date.value,
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
  items: items.value
}));

// ✅ Watch the whole bill and sync it
watch(currentBill, (newVal) => {
  const allBills = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]');
  const index = allBills.findIndex(b => b.billNo === newVal.billNo);

  if (index !== -1) {
    allBills[index] = newVal;
    localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify(allBills));
  }

  // ✅ Refresh `draftBills` and `selectedDraft` from localStorage
  const updated = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]');
  draftBills.value = updated;
  selectedDraft.value = updated.find(b => b.billNo === newVal.billNo);
}, { deep: true });


// ✅ Create new bill
function createNewBill() {
  const existing = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]');
  const newBillNo = (existing.length + 1).toString(); // ✅ sequential (index + 1)

  billNo.value = newBillNo;
  date.value = new Date().toISOString();
  discount.value = 0;
  returnAmt.value = 0;
  redeemedAmt.value = 0;
  paymentMethod.value = 'Cash';
  phoneNo.value = '';
  points.value = 0;
  clientName.value = '';
  clientId.value = '';
  couponValue.value = '';
  splitPayments.value = [];
  isRedeemPoint.value = false;
  redeemedPoints.value = 0;
  selected.value = null;
  tempSplits.value = Object.fromEntries(paymentOptionsInsplit.map(method => [method, { method, amount: null }]));
  items.value = [{
    id: '', variantId: '', name: '', sn: 1, barcode: '', category: [], size: '',
    item: '', qty: 1, rate: null, discount: null, tax: null, value: 0,
    sizes: {}, totalQty: 0, return: false, userCode: null, userId: null, user: null
  }];

  const newBill = currentBill.value;
  existing.push(newBill);

  // ✅ Re-sequence all bills after push
  existing.forEach((b, i) => { b.billNo = (i + 1).toString(); });

  localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify(existing));
  loadDraftBills();
  selectedDraft.value = newBill;
}


// ✅ Load all drafts into memory
function loadDraftBills() {
  try {
    draftBills.value = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]');
  } catch (e) {
    console.error('Failed to parse draft bills:', e);
    draftBills.value = [];
  }
}

// ✅ Load a specific bill
function loadBill(billNumber) {
  const bill = draftBills.value.find(b => b.billNo === billNumber);
  if (!bill) return;

  billNo.value = bill.billNo ?? '';
  date.value = new Date().toISOString();
  discount.value = bill.discount ?? 0;
  returnAmt.value = bill.returnAmt ?? 0;
  redeemedAmt.value = bill.redeemedAmt ?? 0;
  paymentMethod.value = bill.paymentMethod ?? 'Cash';
  phoneNo.value = bill.phoneNo ?? '';
  points.value = bill.points ?? 0;
  clientName.value = bill.clientName ?? '';
  clientId.value = bill.clientId ?? '';
  couponValue.value = bill.couponValue ?? 0;
  splitPayments.value = bill.splitPayments ?? [];
  isRedeemPoint.value = bill.isRedeemPoint ?? false;
  redeemedPoints.value = bill.redeemedPoints ?? 0;
  selected.value = bill.selected ?? null;
  tempSplits.value = bill.tempSplits ?? {};
  items.value = bill.items ?? [];
}

// ✅ Delete bill
function deleteBill(billNumber) {
  const deleted = draftBills.value.filter(b => b.billNo !== billNumber);

  // ✅ Re-sequence after deletion
  deleted.forEach((b, i) => { b.billNo = (i + 1).toString(); });

  localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify(deleted));
  loadDraftBills();

  const updated = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY));
  if (updated.length > 0) {
    selectedDraft.value = updated[0];
  }
}


// ✅ Watch for selection change
watch(selectedDraft, (val) => {
  if (val && val.billNo !== billNo.value) {
    loadBill(val.billNo);
  }
});


const reset = () => {
  items.value = [
    {
      id: '',
      variantId: '',
      sn: 1,
      size: '',
      barcode: '',
      category: [],
      item: '',
      qty: 1,
      rate: 0,
      discount: 0,
      tax: 0,
      value: 0,
      sizes: {},
      totalQty: 0,
      return:false
    },
  ];
  discount.value = 0;
  paymentMethod.value = 'Cash';
  clientName.value = '';
  clientId.value = '';
  phoneNo.value = '';
  points.value = 0;
  grandTotal.value = 0;
  selected.value = null;
  date.value = new Date().toISOString();
  isRedeemPoint.value = false;
  couponValue.value = 0
  redeemedAmt.value = 0;
  returnAmt.value = 0;
  redeemedPoints.value = 0;

  // Focus the barcode input
  const input = barcodeInputs.value[0]?.$el?.querySelector('input');
  input?.focus();
  couponRefetch()
};




watch(
  items,
  (newItems) => {
    newItems.forEach((item, index) => {
      if (item.category.length > 1) {
        // Keep only the latest selected category
        const lastCategory = item.category[item.category.length - 1];
        items.value[index].category = [lastCategory];
      }
    });
  },
  { deep: true }
);


const columns = computed(() => [
  { key: 'sn', label: 'S.N' },
  { key: 'barcode', label: 'BAR CODE' },
  { key: 'category', label: 'CATEGORY' },
  { key: 'name', label: 'NAME' },
  { key: 'rate', label: 'RATE' },
  { key: 'qty', label: 'QTY' },
  { key: 'discount', label: 'DISC %' },
  ...(isUserTrackIncluded.value ? [{ key: 'user', label: 'User' }] : []),
  { key: 'tax', label: 'TAX%' },
  { key: 'value', label: 'VALUE' },
]);



const resizableTable = ref(null); // Reference to the table element

let isResizing = false;
let startX = 0;
let startWidth = 0;
let columnIndex = 0;

watch(selected, (newSelected) => {
  if(newSelected){
    paymentMethod.value = 'Credit'
  }
})

watch(redeemedAmt.value, (newValue) => {
  if (newValue > 0) {
    grandTotal.value = grandTotal.value - newValue;
  }
});

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




watch(items, async () => {
  for (let index = 0; index < items.value.length; index++) {
    const item = items.value[index];
    
    // ---------- Step 1: Calculate discounted rate ----------
    let discountedRate = item.rate;

    const discount = !isNaN(Number(item.discount)) ? Number(item.discount) : 0;

    if (discount < 0) {
      discountedRate -= Math.abs(discount);
    } else {
      discountedRate -= (discountedRate * discount) / 100;
    }

    // ---------- Step 2: Update tax according to value/qty ----------


    if (item.category[0]?.id) {
      const category = categoryStore.getCategoryById(item.category[0].id)
     
      if( category){
        const { taxType, fixedTax, thresholdAmount, taxBelowThreshold, taxAboveThreshold } = category;

      if (taxType === 'FIXED') {
        item.tax = fixedTax ?? 0;
      } else {
        const effectiveValue = item.value / (item.qty || 1); // avoid division by zero

        if (effectiveValue > thresholdAmount) {
          item.tax = taxAboveThreshold ?? 0;
        } else {
          item.tax = taxBelowThreshold ?? 0;
        }
      }
      }

    }

    
    // ---------- Step 3: Calculate base value ----------
    let baseValue = discountedRate * (item.qty || 1);
    
    if (!isTaxIncluded.value) {
      baseValue += (baseValue * item.tax) / 100;
    }

    item.value = parseFloat(baseValue.toFixed(2));
  }
}, { deep: true });


const tQty = computed(() =>
  items.value.reduce((sum, item) => {
    if (item.barcode || item.name || item.category.length > 0) {
      return sum + (item.qty || 1);
    }
    return sum
  }, 0)
)

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

const addNewRow = async (index,moveTonNextRow = true) => {
  const hasEmptyRow = items.value.some(item => {
    return !item.variantId?.trim() && !item.name?.trim() && !item.barcode?.trim() && !item.category?.length && item.qty > 0;
  });

  if (!hasEmptyRow) {
  items.value.push({
    id: '',
    variantId: '',
    sn: items.value.length + 1,
    barcode: '',
    category: {},
    size: '',
    name: '',
    qty: 1,
    rate: null,
    discount: null,
    tax: null,
    value: 0,
    sizes: {},
    totalQty: 0,
    return:false,
    userCode:null,
    user:null,
    userId:null
  });
  }


  await nextTick();
  if(moveTonNextRow){
    const component = barcodeInputs.value[index + 1];
    const input = component?.$el?.querySelector("input");
    if (input) input.focus();
  }
};


const removeRow = (event,index) => {
  const inputValue = event.target.value || null;
  if (!inputValue) {
    event.preventDefault();
    if (items.value.length > 1) {
    items.value.splice(index, 1);
    // Reorder serial numbers after deletion
    items.value.forEach((item, i) => {
      item.sn = i + 1;
    });
  }
  const component = barcodeInputs.value[index - 1 ];
  if (component?.$el) {
    const input = component.$el.querySelector("input");
    if (input) {
      input.focus();
    } else {
      console.warn("Input element not found inside barcodeInputs:", component.$el);
    }
  } else {
    console.warn("Barcode input component is not available:", component);
  }
  }

  
};



onMounted(() => {
  // Initialize column widths (optional)
  const ths = resizableTable.value.querySelectorAll('th');
  ths.forEach((th) => {
    th.style.width = `${th.offsetWidth}px`;
  });
});

const args = computed(() => ({
  where: {
    phone: `+91${phoneNo.value}`,
    companies: {
      some: {
        companyId: useAuth().session.value?.companyId,
      },
    },
  },
  include: {
    companies: {
      where: {
        companyId: useAuth().session.value?.companyId,
      },
      select: {
        points: true,
      },
    },
  },
}));

const fetchClientByPhone = async (phone) => {
  isClientLoading.value = true

  try {
    if (!phone) return null

    const data = await $fetch('/api/bill/findUniqueClient', {
      query: {
        phone: `+91${phone}`,
      },
    })

    return data ?? null
  } catch (error) {
    console.error('Error fetching client by phone:', error)
    throw error
  } finally {
    isClientLoading.value = false
  }
}


const categories = ref([])


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
    console.log('Categories fetched:', categories.value)
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
const fetchItemFromServer = async (barcode) => {
  try {
    if (!barcode) return null

    const data = await $fetch('/api/bill/findFirstItem', {
      query: { barcode },
    })

    return data ?? null
  } catch (error) {
    console.error('Error fetching item from server:', error)
    throw error
  }
}


const fetchItemData = async (barcode, index) => {
  if (!barcode || !items.value[index]) return

  loadingStates.value[index] = true
  currentRequestIds.value[index] = barcode

  try {
    const data = await fetchItemFromServer(barcode)
    console.log('Fetched item data:', data)

    // ❗ Ignore stale responses
    if (currentRequestIds.value[index] !== barcode) return

    if (data) {
      processItemResponse(data, index)
    } else {
      handleInvalidBarcode(index)
    }
  } catch (error) {
    console.error('Error fetching item:', error)

    if (currentRequestIds.value[index] === barcode) {
      handleInvalidBarcode(index)
    }
  } finally {
    loadingStates.value[index] = false
    delete currentRequestIds.value[index]
  }
}

const processItemResponse = (itemData, index) => {
  if (!items.value[index]) return

  const categoryId = itemData.variant.product.categoryId

  items.value[index].id = itemData.id ?? ''
  items.value[index].size = itemData.size ?? ''

  items.value[index].name =
    `${itemData.variant.product.subcategory?.name ?? ''} ` +
    `${itemData.variant?.name ?? ''} ` +
    `${itemData.variant.product.name ?? ''}`

  items.value[index].category =
    categories.value.filter(c => c.id === categoryId)

  items.value[index].rate = itemData.variant?.sprice ?? 0
  items.value[index].discount =
    (itemData.variant?.dprice ?? 0) -
    (itemData.variant?.sprice ?? 0)

  items.value[index].tax = itemData.variant?.tax ?? 0
  items.value[index].totalQty = itemData.qty ?? 0
  items.value[index].sizes = itemData.variant?.sizes ?? null
  items.value[index].variantId = itemData.variant?.id ?? ''
}

const handleInvalidBarcode = (index) => {
  if (!items.value[index]) return

  items.value[index].barcode = ''

  toast.add({
    title: 'Barcode is invalid or item is empty!',
    color: 'red',
  })
}


const handleSave = async () => {
  if (isSaving.value) return
  isSaving.value = true

  // Grab session once
  const session = useAuth().session.value
  const companyId = session?.companyId
  const userId = session?.id

  try {
    // 0) Online check (only in browser)
    if (process.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('No internet connection')
    }

    // 1) Filter valid entries
    const finalitems = (items.value || []).filter(
      (item) => item?.name?.trim() || item?.barcode?.trim() || (item?.category?.length ?? 0) > 0
    )

    if (finalitems.length === 0) {
      throw new Error('No valid items to bill.')
    }

    // 2) Per-entry validation
    finalitems.forEach((item, idx) => {
      if (!item?.category?.[0]?.id) {
        throw new Error(`No category in entry ${idx + 1}`)
      }
      // Optional: ensure numeric-ish fields are numeric
      if (Number.isNaN(Number(item.qty ?? 1))) throw new Error(`Invalid qty in entry ${idx + 1}`)
      if (Number.isNaN(Number(item.rate ?? 0))) throw new Error(`Invalid rate in entry ${idx + 1}`)
    })

    // 3) Get a new invoice number
    const billInv = await $fetch('/api/bill/findBillCounter', {
      method: 'POST',
      body: { companyId, userId },
    })

    // 4) Coupons (only if customer present)
    if (clientId.value) {
      await generateCoupons(clientId.value, Number(grandTotal.value) || 0)
    }

    // 5) Build derived flags + arrays
    const pointsValue = Number(session?.pointsValue || 0)
const billPoints =
  pointsValue > 0
    ? Math.round(Number(grandTotal.value || 0) / pointsValue)
    : 0
    const returnedItems = finalitems.filter((i) => i.return)

    const entriesData = finalitems.map((item) => {
      const base = {
        name: item.name || '',
        qty: Number(item.qty || 1),
        rate: Number(item.rate || 0),
        discount: Number(item.discount || 0),
        tax: Number(item.tax || 0),
        value: Number(item.value || 0),
        return: Boolean(item.return),
      }

      if (item.size) base.size = item.size
      if (item.barcode) base.barcode = item.barcode
      if (item.id) base.item = { connect: { id: item.id } }
      if (item.variantId) base.variant = { connect: { id: item.variantId } }
      if (item.category?.[0]?.id) base.category = { connect: { id: item.category[0].id } }

      if (item.userId) {
        base.userName = item.user
        base.companyUser = {
          connect: {
            companyId_userId: {
              companyId,
              userId: item.userId,
            },
          },
        }
      }

      return base
    })

    const hasCreditPayment =
      paymentMethod.value === 'Credit' ||
      (paymentMethod.value === 'Split' &&
        Array.isArray(splitPayments.value) &&
        splitPayments.value.some((p) => p?.method === 'Credit'))

    // 6) Build payload for /api/bill/create
    const payload = {
      invoiceNumber: billInv,
      subtotal: Number(subtotal.value) || 0,
      discount: Number(discount.value) || 0,
      grandTotal: Number(grandTotal.value) || 0,
      // Keep prisma field camelCase; DB column can be @map("return_amt")
      returnAmt: Number(returnAmt.value) || 0,
      couponValue:Number(couponValue.value) || 0,
      paymentMethod: paymentMethod.value || 'Cash',
      ...(redeemedPoints.value ? { redeemedPoints: Number(redeemedPoints.value) || 0 } : {}),
      ...(clientId.value ? { billPoints: Number(billPoints) } : { billPoints: 0 }),
      createdAt: new Date(date.value).toISOString(),
      paymentStatus: hasCreditPayment ? 'PENDING' : 'PAID',
      type: 'BILL',
      entries: { create: entriesData },
      company: { connect: { id: companyId } },
      companyUser: {
        connect: {
          companyId_userId: { companyId, userId },
        },
      },
      ...(clientId.value && { client: { connect: { id: clientId.value } } }),
      ...(selected.value && { account: { connect: { id: selected.value } } }),
      ...(paymentMethod.value === 'Split' && { splitPayments: splitPayments.value }),
    }

    // 7) Build print data (unchanged logic; uses finalitems)
    printData = {
      invoiceNumber: billInv,
      phone: session?.companyPhone,
      description: session?.description,
      thankYouNote: session?.thankYouNote,
      refundPolicy: session?.refundPolicy,
      returnPolicy: session?.returnPolicy,
      date: new Date(date.value).toISOString(),
      entries: finalitems.map((entry) => {
        const discountVal =
          Number(entry.discount) < 0
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
      discount: Number(discount.value) || 0,
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
      tqty: finalitems.reduce((sum, e) => sum + Number(e.qty || 1), 0),
      tvalue: finalitems.reduce((sum, e) => sum + Number(e.qty || 1) * Number(e.rate || 0), 0),
      ttvalue: finalitems.reduce((sum, e) => sum + Number(e.value || 0), 0),
      tdiscount: finalitems.reduce((sum, e) => {
        const qty = Number(e.qty || 1)
        const rate = Number(e.rate || 0)
        const d = Number(e.discount || 0)
        if (d < 0) return sum + Math.abs(d) * qty
        return sum + ((rate * d) / 100) * qty
      }, 0),
    }
    printModel.value = true

    // 8) Fire FCM notification (non-blocking; swallow its error)
    ;(async () => {
      try {
        await $fetch('/api/notifyfcm', {
          method: 'POST',
          body: {
            companyId,
            excludeDeviceId: localStorage.getItem('device_id'),
            title: `New Bill Created in ${session?.companyName}`,
            body: `Invoice #${billInv} for ₹${Number(grandTotal.value) || 0} has been created.`,
            data: { url: '/erp/sales' },
          },
        })
      } catch {}
    })()


    // 9) Create bill (await; single try/catch controls toast + state)
    await $fetch('/api/bill/create', {
      method: 'POST',
      body: {
        payload,
        items: finalitems,
        returnedItems,
        billPoints,
        clientId: clientId.value,
        companyId,
        couponId: selectedCouponId.value?.value || null,
        userId
      },
    })

        // 10) Refresh caches
    // queryClient.invalidateQueries({ queryKey: ['zenstack', 'Bill', 'findMany'], exact: false })
    // queryClient.invalidateQueries({ queryKey: ['zenstack', 'Product', 'findMany'], exact: false })
 

    toast.add({ title: 'Bill created successfully!', color: 'green' })


    // 11) Reset UI and open print modal
    
    reset()
 isSaving.value = false
  } catch (error) {
    console.error('Error creating bill', error)
    toast.add({
      title: 'Bill creation failed!',
      description: error?.message || 'Unknown error',
      color: 'red',
    })
     isSaving.value = false
  } 
}



const print = async() => {
  printModel.value = false
  try{
  await printBill(printData)
  toast.add({
        title: 'Printing Sucess!',
        color: 'Green',
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
        color: 'Green',
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
    console.log('Accounts fetched:', accounts.value)
  } catch (err) {
    console.error('Error fetching accounts:', err)
  } 
}

onMounted(async () => {
  await getAccounts()
})

const submitForm = async () => {
  isSavingAcc.value = true

  try {
    if (!account.value.name) {
      throw new Error('Please fill name')
    }

    const companyId = useAuth().session.value?.companyId
    if (!companyId) {
      throw new Error('Company not found')
    }

    await $fetch('/api/bill/createAccount', {
      method: 'POST',
      body: {
        name: account.value.name,
        phone: account.value.phone,
        companyId,
        address: {
          street: account.value.street,
          locality: account.value.locality,
          city: account.value.city,
          state: account.value.state,
          pincode: account.value.pincode,
        },
      },
    })

    toast.add({
      title: 'Account added!',
      id: 'modal-success',
    })
    await getAccounts()
    isOpen.value = false
  } catch (error) {
    toast.add({
      title: 'Account creation failed!',
      description: error.message || 'Something went wrong',
      color: 'red',
    })
  } finally {
    isSavingAcc.value = false
  }
}




const submitEntryForm = async () => {
    await entryRefetch();

    if (entrydata.value) {
        // Remove existing empty item if it exists
        items.value = items.value.filter(item => item.id || item.barcode);

        // Add fetched entries to existing items
        const newItems = entrydata.value.map((entry, index) => ({
            id: entry.id || '',
            variantId: entry.variantId || '',
            barcode: entry.barcode || '',
            category: categories.value.filter(category => category.id === entry.categoryId) || [],
            size: entry.size || '',
            item: entry.name || '',
            qty: entry.qty || 0,
            rate: entry.rate|| 0,
            discount: entry.discount|| 0,
            tax: entry.tax|| 0,
            value: entry.value|| 0,
            sizes: entry.sizes || '{}',
            totalQty: entry.totalQty|| 0,
        }));

        // Append the new items
        items.value = newItems;

        // Add an empty item at the end
        items.value.push({
            id: '', variantId: '', sn: items.value.length + 1, barcode: '',
            category: {}, size: '', item: '', qty: 1, rate: 0,
            discount: 0, tax: 0, value: 0, sizes: {}, totalQty: 0
        });

    } else {
        console.warn("entrydata is undefined");
    }
};

const newBill = () => {
  createNewBill()

  // items.value = [
  //   { id:'', variantId:'',sn: 1,size:'', barcode: '',category:[], item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0, sizes:{}, totalQty:0 }
  // ];
  // discount.value = 0;
  // paymentMethod.value = 'Cash';
  // grandTotal.value = 0;
  // returnAmt.value = 0;
  // phoneNo.value = '';
  // points.value = 0;
  // name.value = '';
  // couponValue.value = '';
  // selected.value = {};
  // account.value = {
  //   name: '',
  //   phone:'',
  //   street: '',
  //   locality: '',
  //   city: '',
  //   state: '',
  //   pincode: '',
  // };

};

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

const handleReturnData = ({ returnedItems }) => {
  items.value = items.value.filter(item =>
      item.name?.trim() || item.barcode?.trim() || item.category?.length > 0
    );
    const baseIndex = items.value.length;

    returnedItems.forEach((item, i) => {
      item.sn = baseIndex + i + 1; // Ensure sn = position in array (1-based)
    });

    items.value.push(...returnedItems);
    addNewRow(items.value.length - 1);

};


const handleEnterPhone = async () => {
  try {
    const data = await fetchClientByPhone(phoneNo.value)

    if (!data) {
      isClientAddModelOpen.value = true
      return
    }

    clientName.value = data.name
    clientId.value = data.id
    points.value = data.companies?.[0]?.points ?? 0
  } catch (err) {
    console.error('Failed to fetch client:', err)
  }
}


const handleClientAdded = (id,name) => {
  clientName.value = name
  clientId.value = id
  points.value = 0
  isClientAddModelOpen.value = false;
};






const handleAmountEntry = (method) => {
  const entry = tempSplits.value[method]
  const exists = splitPayments.value.find(p => p.method === method)

  if (entry.amount && !exists) {
    splitPayments.value.push({ method, amount: entry.amount })
  } else if (!entry.amount && exists) {
    // If amount cleared, remove from list
    splitPayments.value = splitPayments.value.filter(p => p.method !== method)
  } else if (entry.amount && exists) {
    // Update amount if already present
    exists.amount = entry.amount
  }
}



// Total calculation
const totalSplitAmount = computed(() =>
  splitPayments.value.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
)



const handleSplit = () => {
  showSplitModal.value = true
}



// Final submission
function submitSplitPayment() {
  if (totalSplitAmount.value !== grandTotal.value) {
    alert(`Total split amount must be exactly ${grandTotal.value}`)
    return
  }
  showSplitModal.value = false
   if (!paymentOptions.value.includes('Split')) {
    paymentOptions.value.push('Split');
    paymentMethod.value = 'Split';
  }
  
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

const handleDiscountEnter = (index) => {
  if (isUserTrackIncluded.value) {
    moveFocus(index, 'discount', 'right');
  } else {
    addNewRow(index);
  }
};

const handleRedeemPoints = async () => {
  isRedeemPoint.value = !isRedeemPoint.value
  redeeming.value = true

  try {
    if (!clientId.value) return

    const companyId = useAuth().session.value?.companyId
    if (!companyId) throw new Error('Company not found')

    if (isRedeemPoint.value) {
      // 🔻 Redeem points
      const redeemablePoints = Math.min(points.value, grandTotal.value)

      const res = await $fetch('/api/bill/redeemClientPoints', {
        method: 'POST',
        body: {
          companyId,
          clientId: clientId.value,
          points: redeemablePoints,
          mode: 'redeem',
        },
      })

      redeemedPoints.value = redeemablePoints
      redeemedAmt.value += redeemablePoints
      points.value = res.points
    } else {
      // 🔺 Revert points
      if (redeemedPoints.value === 0) return

      const res = await $fetch('/api/bill/redeemClientPoints', {
        method: 'POST',
        body: {
          companyId,
          clientId: clientId.value,
          points: redeemedPoints.value,
          mode: 'revert',
        },
      })

      points.value = res.points
      redeemedPoints.value = 0
      redeemedAmt.value = 0
    }
  } catch (error) {
    console.error('Error updating client points', error)
  } finally {
    redeeming.value = false
  }
}


function isCouponEligible(coupon, orderValue, clientId) {
  console.log(clientId)
  const now = new Date();
  const clientUsage = coupon.couponUsage.filter(u => u.clientId === clientId).length;
  const clientAppearances = coupon.clients.filter(c => c.clientId === clientId).length;
  if (!coupon.isActive) return false;
  if (now < new Date(coupon.startDate) || now > new Date(coupon.endDate)) return false;

  if (coupon.minOrderValue && orderValue < coupon.minOrderValue) return false;

  if (coupon.usageLimit !== null && coupon.timesUsed >= coupon.usageLimit) return false;

  if (coupon.perClientLimit !== null && clientUsage >= coupon.perClientLimit) {
    return false;
  }

  // Audience rules
  if (coupon.audienceType === 'SPECIFIC') {
    if (!coupon.clients.some(c => c.clientId === clientId)) {
      return false;
    }
  }

  if (coupon.audienceType === 'GENERATE') {
    // If client has already used as many times as appearances allow, block
    if (clientUsage >= clientAppearances) {
      return false;
    }
  }

  return true;
}

const couponRefetch = async () => {
  try {
    const companyId = useAuth().session.value?.companyId
    if (!companyId) {
      console.warn('companyId not ready yet')
      return []
    }

    const data = await $fetch('/api/bill/findManyCoupon', {
      method: 'GET',
      query: {
        companyId,
      },
    })

    allCoupons.value = data ?? []
    return allCoupons.value
  } catch (error) {
    console.error('Error fetching coupons:', error)
    return []
  }
}



const eligibleCoupons = computed(() => {
  if (!clientId.value) return [];
  return (allCoupons.value || [])
    .filter(coupon => isCouponEligible(coupon, grandTotal.value, clientId.value))
    .map(coupon => {
      const clientUsageCount = coupon.couponUsage.filter(u => u.clientId === clientId.value).length;

      let usageInfo = '∞';
      if (coupon.perClientLimit !== null) {
        const remaining = coupon.perClientLimit - clientUsageCount;
        usageInfo = remaining > 0 ? `${remaining}` : '0';
      }

      return {
        label: `${coupon.code} (${coupon.type}) - ${usageInfo}`,
        value: coupon.id,
      };
    });
});



const selectedCouponId = ref(null);


function calculateDiscount(coupon, orderValue) {
  if (!coupon) return { discount: 0, finalAmount: orderValue };

  // 🎁 If Gift coupon → no calculation, just treat as 0 discount
  if (coupon.type === 'GIFT') {
    return 0;
  }

  let discount = 0;

  if (coupon.type === 'PERCENTAGE') {
    discount = (orderValue * (coupon.discountValue ?? 0)) / 100;

    // apply max discount cap if set
    if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
      discount = coupon.maxDiscountAmount;
    }
  }

  if (coupon.type === 'FLAT') {
    discount = coupon.discountValue ?? 0;
  }

  // Prevent discount > orderValue
  if (discount > orderValue) discount = orderValue;

  return Math.round(discount)
}

watch(selectedCouponId, (newSelectedCouponId) => {
  if(newSelectedCouponId){
  redeemedAmt.value = redeemedAmt.value - couponValue.value;
  const chosen = allCoupons.value?.find(c => c.id === newSelectedCouponId?.value);
  if (chosen) {
      const result = calculateDiscount(chosen, grandTotal.value);
      couponValue.value = result;
      redeemedAmt.value = redeemedAmt.value + result;
    }
}
});

watch(
  [items, clientId],
  async ([newItems, newClientId], [oldItems, oldClientId]) => {
    if (!newItems || !newClientId) return

    // 🔄 refetch coupons (client-sensitive)
    await couponRefetch()

    // 🔁 reset coupon state
    selectedCouponId.value = null
    redeemedAmt.value -= couponValue.value
    couponValue.value = 0
  }
)


const handleProductSelected = async (selectedItems) => {
  if (!selectedItems || selectedItems.length === 0) return;

  for (const item of selectedItems) {
    const barcode = item.barcode;
    if (!barcode) continue;

    // last row index
    const index = items.value.length - 1;

    // set barcode into current row
    items.value[index].barcode = barcode;

    // fetch item details
    await fetchItemData(barcode, index);

    // create a new blank row after filling
    addNewRow(index, true);

    console.log("Added barcode:", barcode, "at index:", index);
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
          <UButton color="blue" class="flex-1" block @click="newBill" >New</UButton>
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
            <UButton color="primary" icon="i-heroicons-camera" label="Scan" block class="flex-1" @click="handleScan"/>
          </div>
        
       <div class="lg:grid grid-cols-1 lg:grid-cols-12 gap-4 text-sm hidden py-2 px-2">
          <UInput v-if="!token" v-model="dateOnly" type="date" label="Date" class="lg:col-span-2" />
  
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
        @keydown.enter="addNewRow(index); updateUserDetails(index,row.user)"
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
          <label class="block text-gray-700 font-medium">Dis % (+) / Round Off (-)</label>
          <UInput
            ref="discountref"
            type="number"
            v-model="discount"
            @keydown.enter.prevent="handleEnterMainDiscount()"
            placeholder="Enter discount"
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
              <USelectMenu 
                v-model="selectedCouponId" 
                :options="eligibleCoupons" 
                placeholder="Select a coupon"
              />

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
              <UButton color="primary" block @click="isOpen=true" :loading="isSavingAcc">Add Account</UButton>
            </div>
          </div>
          
          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Cell No.</label>
              <UInput v-model="phoneNo" :loading="isClientLoading" icon="i-heroicons-magnifying-glass-20-solid" @keydown.enter.prevent="handleEnterPhone"/>
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Name</label>
              <UInput v-model="clientName" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Points</label>
              <UInput v-model="points" />
            </div>
            <div>
              <UButton v-if="!isRedeemPoint" color="green" class="mt-9" block @click="handleRedeemPoints" :loading="redeeming">Redeem Points</UButton>
              <UButton v-else-if="isRedeemPoint" color="red" class="mt-9" block @click="handleRedeemPoints" :loading="redeeming">Cancel Redeem</UButton>
            </div>
          </div>
        </div>

        <!-- mobile view -->
        <div  v-if="isMobile" class="lg:hidden flex flex-col gap-3 py-3 text-sm px-2" >
        <div class="">
          <label class="block text-gray-700 font-medium">Dis % (+) / Round Off (-)</label>
          <UInput
          ref="discountref"
          type="text"
          v-model="discount"
          inputmode="decimal"
          @keydown.enter.prevent="handleEnterMainDiscount()"
          placeholder="Enter discount"
          pattern="^-?[0-9]*[.,]?[0-9]*$"
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
            :loading="isSavingAcc"
            @click="isOpen=true"
            />
          </div>
        </div>


        </div>

         

        <div v-else class="w-full flex-wrap gap-4  px-3 py-3 hidden lg:flex">
          <UButton color="blue" class="flex-1" block @click="newBill" >New</UButton>
          <UButton  :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleSave">Save</UButton>
          <UButton color="gray" class="flex-1" block disabled>Delete</UButton>
          <UButton class="flex-1" block @click="isProductSearchOpen = true">Product Search</UButton>
          <UButton class="flex-1" @click="issalesReturnModelOpen = true" block>Sales Return</UButton>
          <UButton class="flex-1"  @click="isClientAddModelOpen = true" block>Add Client</UButton>
        </div>

          <div v-if="isMobile" class="w-full flex flex-wrap gap-4  px-3 py-3 lg:hidden">
          <UButton color="blue" class="flex-1" block @click="newBill" >New</UButton>
          <UButton  :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleSave">Save</UButton>
          <UButton  class="flex-1" @click="issalesReturnModelOpen = true" block>Return</UButton>
        </div>
        </template>
      </UCard>
  </UDashboardPanelContent>

  <UModal v-model="isOpen">
        <div class="p-4 space-y-4">
          <h2 class="text-lg font-semibold">Enter Account Details</h2>

          <!-- Name -->
          <h3 class="text-md font-semibold">Personal Details</h3>
          <UInput v-model="account.name" label="Name" placeholder="Enter full name" required />
          <UInput v-model="account.phone" label="Phone No" placeholder="Enter Phone Number" required />

          <!-- Address -->
          <h3 class="text-md font-semibold mt-4">Address Details</h3>
          <UInput v-model="account.street" label="Street" placeholder="Enter street name" required />
          <UInput v-model="account.locality" label="Locality" placeholder="Enter locality" required />
          <UInput v-model="account.city" label="City" placeholder="Enter city name" required />
          <UInput v-model="account.state" label="State" placeholder="Enter state name" required />
          <UInput v-model="account.pincode" label="Pincode" placeholder="Enter pincode" required />


          <!-- Submit Button -->
          <UButton @click="submitForm" :loading="isSavingAcc" block>Submit</UButton>
        </div>
      </UModal>


     
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

<!-- split payment method modal -->
   <UModal v-model="showSplitModal">
  <div class="p-4 space-y-4">
    <h2 class="text-lg font-semibold">Split Payment</h2>

    <div
      v-for="(method, index) in paymentOptionsInsplit"
      :key="method"
      class="flex gap-2 items-center"
    >
      <USelect
        v-model="tempSplits[method].method"
        :options="[method]"
        disabled
        class="w-1/2"
      />
      <UInput
        v-model.number="tempSplits[method].amount"
        type="number"
        placeholder="Enter amount"
        class="w-1/2"
        @update:modelValue="() => handleAmountEntry(method)"
      />
    </div>

    <div class="mt-4">
      <p class="text-sm font-medium">Total Entered: ₹{{ totalSplitAmount }}</p>
      <p
        class="text-sm"
        :class="{
          'text-green-600': totalSplitAmount === grandTotal,
          'text-red-600': totalSplitAmount !== grandTotal
        }"
      >
        Grand Total: ₹{{ grandTotal }}
      </p>
    </div>

    <UButton
      :disabled="totalSplitAmount !== grandTotal"
      color="green"
      block
      class="mt-4"
      @click="submitSplitPayment"
    >
      Submit Split Payment
    </UButton>
  </div>
</UModal>


    <UDashboardModal
        v-model="printModel"
        title="Print Bill"
        description="Would You Like to print?"
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
