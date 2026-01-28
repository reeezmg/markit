
<script setup>
import { BillingAddClient } from '#components';
import {useFindFirstItem, useFindManyCategory} from '~/lib/hooks';
import { v4 as uuidv4 } from 'uuid';
import { useQueryClient } from '@tanstack/vue-query';
import Quagga from '@ericblade/quagga2'
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint
} from '@capacitor/barcode-scanner'
const queryClient = useQueryClient();

const currentRequestIds = ref({});
const lastResponse  = ref({});
const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const router = useRouter();
const billNo = ref('1');
const loadingStates = ref([]);

const date = ref(new Date().toISOString());

const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref({})

const scannedBarcode = ref("");
const barcodeInputs = ref([]);
const categoryInputs = ref([]);
const nameInputs = ref([]);
const qtyInputs = ref([]);
const rateInputs = ref([]);

const saveref = ref();
const categoryStore = useCategoryStore()

const isSaving = ref(false);
const isMobile = ref(false);
const issalesReturnModelOpen = ref(false);



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
  { id:'', variantId:'',name:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: null,sizes:{}, totalQty:0 ,return:false},
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

  const pattern = /^\d+[A-Z]\d{6}$/ // required format

  if (!pattern.test(scanned)) {
    console.warn('❌ Invalid code format:', scanned)
    return // keep scanning, don't stop
  }

  result.value = scanned

  const lastIndex = items.value.length - 1
  if (lastIndex >= 0) {
    items.value[lastIndex].barcode = result.value
    fetchItemData(result.value, lastIndex)
    addNewRow(lastIndex, true)
  }

  stopCamera() // only stop when valid
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
      items: [{
        id: '', variantId: '', name: '', sn: 1, barcode: '', category: [], size: '',
        item: '', qty: 1, rate: null, sizes: {}, totalQty: 0, return: false
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
// ✅ Create new bill (sequential billNo)
function createNewBill() {
  const existing = JSON.parse(localStorage.getItem(LOCAL_BILLS_KEY) || '[]');
  const newBillNo = (existing.length + 1).toString(); // always next in sequence

  billNo.value = newBillNo;
  date.value = new Date().toISOString();
  items.value = [{
    id: '', variantId: '', name: '', sn: 1, barcode: '', category: [], size: '',
    item: '', qty: 1, rate: null, sizes: {}, totalQty: 0, return: false,
  }];

  const newBill = currentBill.value;
  existing.push(newBill);

  // 🔄 Re-sequence all billNos
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
  date.value = bill.date ?? new Date().toISOString();
  items.value = bill.items ?? [];
}

// ✅ Delete bill (re-sequence afterwards)
function deleteBill(billNumber) {
  let deleted = draftBills.value.filter(b => b.billNo !== billNumber);

  // 🔄 Re-sequence after deletion
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
      sizes: {},
      totalQty: 0,
      return:false
    },
  ];
  date.value = new Date().toISOString();

  // Focus the barcode input
  const input = barcodeInputs.value[0]?.$el?.querySelector('input');
  input?.focus();
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
]);



const resizableTable = ref(null); // Reference to the table element

let isResizing = false;
let startX = 0;
let startWidth = 0;
let columnIndex = 0;


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
    sizes: {},
    totalQty: 0,
    return:false,
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


const {
    data: categories,
} = useFindManyCategory(
  {
    where:{companyId:useAuth().session.value?.companyId},
    select:{
      id:true,
      name:true,
      hsn:true,
    }
}
);

const itemdata = ref(null)

const itemRefetch = async () => {
  if (!scannedBarcode.value) {
    itemdata.value = null
    return
  }

  const res = await $fetch('/api/bill/by-barcode', {
    query: {
      barcode: scannedBarcode.value,
    },
  })

  itemdata.value = res
}


const handleEnterBarcode = (barcode,index) => {
  if(!barcode){
    const component = saveref.value;
    const button = component.$el;
    button.focus();
  }else{
      fetchItemData(barcode, index);
      addNewRow(index);
}}



const selectAllText = (index) => {
  const component = barcodeInputs.value[index];
  if (component?.$el) {
    const input = component.$el.querySelector("input");
    if (input) {
      input.select();
    }
  }
};

watch(itemdata, (newData) => {
  if (!newData) return;
  
  lastResponse.value = {
    data: newData,
    requestId: scannedBarcode.value 
  };
  
  processItemResponse(newData);
});

const fetchItemData = async (barcode, index) => {
  if (!barcode) return;
 loadingStates.value[index] = true;
  // Store the current barcode and index
  currentRequestIds.value[index] = barcode;
  scannedBarcode.value = barcode;
  
  try {
    await itemRefetch();
    // Check if this is still the active request for this index
    if (currentRequestIds.value[index] !== barcode) {
      return; // Newer request has been made
    }
    
    // Process the response if we got one
    if (lastResponse.value?.requestId === barcode && itemdata.value) {
      processItemResponse(itemdata.value, index);
    } else if (!itemdata.value) {
      handleInvalidBarcode(index);
    }
  } catch (error) {
    console.error('Error fetching item:', error);
    if (currentRequestIds.value[index] === barcode) {
      handleInvalidBarcode(index);
    }
  } finally{
     loadingStates.value[index] = false;
  }
};


const processItemResponse = (itemData, index) => {
  if (!items.value[index]) {
    return;
  }

  const categoryId = itemData.variant.product.categoryId;

  items.value[index].id = itemData.id || '';
  items.value[index].size = itemData.size || '';
  items.value[index].name = `${itemData.variant?.name}-${itemData.variant.product.name}` || '';
  items.value[index].category = categories.value.filter(category => category.id === categoryId);
  items.value[index].rate = itemData.variant?.sprice || 0;
  items.value[index].totalQty = itemData.variant?.qty || 0;
  items.value[index].sizes = itemData.variant?.sizes || null;
  items.value[index].variantId = itemData.variant?.id || '';

  delete currentRequestIds.value[index];
};

const handleInvalidBarcode = (index) => {
  items.value[index].barcode = '';
  toast.add({
    title: 'Barcode is invalid or item is empty!',
    color: 'red',
  });
  delete currentRequestIds.value[index];
};


const handleSave = async () => {
  isSaving.value = true;

  try {
    // 1. Filter valid entries
    if (!navigator.onLine) {
    throw createError({
      statusCode: 0,
      statusMessage: 'No internet connection',
    })
  }
    items.value = items.value.filter(item =>
      item.name?.trim() || item.barcode?.trim() || item.category?.length > 0
    );

    if (items.value.length === 0) {
      items.value = [{
        id: '', variantId: '', sn: 1, size: '', barcode: '', category: [], item: '',
        qty: 1, rate: 0, sizes: {}, totalQty: 0
      }];
      throw new Error(`No valid Entry in bill.`);
    }

    items.value.forEach((item, index) => {
      if (!item.category?.[0]?.id) {
        throw new Error(`No category in entry ${index + 1}`);
      }
    });

    const returnedItems = items.value.filter(item => item.return);



    // 🔁 Backend call to handle everything with Prisma transaction
    $fetch('/api/bill/offline', {
      method: 'POST',
      body: {
        items: items.value,
        returnedItems,
        companyId: useAuth().session.value?.companyId,
      }
    }).then(() => {
    toast.add({
      title: 'Stock updated successfully!',
      color: 'green',
    });

      queryClient.invalidateQueries({
        queryKey: ['zenstack', 'Product', 'findMany'],
        exact: false
      });
         reset();
    }).catch(error => {
        reconstructBill(error.data.data)
       toast.add({
        title: 'Stock updation failed!',
        description: 'Check the last draft',
        color: 'red',
      });
   
    }).finally(() => {
       isSaving.value = false;
    });



  } catch (error) {
    console.error('Error creating bill', error);
    toast.add({
      title: 'Stock updation failed!',
      description: error.message,
      color: 'red',
    });
  }
};





const newBill = () => {
  createNewBill()
};

const moveFocus = (currentRowIndex, currentField, direction) => {
  const baseFieldOrder = ['barcode', 'category', 'name', 'rate', 'qty'];
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
        base: 'lg:flex-1 lg:flex lg:flex-col lg:overflow-hidden grow divide-y divide-gray-200 dark:divide-gray-700 z-10'
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
        class="absolute top-2 right-2 z-10"
        @click="() => { showCamera = false; stopCamera() }"
      />
    </div>
     <div class="w-full flex flex-wrap gap-4 lg:hidden  py-2 px-2">
          <UButton color="blue" class="flex-1" block @click="newBill" >New</UButton>
          <UButton  :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleSave">Save</UButton>
          <UButton class="flex-1" @click="issalesReturnModelOpen = true" block>Return</UButton>
        </div>
    
        
     
         <div class="lg:hidden col-span-2 flex flex-row gap-2 py-2 px-2">
            <UInput v-model="dateOnly" type="date" label="Date" class="flex-1" />
            <UButton color="primary" icon="i-heroicons-camera" label="Scan" block class="flex-1" @click="handleScan"/>
          </div>
        
       <div class="lg:grid grid-cols-1 lg:grid-cols-2 lg:grid-cols-12 gap-4 text-sm hidden py-2 px-2">
  <!-- Date Input: visible only if token is empty -->
  <UInput v-model="dateOnly" type="date" label="Date" class="lg:col-span-2" />


  <!-- Draft Selector + Reset -->
  <div class="lg:col-start-11 lg:col-span-3 flex flex-row items-center gap-2">
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
  </div>
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
      <span>SN: {{ row.sn }}</span>
      <span>{{ row.name }}</span>
    </div>

    <!-- Row 1: Barcode | Qty | Discount -->
    <div class="grid grid-cols-3 gap-2">
      <UInput
        v-model="row.barcode"
        placeholder="Barcode"
        size="sm"
        ref="barcodeInputs"
        @blur="fetchItemData(row.barcode, index)"
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
         enterkeyhint="enter"
       @keyup.enter="moveFocus(index, 'qty', 'right')"
       @keyup.tab.prevent="moveFocus(index, 'qty', 'right')"
      />
     
     
    </div>
  </div>
</div>

         <!-- pc view -->
        <div v-else class="overflow-x-auto p-3 hidden lg:block">    
          <table class="min-w-full divide-y divide-gray-50 dark:divide-gray-800" ref="resizableTable">
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
    <td class="py-1 whitespace-nowrap" @click="(event) => {
      isDeleteModalOpen = true;
      deletingRowIdentity = { index, event };}">
      {{ row.sn }}
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput
        v-model="row.barcode"
        ref="barcodeInputs"
        size="sm"
         :color="row.return ? 'red' : undefined"
        :loading="loadingStates[index] || false"
        @focus="selectAllText(index)"
        @blur="fetchItemData(row.barcode, index)"
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
        :color="row.return ? 'red' : undefined"
        option-attribute="name"  
        option-key="id" 
        track-by="id"
        multiple 
        searchable
        searchable-placeholder="Search a Category..."
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
        </div>
      </div>
         

          <div v-if="isMobile" class="w-full flex flex-wrap gap-4  px-3 py-3 lg:hidden">
          <UButton color="blue" class="flex-1" block @click="newBill" >New</UButton>
          <UButton  :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleSave">Save</UButton>
          <UButton class="flex-1" @click="issalesReturnModelOpen = true" block>Return</UButton>
        </div>

        <div v-else class="w-full flex-wrap gap-4  px-3 py-3 hidden lg:flex">
          <UButton color="blue" class="flex-1" block @click="newBill" >New</UButton>
          <UButton  :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleSave">Save</UButton>
          <UButton class="flex-1" block>Barcode Search</UButton>
          <UButton class="flex-1" @click="issalesReturnModelOpen = true" block>Stock Return</UButton>
        </div>

        </template>
      </UCard>
  </UDashboardPanelContent>


     
<!-- stock return -->
<BillingStockReturn
  v-model="issalesReturnModelOpen"
  @totalreturnvalue="handleReturnData"
/>




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
