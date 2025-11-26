
<script setup>
import {
  useFindUniqueBillHistory,
  useFindManyCategory,
  useFindManyAccount,
} from '~/lib/hooks';

const useAuth = () => useNuxtApp().$auth;
const route = useRoute();
const toast = useToast();
const router = useRouter();
const paymentOptions = ['Cash', 'UPI', 'Card','Credit']
const date = ref(new Date().toISOString().split('T')[0]);
const discount = ref(0);
const subtotal = ref(0);
const grandTotal = ref(0);
const returnAmt = ref(0);
const paymentMethod = ref(null);
const voucherNo = ref('');
const phoneNo = ref('');
const clientName = ref('');
const points = ref(0);
const clientId = ref('');
const showSplitModal = ref(false)
const tempSplits = ref(
  Object.fromEntries(paymentOptions.map(method => [method, { method, amount: null }]))
)

const splitPayments = ref([])
const barcodeInputs = ref([]);
const categoryInputs = ref([]);
const nameInputs = ref([]);
const qtyInputs = ref([]);
const rateInputs = ref([]);
const discountInputs = ref([]);
const taxInputs = ref([]);
const discountref = ref();
const paymentref = ref();

const selected = ref(null);


const items = ref([
  { id:'', variantId:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0,sizes:{}, totalQty:0,return:false },
]);


const columns = ref([
  { key: 'sn', label: 'S.N' },
  { key: 'barcode', label: 'BAR CODE' },
  { key: 'category', label: 'CATEGORY' },
  { key: 'name', label: 'NAME' },
  { key: 'qty', label: 'QTY' },
  { key: 'rate', label: 'RATE' },
  { key: 'discount', label: 'DISC %' },
  { key: 'tax', label: 'TAX%' },
  { key: 'value', label: 'VALUE' },

]);

const resizableTable = ref(null); // Reference to the table element

let isResizing = false;
let startX = 0;
let startWidth = 0;
let columnIndex = 0;




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



onMounted(async () => {
  await billRefetch()
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
      name:true
    }
}
);

const {
    data: accounts
} = useFindManyAccount({
      where: { companyId: useAuth().session.value?.companyId},
});


const billArgs = computed(() => ({
  where: { id: route.params.billId }
}));


const { data: bill ,refetch:billRefetch} = useFindUniqueBillHistory(billArgs,{enabled:false});


watch(() => bill.value, (newData) => {
  console.log(newData?.data);
  if (!newData || !newData) return;
  discount.value = newData.data.discount
    selected.value = newData.data.account.id
    clientId.value = newData.data.client?.id
    clientName.value = newData.data.client?.name
    phoneNo.value = newData.data.client?.phone
  paymentMethod.value = newData.data.paymentMethod
    date.value = new Date(newData.changedAt).toISOString().split('T')[0]
    grandTotal.value = newData.data.grand_total || 0
  subtotal.value = newData.data.subtotal || 0
  returnAmt.value = newData.data.return_amt || 0
  voucherNo.value = newData.data.voucher_no || ''
  paymentMethod.value = newData.data.payment_method || 'Cash'


  items.value = newData.data.entries.map((entry, index) => {
    return {
      entryId: entry.id || '',
      id:entry.item?.id || '',
      variantId: entry.variant_id || '',
      sn: index + 1,
      name:entry.name || '',
      barcode: entry.barcode || '', 
      category:  categories.value.filter(category =>category.id === entry.category_id),
      size: entry.item?.size || '',
      sizes: entry.sizes || null,
      qty: entry.qty || 1,
      rate: entry.rate || 0,
      discount: entry.discount || 0,
      tax: entry.tax || 0,
      value: entry.value || 0,
    };
  });
}, { deep: true, immediate: true });




watch(paymentMethod, (val) => {

  if (val === 'Split') {
    showSplitModal.value = true
  }
})

// 
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
</script>


<template>
  <UDashboardPanelContent class="p-1">
    <UCard 
       :ui="{
          base: 'h-full flex flex-col',
          rounded: '',
         divide: 'divide-y divide-gray-200 dark:divide-gray-700',
          body: {
            padding: '',
            base: 'grow divide-y divide-gray-200 dark:divide-gray-700'
          },
          footer: {
            base: ' divide-y divide-gray-200 dark:divide-gray-700',
            padding:''
          }
        }">

        <div class="px-3 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 text-sm">
        <UInput v-model="date" type="date" label="Date" class="lg:col-span-2" disabled/>

      </div>


        <!-- Responsive table wrapper -->
         
        <div class="overflow-x-auto mt-2 h-48 p-3">
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
                  ref="barcodeInputs"
                  size="sm"
                  disabled
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
                 disabled
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
                 disabled
                />
              </td>
              <td class="py-1 whitespace-nowrap">
                <UInput 
                  v-model="row.rate" 
                  type="number" 
                  ref="rateInputs"
                  size="sm"  
                  disabled
                />
              </td>
              <td class="py-1 whitespace-nowrap">
                <UInput 
                  v-model="row.qty"  
                  ref="qtyInputs" 
                  type="number" 
                  size="sm"  
                  disabled
                />
              </td>
              <td class="py-1 whitespace-nowrap">
                <UInput 
                  v-model="row.discount" 
                  type="number"
                  ref="discountInputs" 
                  size="sm"  
                  disabled
                />
              </td>
              <td class="py-1 whitespace-nowrap">
                <UInput 
                  v-model="row.tax" 
                    ref="taxInputs"
                  type="number" 
                  size="sm" 
                  disabled
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
   <div class="px-3 py-2">
            <div>
              Qty: {{ tQty }}
            </div>
          </div>
        <!-- Other form elements -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm px-3 py-3">
          <div>
            <!-- Discount Input -->
        <div class="mb-6">
          <label class="block text-gray-700 font-medium">Dis %(+) / Round Off (-)</label>
          <UInput
            ref="discountref"
            type="number"
            v-model="discount"
            disabled
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
            <div class="text-green-700 dark:text-green-300 font-bold text-3xl leading-none ">₹{{ grandTotal.toFixed(2) }}</div>
          </div>
        </div>

          </div>

          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Sales Return AMT</label>
              <UInput v-model="returnAmt" disabled/>
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Total Redeemed AMT</label>
              <UInput disabled />
            </div>
             <div class="mb-4">
              <label class="block text-gray-700 font-medium">Payment Method</label>
              <div class="w-full flex flex-row gap-2">
                <USelect
                  ref="paymentref"
                  v-model="paymentMethod"
                  :options="['Cash', 'UPI', 'Card', 'Split', 'Credit']"
                  disabled
                  class="flex-1"
                />
                <UButton
                  icon="i-heroicons-pencil-square"
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
              <UInputMenu v-model="selected" :options="accounts" value-attribute="id" option-attribute="name" disabled/>
            </div>
          </div>

          <div>
            <div class="mb-4 mt-5">
              <UButton color="primary" block disabled>Add Voucher</UButton>
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Total Scanned</label>
              <UInput v-model="voucherNo" disabled />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Total Value</label>
              <UInput v-model="voucherNo" disabled />
            </div>
            <div class="mt-9">
              <UButton color="primary" block disabled>Add Account</UButton>
            </div>
          </div>

          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Cell No.</label>
              <UInput v-model="phoneNo" :loading="isClientLoading" icon="i-heroicons-magnifying-glass-20-solid" disabled/>
            </div>
           <div class="mb-4">
              <label class="block text-gray-700 font-medium">Name</label>
              <UInput v-model="clientName" disabled/>
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Points</label>
              <UInput v-model="points" disabled/>
            </div>
            <div>
              <UButton color="green" class="mt-9" block disabled>Redeem Points</UButton>
            </div>
          </div>
        </div>

  

    </template>
     </UCard>
  </UDashboardPanelContent>

 

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
      />
      <UInput
        v-model.number="tempSplits[method].amount"
        type="number"
        placeholder="Enter amount"
        class="w-1/2"
        disabled
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
      disabled
      color="green"
      block
      class="mt-4"
    >
      Submit Split Payment
    </UButton>
  </div>
</UModal>


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