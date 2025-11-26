<script setup >
import { useFindFirstItem,useFindManyCategory } from '~/lib/hooks';

const model = defineModel();
const emit = defineEmits(['totalreturnvalue']);
const barcodeCInputs = ref([]);
const categoryCInputs = ref([]);
const nameCInputs = ref([]);
const toast = useToast();
const qtyCInputs = ref([]);
const rateCInputs = ref([]);
const currentRequestIds = ref({});
const lastResponse  = ref({});
const loadingStates = ref([]);
const scannedBarcode = ref("");
const useAuth = () => useNuxtApp().$auth;

const returnedItems = ref([
  { id:'', variantId:'',name:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: 0,sizes:{}, totalQty:0, return:true },
]);


const columns = ref([
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







const itemargs = computed(() => ({
  where:  {
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
          select: {
            name: true,
            categoryId: true,
          }
        }
      }
    }
  }
}));




const { data: itemdata ,refetch:itemRefetch} = useFindFirstItem(itemargs);


const processItemResponse = (itemData, index) => {
  if (!returnedItems.value[index]) {
    return;
  }

  const categoryId = itemData.variant.product.categoryId;

  returnedItems.value[index].id = itemData.id || '';
  returnedItems.value[index].size = itemData.size || '';
  returnedItems.value[index].name = `${itemData.variant?.name}-${itemData.variant.product.name}` || '';
  returnedItems.value[index].category = categories.value.filter(category => category.id === categoryId);
  returnedItems.value[index].rate = itemData.variant?.sprice || 0;
  returnedItems.value[index].discount = itemData.variant?.discount || 0;
  returnedItems.value[index].tax = itemData.variant?.tax || 0;
  returnedItems.value[index].totalQty = itemData.variant?.qty || 0;
  returnedItems.value[index].sizes = itemData.variant?.sizes || null;
  returnedItems.value[index].variantId = itemData.variant?.id || '';

  delete currentRequestIds.value[index];
};


const handleInvalidBarcode = (index) => {
  returnedItems.value[index].barcode = '';
  toast.add({
    title: 'Barcode is invalid or item is empty!',
    color: 'red',
  });
  delete currentRequestIds.value[index];
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
  { id:'', variantId:'',name:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: 0,sizes:{}, totalQty:0, return:true },
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
    return !item.variantId?.trim() && !item.name?.trim() && !item.barcode?.trim() && item.rate === 0;
  });

  if (hasEmptyRow) {
  const component = barcodeCInputs.value[index + 1];
  const input = component?.$el?.querySelector("input");
  input.focus();
  input.select();
  return;
  };

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
    sizes: {},
    totalQty: 0,
    return: true
  });

  await nextTick();

  const component = barcodeCInputs.value[index + 1];
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
  const fieldOrder = ['barcode', 'category', 'name', 'rate', 'qty'];
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
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
              Return
            </h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="model = false"  />
          </div>
        </template>
        <div class="p-4 space-y-4">
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