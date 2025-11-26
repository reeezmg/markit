
<script setup>
import {
  useUpdateBill,
  useFindUniqueBill,
  useFindFirstItem,
  useFindManyCategory,
  useUpdateVariant,
  useUpdateItem,
  useCreateAccount,
  useFindManyAccount,
  useFindUniqueClient,
  useUpdateEntry,
  useCreateEntry,
  useDeleteManyEntry,
  useFindManyEntry,
  useUpdateCompanyClient,
  useFindManyCoupon
} from '~/lib/hooks'; 
import { v4 as uuidv4 } from 'uuid';
import { useQueryClient } from '@tanstack/vue-query';
import Quagga from '@ericblade/quagga2'
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint
} from '@capacitor/barcode-scanner'
import { Capacitor } from '@capacitor/core';
const queryClient = useQueryClient();

const UpdateBill = useUpdateBill({ optimisticUpdate: true });
const CreateAccount = useCreateAccount({ optimisticUpdate: true });
const UpdateVariant = useUpdateVariant({ optimisticUpdate: true });
const UpdateItem = useUpdateItem({ optimisticUpdate: true });
const UpdateEntry = useUpdateEntry({ optimisticUpdate: true });
const CreateEntry = useCreateEntry({ optimisticUpdate: true });
const DeleteManyEntry = useDeleteManyEntry({ optimisticUpdate: true });
const UpdateCompanyClient = useUpdateCompanyClient({ optimisticUpdate: true });
const UpdateCompanyClientForRedeem = useUpdateCompanyClient({ invalidateQueries: false });
const useAuth = () => useNuxtApp().$auth;
const route = useRoute();
const toast = useToast();
const { printBill } = usePrint();
const router = useRouter();
const isTaxIncluded = useAuth().session.value?.isTaxIncluded;
const isUserTrackIncluded = ref(useAuth().session.value?.isUserTrackIncluded);
const isSavingAcc = ref(false);
const issalesReturnModelOpen = ref(false);
const paymentOptions = ['Cash', 'UPI', 'Card','Credit']
const date = ref(new Date().toISOString());
const discount = ref(0);
const accountLoaded = ref(false);
const couponValue = ref(0);
const clientFound = ref(false);
const couponFound = ref(false);
const selectedCouponId = ref("");
const printModel = ref(false);

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





const loadingStates = ref([]);
const redeemedAmt = ref(0);
const isRedeemPoint = ref(false);
const redeeming = ref(false);
const redeemedPoints = ref(0);
const isAlreadyRedeemPoint = ref(false);
const paymentMethod = ref(null);
const voucherNo = ref('');
const phoneNo = ref('');
const clientName = ref('');
const points = ref(0);
const clientId = ref('');
const oldClientId = ref('');
const newClientId = ref('');
const scannedBarcode = ref("");
const categoryStore = useCategoryStore()
const userStore = useUserStore()
let printData = {}
const isSaving = ref(false);
const showSplitModal = ref(false)
const tempSplits = ref(
  Object.fromEntries(paymentOptions.map(method => [method, { method, amount: null }]))
)
const isMobile = ref(false);
const splitPayments = ref([])
const barcodeInputs = ref([]);
const categoryInputs = ref([]);
const nameInputs = ref([]);
const qtyInputs = ref([]);
const rateInputs = ref([]);
const discountInputs = ref([]);
const taxInputs = ref([]);
const userInputs = ref([]);
const discountref = ref();
const paymentref = ref();
const saveref = ref();
const isOpen = ref(false);
const isClientAddModelOpen = ref(false);
const account = ref({
    name: '',
    phone:'',
    street: '',
    locality: '',
    city: '',
    state: '',
    pincode: '',
});
const selected = ref(null);
const pastBillPoints = ref(0);
  const pointsValue = Number(useAuth().session.value?.pointsValue || 0);
const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref({})

const items = ref([
  { id:'', variantId:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0,sizes:{}, totalQty:0,return:false, userCode:null, userId:null, user:null },
]);


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
    console.log('✅ Camera permission granted')
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
      console.log('✅ Camera already granted')
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
        console.log('📷 Quagga started')
      }
    )

    Quagga.onDetected((data) => {
      const scanned = data?.codeResult?.code
      if (!scanned) return

      result.value = scanned
      console.log('📦 Scanned:', result.value)

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




const dateOnly = computed({
  get: () => date.value.split('T')[0],
  set: val => {
    // Preserve original time, but update the date
    const original = new Date(date.value)
    const updated = new Date(val + 'T' + original.toISOString().split('T')[1])
    date.value = updated.toISOString()
  }
})


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
  if(newSelected && accountLoaded.value){
    paymentMethod.value = 'Credit'
  }
  else{
     accountLoaded.value = true
  }

})


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
    let baseValue = discountedRate * item.qty;
    
    if (!isTaxIncluded) {
      baseValue += (baseValue * item.tax) / 100;
    }

    item.value = baseValue;
  }
}, { deep: true });

const tQty = computed(() =>
  items.value.reduce((sum, item) => {
    if (item.barcode || item.name || item.category.length > 0) {
      return sum + item.qty
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

function handleCategoryChange(category, rowIndex) {
  const isEmpty = !category || Object.keys(category).length === 0;

  if (!isEmpty) {
    rateInputs.value[rowIndex]?.$el?.querySelector('input')?.focus();
      addNewRow(rowIndex,false)
  }
}



const selectAllText = (index) => {
  const component = barcodeInputs.value[index];
  if (component?.$el) {
    const input = component.$el.querySelector("input");
    if (input) {
      input.select();
    }
  }
};


const removeRow = (event,index) => {
  const inputValue = event.target.value;
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

onMounted(async () => {
  const {data:newData} = await billRefetch()
   if (!newData || !newData.entries) return;
    if (newData?.splitPayments && newData.splitPayments.length > 0) {
      tempSplits.value = Object.fromEntries(
        paymentOptions.map((method) => {
          const match = newData.splitPayments.find((p) => p.method === method);
          return [method, { method, amount: match?.amount ?? null }];
        })
      );
      splitPayments.value = [...newData.splitPayments];
    }

    if(newData.client?.id){
      clientFound.value = true
    }
    if (newData.couponUsage[0]?.couponId) {
      couponFound.value = true;
      selectedCouponId.value = {
        label:`${newData.couponUsage[0].coupon.code} (${newData.couponUsage[0].coupon.type})`,
        value:newData.couponUsage[0].couponId
      }
    }
    discount.value = newData.discount;
    selected.value = newData.accountId;
    clientId.value = newData.client?.id;
    oldClientId.value = newData.client?.id;
    clientName.value = newData.client?.name;
    phoneNo.value = newData.client?.phone?.replace(/^\+91/, '') || '';
    pastBillPoints.value = pointsValue > 0 ? Number(newData.grandTotal) / pointsValue : 0;
    points.value = newData.client?.companies[0]?.points;
    paymentMethod.value = newData.paymentMethod;
    date.value = new Date(newData.createdAt).toISOString();
    redeemedAmt.value = newData.redeemedPoints;
    redeemedPoints.value = newData.redeemedPoints;
    isRedeemPoint.value = !!newData.redeemedPoints;
    console.log(newData.redeemedPoints)
    items.value = newData.entries.map((entry, index) => ({
      entryId: entry.id || '',
      id: entry.item?.id || '',
      variantId: entry.variant?.id || '',
      sn: index + 1,
      name: entry.name || '',
      barcode: entry.barcode || '',
      category: categories.value.filter((category) => category.id === entry.categoryId),
      size: entry.item?.size || '',
      sizes: entry.sizes || null,
      qty: entry.qty || 1,
      rate: entry.rate || 0,
      discount: entry.discount || 0,
      tax: entry.tax || 0,
      value: entry.value || 0,
      return: entry.return || false,
      user:entry.userName || null,
      userId:entry.userId || null
    }));

    items.value.push({
      id: '',
      variantId: '',
      sn: items.value.length + 1,
      barcode: '',
      category: [],
      size: '',
      name: '',
      qty: 1,
      rate: 0,
      discount: 0,
      tax: 0,
      value: 0,
      sizes: {},
      totalQty: 0,
      return: false
    });

    // Wait for DOM update
    await nextTick();

    const component = barcodeInputs.value[items.value.length - 1];
    const input = component?.$el?.querySelector?.("input");
    input?.focus(); // Safe access
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



 const {
  data: client,
  isLoading:isClientLoading,
  error,
  refetch:refetchClient,
} = useFindUniqueClient(
  args,
  { enabled: false } // disabled by default
);

const {
    data: categories,
} = useFindManyCategory(
  {
    where:{companyId:useAuth().session.value?.companyId},
    select:{
      id:true,
      name:true
    }
}
);



const itemargs = computed(() => ({
  where: { 
    barcode: scannedBarcode.value,
    companyId:useAuth().session.value?.companyId || ''

   },
  select: {
    id: true,
    size: true,
    qty: true,
    variant: {
      select: {
        id: true,
        sprice: true,
        dprice:true,
        name: true,
        tax: true,
        discount: true,
        product: {
          select: {
            name: true,
            categoryId: true,
            category: {
              select: {
                taxType: true,
                fixedTax: true,
                thresholdAmount: true,
                taxBelowThreshold: true,
                taxAboveThreshold: true
              }
            }
          }
        }
      }
    }
  }
}));

const findManyEntryargs = computed(() => ({
  
  where: {
    billId: route.params.salesId,
    id: {
      notIn: items.value
        .filter(item => item.entryId)
        .map(item => item.entryId),
    },
  },
  select: {
    id: true,
    itemId: true,
    qty: true,
    size:true,
    variantId: true,
    return:true,
  },

}));




const billArgs = computed(() => ({
  where: { id: route.params.salesId },
  select: {
    id: true,
    createdAt:true,
    invoiceNumber: true,
    subtotal: true,
    discount: true,
    tax: true,
    grandTotal: true,
    redeemedPoints: true,
    billPoints: true,
    deliveryFees: true,
    paymentMethod: true,
    paymentStatus: true,
    splitPayments:true,
    notes:true,
    returnDeadline: true,
    accountId:true,
    type: true,
    status: true,
    isMarkit:true,
    address: {
        select:{
            street:true,
            locality:true,
            city:true,
            state:true,
            pincode:true
        }
    },
    client: {
        select:{
            name:true,
            phone:true,
            id:true,
            companies: {
              where: {
                companyId: useAuth().session.value?.companyId
              },
                select: {
                    points: true
                }
            }
        }
    },
    entries: {  
      select: {
        id:true,
        barcode:true,
        name: true,
        qty: true,
        rate: true,
        discount: true,
        tax: true,
        value: true,
        size: true,
        outOfStock: true,
        categoryId:true,
        return:true,
        userName:true,
        companyUser:true,
        userId:true,
        item:{
          select:{
            id:true,
            size:true,
          }
        },
        variant: {  
          select: {
            id:true,
            images: true,
          }
        }
      }
    },
    couponUsage:{
      select:{
        couponId:true,
        coupon:{
          select:{
            code:true,
            type:true
          }
        }
      }
    }
  }
}));


const { data: bill ,refetch:billRefetch} = useFindUniqueBill(billArgs,{enabled:false});
const { data: itemdata ,refetch:itemRefetch} = useFindFirstItem(itemargs,{enabled:false});
const {data: entrietosDelete,refetch:entriesToDeleteRefetch} =  useFindManyEntry(findManyEntryargs,{enabled:false});

watch(bill ,(newBill) => {
  console.log(newBill)
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


const handleDeleteBill = async () => {
    const res = await UpdateBill.mutateAsync({
        where:{
            id: route.params.salesId
        },
        data:{
            deleted:true
        }
    })
router.push('/erp/sales')
    toast.add({
        title: 'Bill Deleted !',
       color: 'red',
    });

};



const fetchItemData = async (barcode, index) => {
  if (!barcode) return;
 loadingStates.value[index] = true;
  scannedBarcode.value = barcode;

  await itemRefetch();

  if (itemdata.value) {
    console.log(itemdata.value)
    const categoryId = itemdata.value.variant.product.categoryId;
  items.value[index].id = itemdata.value.id || '';
  items.value[index].size = itemdata.value.size || '';
  items.value[index].name = `${itemdata.value.variant?.name}-${itemdata.value.variant?.product.name}` || '';
  items.value[index].category = categories.value.filter(category => category.id === categoryId);
  items.value[index].rate = itemdata.value.variant?.sprice || 0;
  items.value[index].discount = itemdata.value.variant?.dprice - itemdata.value.variant?.sprice || 0;
  items.value[index].tax = itemdata.value.variant?.tax || 0;
  items.value[index].totalQty = itemdata.value?.qty || 0;
  items.value[index].sizes = itemdata.value.variant?.sizes || null;
  items.value[index].variantId = itemdata.value.variant?.id || '';
    loadingStates.value[index] = false;
  } else {
    loadingStates.value[index] = false;
  }
};


const handleEdit = async () => {
  isSaving.value = true;
  printModel.value = true
  try {

    if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
    
    // 1. Validate and filter items
    const finalitems = items.value.filter(item =>
      item.name?.trim() || item.barcode?.trim() || item.category?.length > 0
    );

    if (items.value.length === 0) {
      throw new Error(`No valid items to bill.`);
    }

    // 2. Validate each item has a category
    finalitems.forEach((item, index) => {
      if (!item.category || !item.category[0]?.id) {
        throw new Error(`No category in entry ${index + 1}`);
      }
    });


    const {data:entriesDelete} = await entriesToDeleteRefetch()


    // 4. Calculate bill points
    const billPoints = (pointsValue > 0 ? Number(grandTotal.value) / pointsValue : 0) - pastBillPoints.value;

    // 5. Prepare print data
    const preparedPrintData = {
      invoiceNumber: bill.value.invoiceNumber || '',
      date: new Date(date.value).toISOString(),
      phone:useAuth().session.value?.companyPhone,
      description:useAuth().session.value?.description,
      thankYouNote:useAuth().session.value?.thankYouNote,
      refundPolicy:useAuth().session.value?.refundPolicy,
      returnPolicy:useAuth().session.value?.returnPolicy,
      entries: finalitems.map(entry => {
        let calculatedDiscount = 0;
        
        if (entry.discount < 0) {
          calculatedDiscount = entry.discount;
        } else if (entry.discount > 0) {
          calculatedDiscount = `${entry.discount}%`;
        } else {
          calculatedDiscount = 0;
        }

        return {
          description: entry.barcode ? entry.name : entry.category[0].name,
          hsn: entry.category[0].hsn,
          qty: entry.qty,
          mrp: entry.rate,
          discount: calculatedDiscount,
          tax: entry.tax,
          value: entry.qty * entry.rate,
          size: entry.size,
          barcode: entry.barcode,
          tvalue: entry.value,
        };
      }),
      subtotal: subtotal.value,
      discount: Number(discount.value),
      grandTotal: grandTotal.value,
      paymentMethod: paymentMethod.value,
      companyName: useAuth().session.value?.companyName || '',
      companyAddress: useAuth().session.value?.address || {},
      gstin: useAuth().session.value?.gstin || '',
      ...(paymentMethod.value === 'Split' && {
        splitPayments: splitPayments.value,
      }),
      accHolderName: useAuth().session.value?.accHolderName || '',
      upiId: useAuth().session.value?.upiId || '',
      clientName: clientName.value,
      clientPhone: phoneNo.value,
      tqty: finalitems.reduce((sum, entry) => sum + entry.qty, 0),
      tvalue: finalitems.reduce((sum, entry) => sum + (entry.qty * entry.rate), 0),
      ttvalue: finalitems.reduce((sum, entry) => sum + (entry.value), 0),
      tdiscount: finalitems.reduce((sum, entry) => {
        if (entry.discount < 0) {
          return sum + (Math.abs(entry.discount) * entry.qty);
        } else {
          return sum + (((entry.rate * entry.discount) / 100) * entry.qty);
        }
      }, 0)
    };

    const hasCreditPayment =
      paymentMethod.value === 'Credit' ||
      (paymentMethod.value === 'Split' &&
      splitPayments.value?.some(p => p.method === 'Credit'));
    console.log(selected.value, 'selected account');
    // 6. Prepare request data for server
    const requestData = {
      items: finalitems,
      entriesToDelete: entriesDelete || [],
      couponId: selectedCouponId.value?.value || null,
      billPoints,
      billData: {
        id: route.params.salesId,
        subtotal: subtotal.value || 0,
        discount: discount.value || 0,
        grandTotal: grandTotal.value || 0,
        redeemedPoints: redeemedPoints.value || 0,
        paymentMethod: paymentMethod.value,
        paymentStatus: hasCreditPayment ? 'PENDING' : 'PAID',
        splitPayments: paymentMethod.value === 'Split' ? splitPayments.value : null,
        accountId: selected.value,
        clientId: clientId.value,
        date: new Date(date.value).toISOString(),
        companyId: useAuth().session.value?.companyId
      },
    }    // Increment to new client (if exists)
    if (newClientId.value && (newClientId.value !== oldClientId.value))  {

      await UpdateCompanyClientForRedeem.mutateAsync({
        where: {
          companyId_clientId: {
            companyId: useAuth().session.value?.companyId,
            clientId: oldClientId.value,
          },
        },
        data: {
          points: { decrement: pastBillPoints.value },
        },
      });
      console.log('Points decremented from old client:', res);
    


      const res = await UpdateCompanyClientForRedeem.mutateAsync({
        where: {
          companyId_clientId: {
            companyId: useAuth().session.value?.companyId,
            clientId: newClientId.value,
          },
        },
        data: {
          points: { increment: pastBillPoints.value },
        },
      });
      points.value = res.points;
      
      oldClientId.value = newClientId.value
      newClientId.value = '';

      console.log('Points incremented to new client:', res);
    }



    // 7. Call server endpoint
  $fetch('/api/bill/update', {
      method: 'POST',
      body: requestData
    }).then(() => {
       queryClient.invalidateQueries({
        queryKey: ['zenstack', 'Bill', 'findMany'],
        exact: false
      });
       // 8. Show success notification
    toast.add({
      title: 'Bill edited successfully!',
      color: 'green',
    });
    }).catch(error => {
      toast.add({
              title: 'Bill creation failed!',
              color: 'red',
            });
    })

   

    // 9. Prepare for printing
    printData = preparedPrintData;
    printModel.value = true;


  } catch (error) {
    console.error('Error updating bill', error);
    toast.add({
      title: 'Bill update failed!',
      description: error.message,
      color: 'red',
    });
  }finally{
    isSaving.value = false
  }
};



const {
    data: accounts
} = useFindManyAccount({
      where: { companyId: useAuth().session.value?.companyId},
});


const submitForm = () => {
  isSavingAcc.value = true
  try {
    
    if (!account.value.name) {
        throw new Error(`Plase Fill name`);
      }
    const res = CreateAccount.mutateAsync({
      data: {
        id: uuidv4(),
        name: account.value.name,
        phone: account.value.phone,
        address: {
            create: {
                street: account.value.street,
                locality: account.value.locality,
                city: account.value.city,
                state: account.value.state,
                pincode: account.value.pincode,
            },
        },
        company:{
          connect:{
                id:useAuth().session.value?.companyId
              }
          }
      }
    })
    toast.add({
            title: 'Account added !',
            id: 'modal-success',
        });
    isOpen.value = false
  }catch(error){
     toast.add({
        title: 'Account creation failed!',
        description: error.message,
        color: 'red',
      });
  }finally{
    isSavingAcc.value = false
  }
};

const print = async() => {
  try{
  printModel.value = false
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




watch(paymentMethod, (val) => {

  if (val === 'Split') {
    showSplitModal.value = true
  }
})

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



function handlePaymentSelect(value) {

  // You can handle logic like:
  if (value === 'Split') {
    showSplitModal.value = true
  }
}


const handleSplit = () => {
  showSplitModal.value = true
  paymentMethod.value = 'Split'
}


// Final submission
function submitSplitPayment() {
  if (totalSplitAmount.value !== grandTotal.value) {
    alert(`Total split amount must be exactly ${grandTotal.value}`)
    return
  }

  showSplitModal.value = false
}


const handleEnterPhone = async() => {
  console.log('hanlde')
  const { data } = await refetchClient()
  clientName.value = data?.name
  clientId.value = data?.id
  newClientId.value = data?.id
  points.value = data?.companies[0]?.points;
  if(!data){
    isClientAddModelOpen.value = true;
    points.value = 0
  }
}

const handleClientAdded = (id,name,phone) => {
  console.log(id,name)
  clientName.value = name
  phoneNo.value = phone
  clientId.value = id
  newClientId.value = id
  points.value = 0
  isClientAddModelOpen.value = false;
};

const handleReturnData = ({ totalreturnvalue, returnedItems }) => {
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


async function updateUserDetails(index, user) {

  const userdetails = userStore.getuserByCode(user)

  if (userdetails) {
    console.log(userdetails)
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

onMounted(() => {
  isMobile.value = window.innerWidth < 1024;
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth < 1024;
  });
});


const newBill = () => {
  window.open(window.location.href, '_blank');
};


const handleDiscountEnter = (index) => {
  if (isUserTrackIncluded.value) {
    moveFocus(index, 'discount', 'right');
  } else {
    addNewRow(index);
  }
};


const handleRedeemPoints = async () => {
  isRedeemPoint.value = !isRedeemPoint.value;
  redeeming.value = true;

  if (isRedeemPoint.value) {
    if (clientId.value) {
      try {
        // Determine the redeemable points (not more than grand total)
        const redeemablePoints = Math.min(points.value, grandTotal.value);

        const res = await UpdateCompanyClientForRedeem.mutateAsync({
          where: {
            companyId_clientId: {
              companyId: useAuth().session.value?.companyId,
              clientId: clientId.value
            }
          },
          data: {
            points: { decrement: redeemablePoints }
          }
        });

        redeemedPoints.value = redeemablePoints;
        redeemedAmt.value = redeemablePoints;
        points.value = res.points- pastBillPoints.value;
        console.log(res);

      } catch (error) {
        console.error('Error updating client points', error);
      }
    }
  } else {
    // Revert redeemed points
    if (clientId.value) {
      try {
        const res = await UpdateCompanyClientForRedeem.mutateAsync({
          where: {
            companyId_clientId: {
              companyId: useAuth().session.value?.companyId,
              clientId: clientId.value
            }
          },
          data: {
            points: { increment: redeemedPoints.value }
          }
        });

        points.value = res.points- pastBillPoints.value;
        redeemedPoints.value = 0;
        redeemedAmt.value = 0;
        console.log(res);

      } catch (error) {
        console.error('Error updating client points', error);
      }
    }
  }

  redeeming.value = false;
};


const handleClearClient = async () => {
  await UpdateCompanyClientForRedeem.mutateAsync({
      where: {
        companyId_clientId: {
          companyId: useAuth().session.value?.companyId,
          clientId: oldClientId.value,
        },
      },
      data: {
        points: { decrement: pastBillPoints.value },
      },
    });
  clientId.value = '';
  clientName.value = '';
  points.value = '';
  phoneNo.value = '';
  oldClientId.value = '';
}

function isCouponEligible(coupon, orderValue, clientId) {
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


const couponQueryArgs = computed(() => {
  const now = new Date();
  return {
    where: {
      companyId: useAuth().session.value?.companyId,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: {
      clients: { select: { clientId: true } },   // ✅ fix here
      couponUsage: { select: { clientId: true } },
    },
  }
});


const { data: allCoupons, refetch: couponRefetch } = useFindManyCoupon(couponQueryArgs);


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

  return discount
}

watch(selectedCouponId, (newSelectedCouponId) => {
  if(newSelectedCouponId){
  console.log(newSelectedCouponId)
  redeemedAmt.value = redeemedAmt.value - couponValue.value;
  const chosen = allCoupons.value?.find(c => c.id === newSelectedCouponId?.value);
  if (chosen) {
    console.log(chosen)
      const result = calculateDiscount(chosen, grandTotal.value);
      couponValue.value = result;
      redeemedAmt.value = redeemedAmt.value + result;
    }
}
});

watch([items, clientId], ([newItems, newClientId], [oldItems, oldClientId]) => {
  if (newItems && !couponFound.value) {
    // reset coupon state when items or client changes
    selectedCouponId.value = null;
    redeemedAmt.value = redeemedAmt.value - couponValue.value;
    couponValue.value = 0;
  }
}, { deep: true });

watch([items, clientId], ([newItems, newClientId], [oldItems, oldClientId]) => {
  if (newItems && couponFound.value) {
    redeemedAmt.value = redeemedAmt.value - couponValue.value;
    console.log(selectedCouponId?.value)
  const chosen = allCoupons.value?.find(c => c.id === selectedCouponId?.value.value);
  if (chosen) {
    console.log(chosen)
      const result = calculateDiscount(chosen, grandTotal.value);
      console.log(result)
      couponValue.value = result;
      redeemedAmt.value = redeemedAmt.value + result;
    }
  }
}, { deep: true });





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
        class="absolute top-2 right-3 z-10"
        @click="() => { showCamera = false; stopCamera() }"
        :disabled="bill?.isMarkit"
      />
    </div>
     <div class="w-full flex flex-wrap gap-4  px-3 py-3 lg:hidden">
          <UButton color="blue" class="flex-1" block @click="newBill" :disabled="bill?.isMarkit">New</UButton>
          <UButton  :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleEdit" :disabled="bill?.isMarkit">Save</UButton>
          <UButton class="flex-1" @click="issalesReturnModelOpen = true" block :disabled="bill?.isMarkit">Return</UButton>
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
            <UInput v-model="dateOnly" type="date" label="Date" class="flex-1" :disabled="bill?.isMarkit" />
            <UButton color="primary" icon="i-heroicons-camera" label="Scan" block class="flex-1" @click="handleScan" :disabled="bill?.isMarkit"/>
          </div>
        
        <div class="lg:flex lg:flex-row lg:justify-between text-sm py-2 px-2 hidden">
          <UInput 
            v-model="dateOnly" 
            type="date" 
            label="Date" 
            :disabled="bill?.isMarkit"
          />
          <div class="lg:flex lg:flex-row">
           <UButton
                color="primary"
                icon="i-heroicons-plus"
                class="flex-shrink-0 me-2"
                @click="addNewRow(0,false)"
                :disabled="bill?.isMarkit"
              />
          <UButton  
            color="primary" 
            icon="i-heroicons-camera" 
            label="Scan" 
            @click="handleScan"
            :disabled="bill?.isMarkit"
          />
          </div>
        </div>

   </template>  

        <!-- Responsive table wrapper -->  
         
        <!-- Mobile layout with alternating colors -->
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
                @keydown.delete="removeRow($event, index)"
                @keydown.enter.prevent="handleEnterBarcode(row.barcode, index)"
                :disabled="bill?.isMarkit"
              />
              <UInput
                v-model="row.rate"
                ref="rateInputs"
                placeholder="Rate"
                type="number"
                size="sm"
                :color="row.return ? 'red' : undefined"
                @keydown.enter="moveFocus(index, 'rate', 'right')"
                :disabled="bill?.isMarkit"
              />
              
              <UInput
                v-model="row.discount"
                :color="row.return ? 'red' : undefined"
                placeholder="Discount"
                ref="discountInputs" 
                type="text"
                inputmode="decimal"
                pattern="^-?[0-9]*[.,]?[0-9]*$"
                size="sm"
                @keydown.enter="addNewRow(index)"
                :disabled="bill?.isMarkit"
              />
            </div>

            <!-- Row 2: Category | Rate | Tax -->
            <div class="grid grid-cols-3 gap-2 ">
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
                :disabled="bill?.isMarkit"
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
                @keydown.enter="moveFocus(index, 'qty', 'right')"
                :disabled="bill?.isMarkit"
              />
            
              <UInput
                v-model="row.tax"
                ref="taxInputs"
                placeholder="Tax"
                type="number"
                size="sm"
                :color="row.return ? 'red' : undefined"
                @keydown.enter="addNewRow(index)"
                :disabled="bill?.isMarkit"
              />
            </div>
          </div>
        </div>

        <!-- Desktop table layout -->   
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
                <td class="py-1 whitespace-nowrap"  @click="(event) => {
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
                    :disabled="bill?.isMarkit"
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
                    :color="row.return ? 'red' : undefined"
                    searchable-placeholder="Search a Category..."
                    @keydown.up.prevent="moveFocus(index, 'category', 'up')"
                    @keydown.down.prevent="moveFocus(index, 'category', 'down')"
                    @keydown.left.prevent="movecatgeory(index)"
                    @keydown.right.prevent="movecatgeory(index)"
                    @keydown.enter.prevent="movecatgeory(index)"
                    :disabled="bill?.isMarkit"
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
                    @keydown.enter="addNewRow(index)"
                    @keydown.up.prevent="moveFocus(index, 'name', 'up')"
                    @keydown.down.prevent="moveFocus(index, 'name', 'down')"
                    @keydown.left.prevent="moveFocus(index, 'name', 'left')"
                    @keydown.right.prevent="moveFocus(index, 'name', 'right')"
                    :disabled="bill?.isMarkit"
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
                    :disabled="bill?.isMarkit"
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
                    :disabled="bill?.isMarkit"
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
                  :disabled="bill?.isMarkit"
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
                    :disabled="bill?.isMarkit"
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
                    :disabled="bill?.isMarkit"
                  />
                </td>
                <td class="py-1 ps-2 whitespace-nowrap"   :class="{ 'text-red-600': row.return }">
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
      <div>
          Inv #: {{ bill?.invoiceNumber }}
      </div>
    </div>
        <!-- Other form elements -->
         <div v-if="!isMobile" class="lg:grid hidden grid-cols-1 lg:grid-cols-2 lg:grid-cols-4 gap-4 text-sm px-3 py-3">

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
            :disabled="bill?.isMarkit"
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
    <div class="text-green-700 dark:text-green-300 font-bold text-3xl leading-none ">₹{{ grandTotal.toFixed(2) }}</div>
  </div>
</div>

</div>

          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Sales Return AMT</label>
              <UInput v-model="returnAmt" :disabled="bill?.isMarkit" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Total Redeemed AMT</label>
              <UInput v-model="redeemedAmt" :disabled="bill?.isMarkit" />
            </div>
             <div class="mb-4">
              <label class="block text-gray-700 font-medium">Payment Method</label>
              <div class="w-full flex flex-row gap-2">
                <USelect
                  ref="paymentref"
                  v-model="paymentMethod"
                  :options="['Cash', 'UPI', 'Card', 'Split', 'Credit']"
                  @keydown.enter.prevent="handleEnterPayment(index)"
                  class="flex-1"
                  :disabled="bill?.isMarkit"
                />
                <UButton
                  icon="i-heroicons-scissors"
                  size="sm"
                  color="primary"
                  square
                  variant="solid"
                  class="w-auto"
                  @click="handleSplit"
                  :disabled="bill?.isMarkit"
                />
              </div>
            </div>


            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Account Name</label>
              <UInputMenu v-model="selected" :options="accounts" value-attribute="id" option-attribute="name" :disabled="bill?.isMarkit"/>
            </div>    
          </div>

        
          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Apply Coupon</label>
              <USelectMenu 
                v-model="selectedCouponId" 
                :options="eligibleCoupons" 
                placeholder="Select a coupon"
                :disabled="bill?.isMarkit"
              />

            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Eligible Coupons</label>
              <UInput :value="eligibleCoupons.length" :disabled="bill?.isMarkit" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Total Value</label>
              <UInput v-model="couponValue" :disabled="bill?.isMarkit" />
            </div>
            <div class="mt-9">
              <UButton color="primary" block @click="isOpen=true" :loading="isSavingAcc" :disabled="bill?.isMarkit">Add Account</UButton>
            </div>
          </div>
          
          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Cell No.</label>
              
              <div class="flex items-center gap-2">
                <UInput
                  v-model="phoneNo"
                  :loading="isClientLoading"
                  icon="i-heroicons-magnifying-glass-20-solid"
                  @keydown.enter.prevent="handleEnterPhone"
                  class="flex-1"
                  :disabled="clientFound || bill?.isMarkit"
                />
                <!-- <UButton icon="i-heroicons-x-mark" color="red" @click="handleClearClient" :disabled="bill?.isMarkit" /> -->
              </div>
            </div>

            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Name</label>
              <UInput v-model="clientName"
              :disabled="clientFound || bill?.isMarkit" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Points</label>
              <UInput v-model="points"
              :disabled="clientFound || bill?.isMarkit" />
            </div>
            <div>
               <UButton v-if="!isRedeemPoint" color="green" class="mt-9" block @click="handleRedeemPoints" :loading="redeeming" :disabled="bill?.isMarkit">Redeem Points</UButton>
              <UButton v-else-if="isRedeemPoint" color="red" class="mt-9" block @click="handleRedeemPoints" :loading="redeeming" :disabled="bill?.isMarkit">Cancel Redeem</UButton>
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
          inputmode="decimal"
          pattern="^-?[0-9]*[.,]?[0-9]*$"
          v-model="discount"
          @keydown.enter.prevent="handleEnterMainDiscount()"
          placeholder="Enter discount"
          :disabled="bill?.isMarkit"
          />
        </div>

        <div class="">
          <label class="block text-gray-700 font-medium">Payment Method</label>
          <div class="w-full flex flex-row gap-2">
            <USelect
            ref="paymentref"
            v-model="paymentMethod"
            :options="['Cash', 'UPI', 'Card', 'Split', 'Credit']"
            @keydown.enter.prevent="handleEnterPayment(index)"
            class="flex-1"
            :disabled="bill?.isMarkit"
            />
            <UButton
            icon="i-heroicons-pencil-square"
            size="sm"
            color="primary"
            square
            variant="solid"
            class="w-auto"
            @click="handleSplit"
            :disabled="bill?.isMarkit"
            />
          </div>    
        </div>    

        <div class="">
          <label class="block text-gray-700 font-medium">Sales Return AMT</label>
          <UInput v-model="returnAmt" :disabled="bill?.isMarkit" />
        </div>

        <div class="flex flex-row gap-2 w-full">
  <div class="flex-1">
    <label class="block text-gray-700 font-medium">Cell No.</label>
    <UInput
      v-model="phoneNo"
      :loading="isClientLoading"
      icon="i-heroicons-magnifying-glass-20-solid"
      @keydown.enter.prevent="handleEnterPhone"
      :disabled="bill?.isMarkit"
    />
  </div>
  <div class="flex-1">
    <label class="block text-gray-700 font-medium">Name</label>
    <UInput v-model="clientName" :disabled="bill?.isMarkit" />
  </div>
</div>

        <div class="">
          <label class="block text-gray-700 font-medium">Account Name</label>
          <div class="w-full flex flex-row gap-2">
            <UInputMenu class="flex-1" v-model="selected" :options="accounts" value-attribute="id" option-attribute="name" :disabled="bill?.isMarkit"/>
            <UButton
            icon="i-heroicons-plus"
            size="sm"
            color="primary"
            square
            variant="solid"
            class="w-auto"
            :disabled="isSavingAcc || bill?.isMarkit"
            @click="isOpen=true"
            />
          </div>
        </div>

        </div>

         

        <div v-else class="w-full flex-wrap gap-4  px-3 py-3 hidden lg:flex">
          <UButton color="blue" class="flex-1" block @click="newBill" :disabled="bill?.isMarkit">New</UButton>
          <UButton  :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleEdit" :disabled="bill?.isMarkit">Save</UButton>
          <UButton color="red" class="flex-1" block @click="handleDeleteBill" :disabled="bill?.isMarkit">Delete</UButton>
          <UButton class="flex-1" block :disabled="bill?.isMarkit">Barcode Search</UButton>
          <UButton class="flex-1" @click="issalesReturnModelOpen = true" block :disabled="bill?.isMarkit">Sales Return</UButton>
          <UButton class="flex-1"  @click="isClientAddModelOpen = true" block :disabled="bill?.isMarkit">Add Client</UButton>
        </div>

          <div v-if="isMobile" class="w-full flex flex-wrap gap-4  px-3 py-3 lg:hidden">
          <UButton color="blue" class="flex-1" block @click="newBill" :disabled="bill?.isMarkit">New</UButton>
          <UButton  :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleEdit" :disabled="bill?.isMarkit">Save</UButton>
          <UButton class="flex-1" @click="issalesReturnModelOpen = true" block :disabled="bill?.isMarkit">Return</UButton>
        </div>
        </template>
      </UCard>
  </UDashboardPanelContent>

  <UModal v-model="isOpen">
        <div class="p-4 space-y-4">
          <h2 class="text-lg font-semibold">Enter Account Details</h2>

          <!-- Name -->
          <h3 class="text-md font-semibold">Personal Details</h3>
          <UInput v-model="account.name" label="Name" placeholder="Enter full name" required :disabled="bill?.isMarkit" />
          <UInput v-model="account.phone" label="Phone No" placeholder="Enter Phone Number" required :disabled="bill?.isMarkit" />

          <!-- Address -->
          <h3 class="text-md font-semibold mt-4">Address Details</h3>
          <UInput v-model="account.street" label="Street" placeholder="Enter street name" required :disabled="bill?.isMarkit" />
          <UInput v-model="account.locality" label="Locality" placeholder="Enter locality" required :disabled="bill?.isMarkit" />
          <UInput v-model="account.city" label="City" placeholder="Enter city name" required :disabled="bill?.isMarkit" />
          <UInput v-model="account.state" label="State" placeholder="Enter state name" required :disabled="bill?.isMarkit" />
          <UInput v-model="account.pincode" label="Pincode" placeholder="Enter pincode" required :disabled="bill?.isMarkit" />


          <!-- Submit Button -->
          <UButton @click="submitForm" :disabled="isSavingAcc || bill?.isMarkit" block>Submit</UButton>
        </div>
      </UModal>


     
<!-- sales return -->
<BillingSalesReturn
  v-model="issalesReturnModelOpen"
  @totalreturnvalue="handleReturnData"
  :disabled="bill?.isMarkit"
/>
<BillingAddClient
  v-model:model="isClientAddModelOpen"
  v-model:phoneNo="phoneNo"
  :onVerify="handleEnterPhone"
  :clientAdded="handleClientAdded"
  :disabled="bill?.isMarkit"
/>



   <!-- split payment method modal -->
   <UModal v-model="showSplitModal">
  <div class="p-4 space-y-4">
    <h2 class="text-lg font-semibold">Split Payment</h2>

    <div
      v-for="(method, index) in paymentOptions"
      :key="method"
      class="flex gap-2 items-center"
    >
      <USelect
        v-model="tempSplits[method].method"
        :options="[method]"
        disabled
        class="w-1/2"
        :disabled="bill?.isMarkit"
      />
      <UInput
        v-model.number="tempSplits[method].amount"
        type="number"
        placeholder="Enter amount"
        class="w-1/2"
        @update:modelValue="() => handleAmountEntry(method)"
        :disabled="bill?.isMarkit"
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
      :disabled="totalSplitAmount !== grandTotal || bill?.isMarkit"
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
        title="12 AZ Bill"
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
                :disabled="bill?.isMarkit"
            />
            <UButton color="white" label="Cancel" @click="isDeleteModalOpen = false" :disabled="bill?.isMarkit" />
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