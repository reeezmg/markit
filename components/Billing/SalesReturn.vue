<script setup >
import { useFindFirstEntry,useFindManyCategory } from '~/lib/hooks';

const model = defineModel();
const emit = defineEmits(['totalreturnvalue']);
const barcodeInputs = ref([]);
const categoryInputs = ref([]);
const nameInputs = ref([]);
const qtyInputs = ref([]);
const rateInputs = ref([]);
const discountInputs = ref([]);
const taxInputs = ref([]);
const invoiceNumber = ref(null);
const loadingStates = ref([]);
const categoryStore = useCategoryStore()
const scannedBarcode = ref("");
const useAuth = () => useNuxtApp().$auth;
const isTaxIncluded = useAuth().session.value?.isTaxIncluded;

const items = ref([
  { id:'', variantId:'',name:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0,sizes:{}, totalQty:0, return:true },
]);


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



watch(items, async () => {
  for (let index = 0; index < items.value.length; index++) {
    const item = items.value[index];
    
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
        console.log(taxType)
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
      invoiceNumber: invoiceNumber.value, // integer, not string
      companyId: useAuth().session.value?.companyId,
    },
    item:{
      status:'sold'
    }

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

  if (data) {

    items.value[index] = {
      ...items.value[index],
      entryId: data.id || '',
      id: data?.itemId || '',
      size: data?.size || '',
      sizes: data?.variant.sizes || '',
      name: data?.name,
      barcode: data.barcode || '',
      category: categories.value.filter((c) => c.id === data?.categoryId),
      rate: data?.rate || 0,
      totalQty: data?.qty || 0,
      variantId: data?.variantId || '',
    };
    loadingStates.value[index] = false;
  } else {
    console.warn("entry data not found");
    loadingStates.value[index] = false;
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
  console.log(val)
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
  const component = barcodeInputs.value[index];
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

const addNewRow = async (index) => {
  const hasEmptyRow = items.value.some(item => {
    return !item.variantId?.trim() && !item.name?.trim() && !item.barcode?.trim() && item.rate === 0;
  });

  if (hasEmptyRow) {
  const component = barcodeInputs.value[index + 1];
  const input = component?.$el?.querySelector("input");
  input.focus();
  input.select();
  return;
  };

  items.value.push({
    id: '',
    variantId: '',
    sn: items.value.length + 1,
    barcode: '',
    category: {},
    size: '',
    name: '',
    qty: 1,
    rate: 0,
    discount: 0,
    tax: 0,
    value: 0,
    sizes: {},
    totalQty: 0
  });

  await nextTick();

  const component = barcodeInputs.value[index + 1];
  const input = component?.$el?.querySelector("input");
  if (input) input.focus();
};



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
    const existingItemIndex = items.value.findIndex(item => item.barcode === barcode);
    console.log(existingItemIndex)
    if(existingItemIndex != -1 && existingItemIndex !== index){
      items.value[existingItemIndex].qty += 1;
      const component = barcodeInputs.value[index];
      const input = component.$el.querySelector("input");
      input.select();
      items.value[index].barcode = '';

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
        if (barcodeInputs.value[rowIndex]?.$el) {
          barcodeInputs.value[rowIndex].$el.querySelector('input')?.focus();
        }
        break;
      case 'category':
      const td = categoryInputs.value[rowIndex]
      const button = td?.querySelector('button')
      button.focus()                                            
        break;
      case 'name':
        if (nameInputs.value[rowIndex]?.$el) {
          nameInputs.value[rowIndex].$el.querySelector('input')?.focus();
        }
        break;
      case 'qty':
        if (qtyInputs.value[rowIndex]?.$el) {
          qtyInputs.value[rowIndex].$el.querySelector('input')?.focus();
        }
        break;
      case 'rate':
        if (rateInputs.value[rowIndex]?.$el) {
          rateInputs.value[rowIndex].$el.querySelector('input')?.focus();
        }
        break;
      case 'discount':
        if (discountInputs.value[rowIndex]?.$el) {
          discountInputs.value[rowIndex].$el.querySelector('input')?.focus();
        }
        break;
      case 'tax':
        if (taxInputs.value[rowIndex]?.$el) {
          taxInputs.value[rowIndex].$el.querySelector('input')?.focus();
        }
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


const sendReturnValue = () => {
  // Make all values negative
  items.value = items.value.map((item) => ({
    ...item,
    rate: -Math.abs(item.rate) 
  }));
console.log(items.value)
  // Calculate total
  const totalreturnvalue = items.value.reduce((acc, item) => acc + item.value, 0);

  // Emit with updated items
  emit('totalreturnvalue', {
    totalreturnvalue,
    items: items.value
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
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
              Return
            </h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="model = false"  />
          </div>
        </template>
        <div class="p-4 space-y-4">
             <div class="mb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 text-sm">
        <UInput  v-model="invoiceNumber" label="Inv No" type="number" placeholder="Invoice No" class="lg:col-span-2" />

      </div>
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
    <td class="py-1 whitespace-nowrap">
      {{ row.sn }}
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput
        v-model="row.barcode"
         :loading="loadingStates[index] || false"
        ref="barcodeInputs"
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
    <td class="py-1 whitespace-nowrap"  ref="categoryInputs">
      <USelectMenu  
        v-model="row.category" 
        
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
          ref="nameInputs"
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
        ref="rateInputs"
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
        ref="qtyInputs" 
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
        ref="discountInputs" 
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
          ref="taxInputs"
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

         <template #footer>
            <div class="w-full text-end">
                 <UButton label="Add return" @click = "sendReturnValue"  />
            </div>
        </template>
        </UCard>
    </UModal>

</template>