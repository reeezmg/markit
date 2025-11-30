<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useFindFirstItem, useFindManyCategory } from '~/lib/hooks';
import Quagga from '@ericblade/quagga2'
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint
} from '@capacitor/barcode-scanner'
import { Capacitor } from '@capacitor/core';

const model = defineModel();
const emit = defineEmits(['totalreturnvalue']);

// UI / device
const isMobile = ref(false);
onMounted(() => {
  isMobile.value = window.innerWidth < 1024;
  const onResize = () => { isMobile.value = window.innerWidth < 1024; };
  window.addEventListener('resize', onResize);
  onBeforeUnmount(() => window.removeEventListener('resize', onResize));
});

// Refs for inputs (arrays so we can focus specific rows)
const barcodeInputs = ref([]);
const barcodeCInputs = ref([]);
const categoryCInputs = ref([]);
const nameInputs = ref([]);
const nameCInputs = ref([]);
const rateInputs = ref([]);
const rateCInputs = ref([]);
const qtyInputs = ref([]);
const qtyCInputs = ref([]);

// defensive refs (may be used by other logic)
const toast = useToast?.() ?? { add: () => {} };
const token = ref(null);
const savetokenref = ref(null);
const discountref = ref(null);

// data
const returnedItems = ref([
  { id:'', variantId:'', name:'', sn: 1, barcode: '', category:[], size:'', item:'', qty: 1, rate: 0, sizes:{}, totalQty:0, return:true, value: 0 },
]);

const columns = ref([
  { key: 'sn', label: 'S.N' },
  { key: 'barcode', label: 'BAR CODE' },
  { key: 'category', label: 'CATEGORY' },
  { key: 'name', label: 'NAME' },
  { key: 'rate', label: 'RATE' },
  { key: 'qty', label: 'QTY' },
]);

// table resizing
const resizableTable = ref(null);
const columnWidths = ref<number[]>([
  50,   // S.N (small)
  140,  // BAR CODE
  160,  // CATEGORY
  200,  // NAME
  120,  // RATE
  100   // QTY
]);


let isResizing = false;
let startX = 0;
let startWidth = 0;
let columnIndex = 0;

const startResize = (index, event) => {
  isResizing = true;
  columnIndex = index;
  startX = event.clientX;
  const th = resizableTable.value?.querySelectorAll('th')[index];
  startWidth = th ? th.offsetWidth : columnWidths.value[index] || 120;

  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
};

const handleResize = (event) => {
  if (!isResizing) return;
  const currentX = event.clientX;
  const deltaX = currentX - startX;
  const newWidth = Math.max(60, startWidth + deltaX);
  columnWidths.value.splice(columnIndex, 1, newWidth);

  // apply widths to th/td for immediate visual feedback
  nextTick(() => {
    const ths = resizableTable.value?.querySelectorAll('th') || [];
    const tds = resizableTable.value?.querySelectorAll('tr') || [];
    if (ths[columnIndex]) ths[columnIndex].style.width = `${newWidth}px`;
  });
};

const stopResize = () => {
  isResizing = false;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
};

// hooks & API fetching
const useAuth = () => useNuxtApp().$auth;
const { data: categories } = useFindManyCategory({
  where: { companyId: useAuth().session.value?.companyId },
  select: { id: true, name: true }
});

// item fetch args reactive to scanned barcode
const scannedBarcode = ref('');
const itemargs = computed(() => ({
  where: {
    barcode: scannedBarcode.value,
    companyId: useAuth().session.value?.companyId
  },
  select: {
    id: true,
    size: true,
    qty: true,
    variant: {
      select: {
        id: true,
        sprice: true,
        name: true,
        product: {
          select: { name: true, categoryId: true }
        }
      }
    }
  }
}));

const { data: itemdata, refetch: itemRefetch } = useFindFirstItem(itemargs);

// request/response state
const currentRequestIds = ref({});
const lastResponse = ref({});
const loadingStates = ref([]); // will be used per-row

watch(returnedItems, (newRows) => {
  // ensure loadingStates length matches rows
  loadingStates.value = newRows.map((_, i) => loadingStates.value[i] ?? false);
}, { deep: true });

// process API response into row
const processItemResponse = (itemData, index) => {
  if (!returnedItems.value[index]) return;
  const categoryId = itemData.variant?.product?.categoryId;
  returnedItems.value[index].id = itemData.id ?? '';
  returnedItems.value[index].size = itemData.size ?? '';
  returnedItems.value[index].name = `${itemData.variant?.name ?? ''}-${itemData.variant?.product?.name ?? ''}` || '';
  returnedItems.value[index].category = categories.value?.filter(c => c.id === categoryId) ?? [];
  returnedItems.value[index].rate = itemData.variant?.sprice ?? 0;
  returnedItems.value[index].totalQty = itemData.variant?.qty ?? 0;
  returnedItems.value[index].sizes = itemData.variant?.sizes ?? {};
  returnedItems.value[index].variantId = itemData.variant?.id ?? '';
  // remove pending marker
  delete currentRequestIds.value[index];
};

const handleInvalidBarcode = (index) => {
  returnedItems.value[index].barcode = '';
  toast.add?.({
    title: 'Barcode is invalid or item is empty!',
    color: 'red',
  });
  delete currentRequestIds.value[index];
};

// watch itemdata for responses (single source from hook)
watch(itemdata, (newData) => {
  if (!newData) return;
  // find last request index matching scannedBarcode request(s)
  lastResponse.value = { data: newData, requestId: scannedBarcode.value };
  // try to find which index had that request id
  for (const idxStr of Object.keys(currentRequestIds.value)) {
    const idx = Number(idxStr);
    if (currentRequestIds.value[idx] === scannedBarcode.value) {
      processItemResponse(newData, idx);
      break;
    }
  }
});

// fetch item data
const fetchItemData = async (barcode, index) => {
  if (!barcode) return;
  loadingStates.value[index] = true;
  currentRequestIds.value[index] = barcode;
  scannedBarcode.value = barcode;
  try {
    await itemRefetch();
    // if another request replaced this index, bail
    if (currentRequestIds.value[index] !== barcode) return;
    if (lastResponse.value?.requestId === barcode && itemdata.value) {
      processItemResponse(itemdata.value, index);
    } else if (!itemdata.value) {
      handleInvalidBarcode(index);
    }
  } catch (err) {
    console.error('Error fetching item:', err);
    if (currentRequestIds.value[index] === barcode) handleInvalidBarcode(index);
  } finally {
    loadingStates.value[index] = false;
  }
};

// keep only last category selected for any row (watch deep)
watch(returnedItems, (rows) => {
  rows.forEach((row, i) => {
    if (Array.isArray(row.category) && row.category.length > 1) {
      const last = row.category[row.category.length - 1];
      returnedItems.value[i].category = [last];
    }
  });
}, { deep: true });

// focus helpers & keyboard navigation
const selectAllText = (index, field = 'barcode') => {
  try {
    const component = field === 'barcode' ? barcodeCInputs.value[index] || barcodeInputs.value[index] : null;
    if (component?.$el) {
      const input = component.$el.querySelector('input');
      if (input) input.select();
    }
  } catch (e) {
    // silent
  }
};

const removeRow = (event, arg1, arg2) => {
  // function is used in both mobile and desktop templates with different param order:
  // mobile used removeRow($event, idx)
  // desktop used removeRow($event, index)
  // unify: determine index param presence
  let index = typeof arg2 === 'number' ? arg2 : (typeof arg1 === 'number' ? arg1 : null);
  if (index === null) return;
  const inputValue = (event?.target?.value ?? '').toString();
  if (!inputValue) {
    event.preventDefault?.();
    if (returnedItems.value.length > 1) {
      returnedItems.value.splice(index, 1);
      returnedItems.value.forEach((i, ix) => i.sn = ix + 1);
    }
    // focus previous barcode
    awaitNextFocus(index - 1);
  }
};

const awaitNextFocus = async (index) => {
  await nextTick();
  const component = barcodeCInputs.value[index] ?? barcodeInputs.value[index];
  try {
    const input = component?.$el?.querySelector('input');
    if (input) input.focus();
  } catch (e) { /* ignore */ }
};

const addNewRow = async (index) => {
  // If there's an empty row, focus it instead of adding another
  const hasEmptyRow = returnedItems.value.some(item => {
    return !String(item.variantId ?? '').trim() && !String(item.name ?? '').trim() && !String(item.barcode ?? '').trim() && Number(item.rate) === 0;
  });
  if (hasEmptyRow) {
    await nextTick();
    const component = barcodeCInputs.value[index + 1] ?? barcodeInputs.value[index + 1];
    const input = component?.$el?.querySelector('input');
    if (input) { input.focus(); input.select(); }
    return;
  }

  returnedItems.value.push({
    id: '',
    variantId: '',
    sn: returnedItems.value.length + 1,
    barcode: '',
    category: [],
    size: '',
    name: '',
    item: '',
    qty: 1,
    rate: 0,
    sizes: {},
    totalQty: 0,
    return: true,
    value: 0
  });

  await nextTick();
  const component = barcodeCInputs.value[index + 1] ?? barcodeInputs.value[index + 1];
  const input = component?.$el?.querySelector('input');
  if (input) input.focus();
};

const handleEnterBarcode = (barcode, index) => {
  if (!barcode) {
    // If token button exists, focus it; otherwise fallback to discount input if present
    if (token?.value && savetokenref?.value?.$el) {
      savetokenref.value.$el?.focus?.();
    } else if (discountref?.value?.$el) {
      const inp = discountref.value.$el.querySelector('input');
      if (inp) { inp.focus(); inp.select && inp.select(); }
    }
    return;
  }

  const existingItemIndex = returnedItems.value.findIndex(item => item.barcode === barcode);
  if (existingItemIndex !== -1 && existingItemIndex !== index) {
    // merge quantities
    returnedItems.value[existingItemIndex].qty = (returnedItems.value[existingItemIndex].qty || 0) + 1;
    // clear current barcode & refocus
    const comp = barcodeCInputs.value[index] ?? barcodeInputs.value[index];
    const input = comp?.$el?.querySelector('input');
    if (input) input.select();
    returnedItems.value[index].barcode = '';
    return;
  }

  fetchItemData(barcode, index);
  addNewRow(index);
};

const fieldOrder = ['barcode', 'category', 'name', 'rate', 'qty'];

const moveFocus = (currentRowIndex, currentField, direction) => {
  const currentFieldIndex = fieldOrder.indexOf(currentField);
  if (currentFieldIndex === -1) return;

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

  if (direction === 'up' || direction === 'down') {
    nextFieldIndex = currentFieldIndex;
  }

  focusInput(nextRowIndex, fieldOrder[nextFieldIndex]);
};

const focusInput = async (rowIndex, field) => {
  await nextTick();
  try {
    switch (field) {
      case 'barcode': {
        const comp = barcodeCInputs.value[rowIndex] ?? barcodeInputs.value[rowIndex];
        comp?.$el?.querySelector('input')?.focus();
        break;
      }
      case 'category': {
        const td = categoryCInputs.value[rowIndex];
        const button = td?.querySelector?.('button');
        if (button) button.focus();
        break;
      }
      case 'name': {
        const comp = nameCInputs.value[rowIndex] ?? nameInputs.value[rowIndex];
        comp?.$el?.querySelector('input')?.focus();
        break;
      }
      case 'rate': {
        const comp = rateCInputs.value[rowIndex] ?? rateInputs.value[rowIndex];
        comp?.$el?.querySelector('input')?.focus();
        break;
      }
      case 'qty': {
        const comp = qtyCInputs.value[rowIndex] ?? qtyInputs.value[rowIndex];
        comp?.$el?.querySelector('input')?.focus();
        break;
      }
    }
  } catch (e) {
    console.error('Error focusing input:', e);
  }
};

// open category dropdown programmatically (desktop)
const movecatgeory = (rowIndex) => {
  const td = categoryCInputs.value[rowIndex];
  if (!td) return;
  const button = td.querySelector('button');
  if (!button) return;
  button.focus();
  button.click();
  setTimeout(() => {
    const ul = td.querySelector('ul[role="listbox"]');
    if (!ul) return;
    const comboInput = ul.querySelector('input[role="combobox"]');
    if (comboInput) comboInput.focus();
    // simple keyboard bridge
    ul.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        button.click();
        nameCInputs.value[rowIndex]?.$el?.querySelector('input')?.focus();
      } else if (e.key === 'ArrowLeft') {
        button.click();
        const comp = barcodeCInputs.value[rowIndex] ?? barcodeInputs.value[rowIndex];
        comp?.$el?.querySelector('input')?.focus();
        requestAnimationFrame(() => {
          comp?.$el?.querySelector('input')?.select?.();
        });
      }
    }, { once: true });
  }, 120);
};

// simple category change handler - keeps last chosen category only
const handleCategoryChange = (value, index) => {
  if (!Array.isArray(value)) return;
  if (value.length > 1) {
    const last = value[value.length - 1];
    returnedItems.value[index].category = [last];
  } else {
    returnedItems.value[index].category = value;
  }
};

// initial focus
onMounted(() => {
  nextTick(() => {
    const comp = barcodeInputs.value[0] ?? barcodeCInputs.value[0];
    comp?.$el?.querySelector('input')?.focus();
  });

  // initialize column widths to actual DOM widths if available
  nextTick(() => {
    const ths = resizableTable.value?.querySelectorAll('th') || [];
    if (ths.length) {
      columnWidths.value = Array.from(ths).map((th, i) => th.offsetWidth || columnWidths.value[i] || 120);
    }
  });
});

// reset rows when modal opens/closes
watch(model, (val) => {
  returnedItems.value = [
    { id:'', variantId:'', name:'', sn: 1, barcode: '', category:[], size:'', item:'', qty: 1, rate: 0, sizes:{}, totalQty:0, return:true, value: 0 },
  ];
  // reset column widths to fixed pixels to avoid table jumping
  nextTick(() => {
    const ths = resizableTable.value?.querySelectorAll('th') || [];
    ths.forEach((th, i) => {
      th.style.width = `${columnWidths.value[i] || th.offsetWidth}px`;
    });
  });
});

const sendReturnValue = () => {
  returnedItems.value = returnedItems.value.filter(item =>
    (item.name?.toString().trim() || item.barcode?.toString().trim() || (Array.isArray(item.category) && item.category.length > 0))
  );
  emit('totalreturnvalue', { returnedItems: returnedItems.value });
  model.value = false;
};



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


</script>

<template>
  <UModal v-model="model" fullscreen>
    <UCard
      :ui="{
        base: 'h-full flex flex-col',
        rounded: '',
        divide: 'divide-y divide-gray-100 dark:divide-gray-800 overflow-y-scroll',
        body: { base: 'grow' }
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
        <div class="flex items-center justify-between px-2 py-3">
          <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">Return</h3>
          <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="model = false" />
        </div>
      </template>

      <div class="p-4 space-y-4 grow overflow-auto">
        <!-- MOBILE -->
        <div v-if="isMobile" class="space-y-3">
          <div
            v-for="(row, idx) in returnedItems"
            :key="row.sn"
            :class="['p-3 rounded-md', idx % 2 === 0 ? 'bg-gray-50 dark:bg-zinc-800' : 'bg-white dark:bg-zinc-900']"
          >
            <div class="flex items-center justify-between text-sm font-medium mb-2">
              <div>SN: {{ row.sn }}</div>
            </div>

            <div class="grid grid-cols-1 gap-2">
              <UInput
                v-model="row.barcode"
                placeholder="Barcode"
                size="sm"
                :loading="loadingStates[idx] || false"
                ref="barcodeInputs"
                @focus="selectAllText(idx, 'barcode')"
                @blur="() => fetchItemData(row.barcode, idx)"
                @keydown.delete="removeRow($event, idx)"
                @keydown.enter.prevent="handleEnterBarcode(row.barcode, idx)"
              />

              <USelectMenu
                v-model="row.category"
                :options="categories"
                option-attribute="name"
                track-by="id"
                multiple
                searchable
                placeholder="Category"
                @update:modelValue="(v) => handleCategoryChange(v, idx)"
              >
                <template #label>
                  <span v-if="row.category.length">{{ row.category.map(c => c.name).join(', ') }}</span>
                  <span v-else class="text-gray-400">Category</span>
                </template>
              </USelectMenu>

              <UInput
                v-model="row.name"
                placeholder="Name"
                size="sm"
                ref="nameInputs"
                @keydown.enter.prevent="addNewRow(idx)"
              />

              <div class="grid grid-cols-2 gap-2">
                <UInput
                  v-model="row.rate"
                  placeholder="Rate"
                  type="number"
                  size="sm"
                  ref="rateInputs"
                  @keydown.enter.prevent="addNewRow(idx)"
                />
                <UInput
                  v-model="row.qty"
                  placeholder="Qty"
                  type="number"
                  size="sm"
                  ref="qtyInputs"
                  @keydown.enter.prevent="addNewRow(idx)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- DESKTOP -->
        <div v-else class="overflow-auto">
          <table class="min-w-full table-fixed" ref="resizableTable">
            <thead>
              <tr>
                <th
                  v-for="(col, i) in columns"
                  :key="col.key"
                  class="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative"
                  :style="{ width: columnWidths[i] + 'px' }"
                >
                  {{ col.label }}
                  <div
                    v-if="i < columns.length - 1"
                    class="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-100"
                    @mousedown.prevent="startResize(i, $event)"
                  ></div>
                </th>
              </tr>
            </thead>

            <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
              <tr v-for="(row, index) in returnedItems" :key="row.sn" class="align-top">
                <td class="py-1 px-2 whitespace-nowrap">{{ row.sn }}</td>

                <td class="py-1 px-2">
                  <UInput
                    v-model="row.barcode"
                    :loading="loadingStates[index] || false"
                    size="sm"
                    ref="barcodeCInputs"
                    @focus="selectAllText(index, 'barcode')"
                    @blur="() => fetchItemData(row.barcode, index)"
                    @keydown.delete="removeRow($event, index)"
                    @keydown.enter.prevent="handleEnterBarcode(row.barcode, index)"
                    @keydown.up.prevent="moveFocus(index, 'barcode', 'up')"
                    @keydown.down.prevent="moveFocus(index, 'barcode', 'down')"
                    @keydown.left.prevent="moveFocus(index, 'barcode', 'left')"
                    @keydown.right.prevent="moveFocus(index, 'barcode', 'right')"
                  />
                </td>

                <td class="py-1 px-2" ref="categoryCInputs">
                  <USelectMenu
                    v-model="row.category"
                    :options="categories"
                    option-attribute="name"
                    track-by="id"
                    multiple
                    searchable
                    searchable-placeholder="Search a Category..."
                    @update:modelValue="(v) => handleCategoryChange(v, index)"
                    @keydown.up.prevent="moveFocus(index, 'category', 'up')"
                    @keydown.down.prevent="moveFocus(index, 'category', 'down')"
                    @keydown.left.prevent="movecatgeory(index)"
                    @keydown.right.prevent="movecatgeory(index)"
                    @keydown.enter.prevent="movecatgeory(index)"
                  >
                    <template #label>
                      <span v-if="row.category.length" class="truncate">{{ row.category.map(item => item.name).join(', ') }}</span>
                      <span v-else class="text-gray-400">Select Category</span>
                    </template>
                    <template #option="{ option: category }">
                      <span class="truncate">{{ category.name }}</span>
                    </template>
                  </USelectMenu>
                </td>

                <td class="py-1 px-2">
                  <UInput
                    v-model="row.name"
                    size="sm"
                    ref="nameCInputs"
                    @keydown.enter.prevent="addNewRow(index)"
                    @keydown.up.prevent="moveFocus(index, 'name', 'up')"
                    @keydown.down.prevent="moveFocus(index, 'name', 'down')"
                    @keydown.left.prevent="moveFocus(index, 'name', 'left')"
                    @keydown.right.prevent="moveFocus(index, 'name', 'right')"
                  />
                </td>

                <td class="py-1 px-2">
                  <UInput
                    v-model="row.rate"
                    type="number"
                    size="sm"
                    ref="rateCInputs"
                    @keydown.enter.prevent="addNewRow(index)"
                    @keydown.up.prevent="moveFocus(index, 'rate', 'up')"
                    @keydown.down.prevent="moveFocus(index, 'rate', 'down')"
                    @keydown.left.prevent="moveFocus(index, 'rate', 'left')"
                    @keydown.right.prevent="moveFocus(index, 'rate', 'right')"
                  />
                </td>

                <td class="py-1 px-2">
                  <UInput
                    v-model="row.qty"
                    type="number"
                    size="sm"
                    ref="qtyCInputs"
                    @keydown.enter.prevent="addNewRow(index)"
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
      </div>

      <template #footer>
        <div class="w-full flex items-center justify-end px-4 py-3 space-x-2">
          <UButton
            class="lg:hidden mr-2"
            color="primary"
            icon="i-heroicons-camera"
            label="Scan"
            @click="handleScan"
          />
          <UButton label="Add return" @click="sendReturnValue" />
        </div>
      </template>
    </UCard>
  </UModal>
</template>
