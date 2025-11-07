<script setup >
import { useFindFirstEntry,useFindManyCategory } from '~/lib/hooks';
import Quagga from '@ericblade/quagga2'
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint
} from '@capacitor/barcode-scanner'
import { Capacitor } from '@capacitor/core';

const model = defineModel();
const emit = defineEmits(['totalreturnvalue']);
const barcodeCInputs = ref([]);
const categoryCInputs = ref([]);
const nameCInputs = ref([]);
const toast = useToast();
const qtyCInputs = ref([]);
const rateCInputs = ref([]);
const discountCInputs = ref([]);
const taxCInputs = ref([]);
const invoiceNumber = ref(null);
const loadingStates = ref([]);
const categoryStore = useCategoryStore()
const scannedBarcode = ref("");
const barcodeInputs = ref([]);
const categoryInputs = ref([]);
const nameInputs = ref([]);
const qtyInputs = ref([]);
const rateInputs = ref([]);
const discountInputs = ref([]);
const taxInputs = ref([]);
const userInputs = ref([]);
const useAuth = () => useNuxtApp().$auth;
const isMobile = ref(false);
const isTaxIncluded = useAuth().session.value?.isTaxIncluded;

const returnedItems = ref([
  { id:'', variantId:'',name:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0,sizes:{}, totalQty:0, return:true },
]);

onMounted(() => {
  isMobile.value = window.innerWidth < 1024;
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth < 1024;
  });
});




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
      const lastIndex = returnedItems.value.length - 1
      if (lastIndex >= 0) {
        returnedItems.value[lastIndex].barcode = result.value
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
      const lastIndex = returnedItems.value.length - 1
      if (lastIndex >= 0) {
        returnedItems.value[lastIndex].barcode = scannerResult.value
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



const columns = ref([
  { key: 'sn', label: 'S.N' },
  { key: 'barcode', label: 'BAR CODE' },
  { key: 'category', label: 'CATEGORY' },
  { key: 'name', label: 'NAME' },
  { key: 'rate', label: 'RATE' },
  { key: 'qty', label: 'QTY' },
  { key: 'discount', label: 'DISC %' },
  { key: 'tax', label: 'TAX%' },
  { key: 'value', label: 'VALUE' },

]);

const resizableTable = ref(null); // Reference to the table element

let isResizing = false;
let startX = 0;
let startWidth = 0;
let columnIndex = 0;


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

watch(
  returnedItems,
  (newreturnedItems) => {
    newreturnedItems.forEach((item, index) => {
      if (item.category.length > 1) {
        // Keep only the latest selected category
        const lastCategory = item.category[item.category.length - 1];
        returnedItems.value[index].category = [lastCategory];
      }
    });
  },
  { deep: true }
);




watch(returnedItems, async () => {
  for (let index = 0; index < returnedItems.value.length; index++) {
    const item = returnedItems.value[index];
    
    // ---------- Step 1: Calculate discounted rate ----------
    let discountedRate = item.rate;

    if (item.discount < 0) {
      discountedRate -= Math.abs(item.discount);
    } else {
      discountedRate -= (discountedRate * item.discount) / 100;
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






const entryArgs = computed(() => ({
  where: {
    barcode: scannedBarcode.value,
    bill: {
      companyId: useAuth().session.value?.companyId,
      invoiceNumber:Number(invoiceNumber.value)
    },
  },
  include:{
    variant:true
  }
}));



const { data: entry ,refetch:entryRefetch} = useFindFirstEntry(entryArgs,{enabled:false});

const fetchItemData = async (barcode, index) => {
  if (!barcode || !invoiceNumber ) return;
    loadingStates.value[index] = true;
  scannedBarcode.value = barcode;

  const { data } = await entryRefetch();
    console.log(data)
  if (data) {
    console.log(data)
    returnedItems.value[index] = {
      ...returnedItems.value[index],
      id: data?.itemId || '',
      size: data?.size || '',
      sizes: data?.variant.sizes || '',
      name: data?.name,
      barcode: data.barcode || '',
      category: categories.value.filter((c) => c.id === data?.categoryId),
      discount:data?.discount || 0,
      rate: data?.rate || 0,
      totalQty: data?.qty || 0,
      variantId: data?.variantId || '',
    };
    loadingStates.value[index] = false;
  } else {
     toast.add({
          title: 'Barcode is invalid or item is empty!',
          color: 'red',
        });
    loadingStates.value[index] = false;
    returnedItems.value[index].barcode = ''
  }
};



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

watch(model, (val) => {
  returnedItems.value =[
  { id:'', variantId:'',name:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0,sizes:{}, totalQty:0, return:true },
];
  if (val) {
    nextTick(() => {
      const ths = resizableTable.value?.querySelectorAll('th');
      ths?.forEach((th) => {
        th.style.width = `${th.offsetWidth}px`; // ✅ Fixed
      });
    });
  }
});

const selectAllText = (index) => {
  const component = barcodeCInputs.value[index];
  if (component?.$el) {
    const input = component.$el.querySelector("input");
    if (input) {
      input.select();
    }
  }
};


const removeRow = (event,barcode,index) => {
  const inputValue = event.target.value;
  if (!inputValue) {
    event.preventDefault();
    if (returnedItems.value.length > 1) {
    returnedItems.value.splice(index, 1);
    // Reorder serial numbers after deletion
    returnedItems.value.forEach((item, i) => {
      item.sn = i + 1;
    });
  }
  const component = barcodeCInputs.value[index - 1 ];
  if (component?.$el) {
    const input = component.$el.querySelector("input");
    if (input) {
      input.focus();
    } else {
      console.warn("Input element not found inside barcodeCInputs:", component.$el);
    }
  } else {
    console.warn("Barcode input component is not available:", component);
  }
  }
};

const addNewRow = async (index) => {
  const hasEmptyRow = returnedItems.value.some(item => {
    return !item.variantId?.trim() && !item.name?.trim() && !item.barcode?.trim() && !item.category?.length && item.qty > 0;
  });

  console.log(hasEmptyRow)

  if (!hasEmptyRow) {
  returnedItems.value.push({
    id: '',
    variantId: '',
    sn: returnedItems.value.length + 1,
    barcode: '',
    category: {},
    size: '',
    name: '',
    item: '',
    qty: 1,
    rate: 0,
    discount: 0,
    tax: 0,
    value: 0,
    sizes: {},
    totalQty: 0,
    return: true
  });
}

  await nextTick();

  const component = barcodeCInputs.value[index + 1];
  const input = component?.$el?.querySelector("input");
  if (input) input.focus();
};

function handleCategoryChange(category, rowIndex) {
  const isEmpty = !category || Object.keys(category).length === 0;

  if (!isEmpty) {
    rateInputs.value[rowIndex]?.$el?.querySelector('input')?.focus();
      addNewRow(rowIndex)
  }
}




const handleEnterBarcode = (barcode,index) => {
  if(!barcode){
    if(token.value){
      const component = savetokenref.value;
      const button = component.$el;
      button.focus();
    }
    else{
    const component = discountref.value;
    const input = component.$el.querySelector("input");
    input.focus();
    input.select();
    }
  }else{
    const existingItemIndex = returnedItems.value.findIndex(item => item.barcode === barcode);
    console.log(existingItemIndex)
    if(existingItemIndex != -1 && existingItemIndex !== index){
      returnedItems.value[existingItemIndex].qty += 1;
      const component = barcodeCInputs.value[index];
      const input = component.$el.querySelector("input");
      input.select();
      returnedItems.value[index].barcode = '';

    }else{
      fetchItemData(barcode, index);
    addNewRow(index);
    }
    
  }
 
};


const moveFocus = (currentRowIndex, currentField, direction) => {
  const fieldOrder = ['barcode', 'category', 'name', 'rate', 'qty', 'discount', 'tax'];
  const currentFieldIndex = fieldOrder.indexOf(currentField);
  
  let nextRowIndex = currentRowIndex;
  let nextFieldIndex = currentFieldIndex;
  
  switch (direction) {
    case 'up':
      nextRowIndex = Math.max(0, currentRowIndex - 1);
      break;
    case 'down':
      nextRowIndex = Math.min(returnedItems.value.length - 1, currentRowIndex + 1);
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
        if (barcodeCInputs.value[rowIndex]?.$el) {
          barcodeCInputs.value[rowIndex].$el.querySelector('input')?.focus();
        }
        break;
      case 'category':
      const td = categoryCInputs.value[rowIndex]
      const button = td?.querySelector('button')
      button.focus()                                            
        break;
      case 'name':
        if (nameCInputs.value[rowIndex]?.$el) {
          nameCInputs.value[rowIndex].$el.querySelector('input')?.focus();
        }
        break;
      case 'qty':
        if (qtyCInputs.value[rowIndex]?.$el) {
          qtyCInputs.value[rowIndex].$el.querySelector('input')?.focus();
        }
        break;
      case 'rate':
        if (rateCInputs.value[rowIndex]?.$el) {
          rateCInputs.value[rowIndex].$el.querySelector('input')?.focus();
        }
        break;
      case 'discount':
        if (discountCInputs.value[rowIndex]?.$el) {
          discountCInputs.value[rowIndex].$el.querySelector('input')?.focus();
        }
        break;
      case 'tax':
        if (taxCInputs.value[rowIndex]?.$el) {
          taxCInputs.value[rowIndex].$el.querySelector('input')?.focus();
        }
        break;
    }
  } catch (e) {
    console.error('Error focusing input:', e);
  }
};

const movecatgeory = (rowIndex) => {
  const td = categoryCInputs.value[rowIndex];
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
        nameCInputs.value[rowIndex].$el.querySelector('input')?.focus();
       
      
      }
    });
    ul.addEventListener('keydown', function handler(e) {
      if (e.key === 'ArrowLeft') {
        button.click(); 
        barcodeCInputs.value[rowIndex].$el.querySelector('input').focus();
        requestAnimationFrame(() => {
          barcodeCInputs.value[rowIndex].$el.querySelector('input').select();
        });
              
      
      }
    });
  }, 100); // enough time for dropdown to render
};

onMounted(() => {
  nextTick(() => {
    const input = barcodeCInputs.value[0]?.$el?.querySelector('input');
    input?.focus();
  });
  
 

});


const sendReturnValue = () => {
  // Calculate total
  returnedItems.value = returnedItems.value.filter(item =>
      item.name?.trim() || item.barcode?.trim() || item.category?.length > 0
    );
  // Emit with updated returnedItems
  emit('totalreturnvalue', {
    returnedItems: returnedItems.value
  });

  model.value = false;
};





</script>

<template>
     <UModal v-model="model" fullscreen>
      <UCard
        :ui="{
          base: 'h-full flex flex-col',
          rounded: '',
          divide: 'divide-y divide-gray-100 dark:divide-gray-800',
          body: {
            base: 'grow'
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
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
              Return
            </h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="model = false"  />
          </div>
        </template>

        <div class="p-4 space-y-4">
          <div class="mb-3 flex items-center justify-between gap-4 text-sm">
          <UInput
            v-model="invoiceNumber"
            label="Inv No"
            type="text"
            placeholder="Invoice No"
            class="flex-1 max-w-xs"
          />
          <UButton
            class="lg:hidden"
            color="primary"
            icon="i-heroicons-camera"
            label="Scan"
            @click="handleScan"
          />
        </div>

      <!-- mobile -->
        <div  v-if="isMobile" class=" space-y-4 py-1">
          <div
            v-for="(row, index) in returnedItems"
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
              />
              <UInput
                v-model="row.rate"
                ref="rateInputs"
                placeholder="Rate"
                type="number"
                size="sm"
                 :color="row.return ? 'red' : undefined"
                @keydown.enter="moveFocus(index, 'rate', 'right')"
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
              />
            </div>

            <!-- Row 2: Category | Rate | Tax -->
            <div class="grid grid-cols-3 gap-2 ">
              <USelectMenu
                v-model="row.category"
                :options="categories"
                  @update:modelValue="() => handleCategoryChange(row.category, index)"
                option-attribute="name"
                 :color="row.return ? 'red' : undefined"
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
              @keydown.enter="moveFocus(index, 'qty', 'right')"
              />
            
              <UInput
                v-model="row.tax"
                ref="taxInputs"
                placeholder="Tax"
                type="number"
                size="sm"
                :color="row.return ? 'red' : undefined"
              @keydown.enter="addNewRow(index)"
              />
            </div>
          </div>
        </div>
      <!-- pc -->
      <div v-else>
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
  <tr v-for="(row, index) in returnedItems" :key="row.sn">
    <td class="py-1 whitespace-nowrap">
      {{ row.sn }}
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput
        v-model="row.barcode"
         :loading="loadingStates[index] || false"
        ref="barcodeCInputs"
        size="sm"
        @focus="selectAllText(index)"
        @blur="fetchItemData(row.barcode, index)"
        @keydown.delete="removeRow($event, row.barcode, index)"
        @keydown.enter.prevent="handleEnterBarcode(row.barcode, index)"
        @keydown.up.prevent="moveFocus(index, 'barcode', 'up')"
        @keydown.down.prevent="moveFocus(index, 'barcode', 'down')"
        @keydown.left.prevent="moveFocus(index, 'barcode', 'left')"
        @keydown.right.prevent="moveFocus(index, 'barcode', 'right')"
      />
    </td>
    <td class="py-1 whitespace-nowrap"  ref="categoryCInputs">
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
          ref="nameCInputs"
        size="sm"  
        @keydown.enter="addNewRow(index)"
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
        ref="rateCInputs"
        size="sm"  
        @keydown.enter="addNewRow(index)"
        @keydown.up.prevent="moveFocus(index, 'rate', 'up')"
        @keydown.down.prevent="moveFocus(index, 'rate', 'down')"
        @keydown.left.prevent="moveFocus(index, 'rate', 'left')"
        @keydown.right.prevent="moveFocus(index, 'rate', 'right')"
      />
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput 
        v-model="row.qty"  
        ref="qtyCInputs" 
        type="number" 
        size="sm"  
        @keydown.enter="addNewRow(index)"
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
        ref="discountCInputs" 
        size="sm"  
        @keydown.enter="addNewRow(index)"
        @keydown.up.prevent="moveFocus(index, 'discount', 'up')"
        @keydown.down.prevent="moveFocus(index, 'discount', 'down')"
        @keydown.left.prevent="moveFocus(index, 'discount', 'left')"
        @keydown.right.prevent="moveFocus(index, 'discount', 'right')"
      />
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput 
        v-model="row.tax" 
          ref="taxCInputs"
        type="number" 
        size="sm" 
        @keydown.enter="addNewRow(index)"
        @keydown.up.prevent="moveFocus(index, 'tax', 'up')"
        @keydown.down.prevent="moveFocus(index, 'tax', 'down')"
        @keydown.left.prevent="moveFocus(index, 'tax', 'left')"
        @keydown.right.prevent="moveFocus(index, 'tax', 'right')"
      />
    </td>
    <td class="py-1 ps-2 whitespace-nowrap">
      {{ row.value }}
    </td>
  </tr>
</tbody>


          </table>
          </div>
          
        </div>

         <template #footer>
            <div class="w-full text-end">
                 <UButton label="Add return" @click = "sendReturnValue"  />
            </div>
        </template>
        </UCard>
    </UModal>

</template>