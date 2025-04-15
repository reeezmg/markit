
<script setup>
import { item } from '@unovis/ts/components/bullet-legend/style';
import { useFindUniqueBill,useUpdateItem, useFindUniqueItem,useUpdateEntry,useUpdateBill } from '~/lib/hooks';

const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const route = useRoute();
const router = useRouter();
const UpdateEntry = useUpdateEntry()
const UpdateItem = useUpdateItem()
const UpdateBill = useUpdateBill()
const orderId = route.query.id;

const paymentMethod = ref('Cash');
const scannedBarcode = ref("");
const token = ref("")
const tokenEntries = ref([])

const qtyInputs = ref([]);
const barcodeInputs = ref([]);  
const discountref = ref();
const packref = ref();
const savetokenref = ref();
const selected = ref({});


const items = ref([
  { id:'', variantId:'',name:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0,sizes:{}, totalQty:0, outOfStock:'' },
]);

const order = ref({
  id: 'ORD123456',
  customerName: 'John Doe',
  contact: '+44 1234 567890',
  orderType: 'Try and Buy',
  deliveryDate: new Date(),
  totalItems: 3,
  notes: 'Deliver between 3-5 PM.\nCustomer prefers contactless delivery.',
})


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
  { key: 'action', label: '' },

]);


const action = (row) => [
  [
    {
      label: 'Unpack',
      icon: 'i-heroicons-arrow-up-on-square',
      click: () => handleUnPack(row),
    },
    row.outOfStock
      ? {
          label: 'In stock',
          icon: 'i-heroicons-check-badge',
          click: () => handleInStock(row.id,row.value,row.outOfStock),
        }
      : {
          label: 'Out of stock',
          icon: 'i-heroicons-archive-box-x-mark',
          click: () => handleOutOfStock(row),
        },
  ],
];




const resizableTable = ref(null); // Reference to the table element

let isResizing = false;
let startX = 0;
let startWidth = 0;
let columnIndex = 0;


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



const billArgs = computed(() => ({
  where: { id: orderId },
  select: {
    createdAt:true,
    invoiceNumber: true,
    subtotal: true,
    discount: true,
    tax: true,
    grandTotal: true,
    deliveryFees: true,
    paymentMethod: true,
    paymentStatus: true,
    notes:true,
    returnDeadline: true,
    type: true,
    status: true,
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
        category: {
            select:{
                name:true
            }
        },
        variant: {  
          select: {
            id:true,
            images: true,
          }
        }
      }
    }
  }
}));


const { data: bill ,refetch:itemRefetch} = useFindUniqueBill(billArgs);

watch(() => bill.value, (newData) => {
  if (!newData || !newData.entries) return;

  items.value = newData.entries.map((entry, index) => {
   
    return {
      id: entry.id || '',
      variantId: entry.variant?.id || '',
      sn: index + 1,
      name:entry.name || '',
      barcode: entry.barcode || '', 
      category: entry.category.name,
      size: entry.size || '',
      qty: entry.qty || 1,
      rate: entry.rate || 0,
      discount: entry.discount || 0,
      tax: entry.tax || 0,
      value: entry.value || 0,
      image:entry.variant.images[0] || null,
      outOfStock:entry.outOfStock || false
    };
  });
}, { deep: true, immediate: true });


const itemArgs = computed(() => ({
  where: { barcode:  scannedBarcode.value },
  select:{
    id:true,
    variantId:true
  }
}));

const { data: itemData ,refetch:itemDataRefetch} = useFindUniqueItem(itemArgs);


const discount = ref(bill.value?.discount || 0);
const subtotal = computed(() => {
  return items.value?.reduce((sum, item) => {
    return sum + (item.outOfStock ? 0 : item.value || 0);
  }, 0);
});

const grandTotal = ref( 0);
const tax = ref(bill.value?.tax || 0);

watch(items, () => {
  items.value.forEach((item) => {
    let baseValue = item.qty * item.rate;

    if (item.discount < 0) {
      baseValue -= Math.abs(item.discount);
    } else {
      baseValue -= (baseValue * item.discount) / 100;
    }

    baseValue -= (baseValue * item.tax) / 100;
    
    item.value = Math.max(baseValue, 0); 
    
  });

}, { deep: true });


watch([discount, subtotal, tax], ([newDiscount, newSubtotal, newTax]) => {
  let baseValue = newSubtotal;

  // Apply discount
  if (newDiscount < 0) {
    baseValue -= Math.abs(newDiscount);
  } else {
    baseValue -= (baseValue * newDiscount) / 100;
  }

  // Apply tax
  if (newTax > 0) {
    baseValue += (baseValue * newTax) / 100;
  }

  grandTotal.value = parseFloat(Math.max(baseValue, 0).toFixed(2)) ; // Prevent negative values
});



const handleEnterBarcode = async(barcode,id,variantId,outOfStock,value) => {
  scannedBarcode.value = barcode;
  await itemDataRefetch();
  if(itemData.value){
    if(itemData.value.variantId === variantId){
      if(outOfStock){
        await handleInStock(id,value,outOfStock)
      }
      const res = await UpdateEntry.mutateAsync({
      where: { id },
      data: {
        barcode: barcode,
        item: {
          connect: { id: itemData.value.id },
        },
    }});
      if (res) {
        toast.add({
          title: 'Item Packed successfully!',
          color: 'green',
        });
      } else {
        toast.add({
          title: 'Failed to pack item.',
          color: 'red',
        });
      }
    }

    else{
      toast.add({
        title: 'Item not matched',
        color: 'red',
      });
    }
  }else{
    toast.add({
        title: 'Barcode Unavailable',
        color: 'red',
      });
  }
  } 

  const handleOutOfStock = async (row) => {
  if (row.outOfStock) return;

  if (!row.barcode) {
    await handleUnPack(row);
  }

  await UpdateEntry.mutateAsync({
    where: { id: row.id },
    data: { outOfStock: true },
  });

  const index = items.value.findIndex((item) => item.id === row.id);
  if (index !== -1) {
    items.value[index] = {
      ...items.value[index],
      value: -Math.abs(items.value[index].value),
      outOfStock: true,
    };
  }

  toast.add({
    title: 'Item marked out of stock',
    color: 'green',
  });
};

const handleInStock = async (id, value, outOfStock) => {
  if (!outOfStock) return;

  await UpdateEntry.mutateAsync({
    where: { id },
    data: { outOfStock: false },
  });

  const index = items.value.findIndex((item) => item.id === id);
  if (index !== -1) {
    items.value[index] = {
      ...items.value[index],
      value: Math.abs(value),
      outOfStock: false,
    };
  }

  toast.add({
    title: 'Item marked In stock',
    color: 'green',
  });
};




//Unpack single items
const handleUnPack = async (row) => {
  const res = await UpdateEntry.mutateAsync({
    where: { id:row.id },
    data: {
      barcode:null,
      item: {
        disconnect: true,
      },
    },
  });

  if (res) {
      toast.add({
        title: 'Item unpacked successfully!',
        color: 'green',
      });
    } else {
      toast.add({
        title: 'Failed to pack item.',
        color: 'red',
      });
    }
};

//Unpack all items
const handlePack = async () => {
  const allOutOfStock = items.value.every(item => item.outOfStock);
try{
  const res = await UpdateBill.mutateAsync({
    where: { id: orderId },
    data: {
      subtotal: subtotal.value,
      discount: discount.value,
      grandTotal: grandTotal.value,
      status: allOutOfStock ? 'OUTOFSTOCK' : 'PACKED'
    }
  });
   // Collect all async operations in an array
   const updatePromises = [];

for (const item of items.value) {
 
  updatePromises.push(
        UpdateItem.mutateAsync({
          where: { id: item.id },
          data: { status: 'packed' }
        }).catch(error => console.error(`Error updating item ${item.id}`, error))
      );
}

// Wait for all updates to finish before proceeding
await Promise.all(updatePromises);
  if (allOutOfStock) {
      toast.add({
        title: 'Item Marked OUTOFSTOCK',
        color: 'green',
      });
    } else{
      toast.add({
        title: 'Item PACKED successfully!',
        color: 'green',
      });
    }
}catch(err){
  toast.add({
        title: 'Something went wrong',
        color: 'red',
      });
}
};


const handleEnterMainDiscount = () => {
  const component = packref.value;
  const button = component.$el;
  button.focus();;
};


const handleSave = async () => {
  try {
   

   

  } catch (error) {
    console.error('Error creating bill', error);
  }

 


  // ✅ Reset items only after all Prisma operations are complete
  items.value = [
    { id: '', variantId: '', sn: 1, size: '', barcode: '', category: [], item: '', qty: 1, rate: 0, discount: 0, tax: 0, value: 0, sizes: {}, totalQty: 0 }
  ];
  discount.value = 0;
  paymentMethod.value = 'Cash';
  tokenEntries.value = [''];
};



</script>


<template>
  <UDashboardPanelContent class="p-1">
    
        <UCard 
            :ui="{
                base: '',

                divide: 'divide-y divide-gray-200 dark:divide-gray-800',
                header: { padding: 'px-4 py-4' },
                body: {
                    padding: '',
                    base: 'divide-y divide-gray-200 dark:divide-gray-800',
                },
                footer: { padding: 'p-4' },
            }">
              <template #header>
                <div class="flex flex-wrap justify-between gap-6 text-sm">
                    <!-- Order ID -->
                    <div class="flex flex-col ">
                    <span class="text-gray-500">inv#</span>
                    <span class="font-medium">{{ bill?.invoiceNumber }}</span>
                    </div>

                     <!-- Delivery Date -->
                     <div class="flex flex-col w-fit">
                    <span class="text-gray-500">Delivery Time</span>
                    <span class="font-medium">{{ bill?.createdAt?.toLocaleString('en-GB', {
                dateStyle: 'short',
                timeStyle: 'short',
                })}}</span>
                    </div>

                    <!-- Customer Name  -->
                    <div class="flex flex-col ">
                    <span class="text-gray-500">Name</span>
                    <span class="font-medium">{{ bill?.client?.name ? bill?.client?.name :'-' }} </span>
                    </div>

                    <!-- Customer Phone -->
                    <div class="flex flex-col ">
                    <span class="text-gray-500">Phone</span>
                    <span class="font-medium">{{ bill?.client?.phone ? bill?.client?.phone : '-' }} </span>
                    </div>

                    <!-- Customer Address -->
                    <UPopover mode="hover">
                            <div class="flex flex-col ">
                    <span class="text-gray-500">Address</span>
                    <span class="font-medium">{{ bill?.address?.street }} </span>
                    </div>
                        <template #panel>
                            <div class="flex flex-col p-3">
                                <span>{{bill?.address?.street}}</span>
                                <span>{{bill?.address?.locality}}</span>
                                <span>{{bill?.address?.city}}</span>
                                <span>{{bill?.address?.state}}</span>
                                <span>{{bill?.address?.pincode}}</span>
                            </div>
                        </template>
                      </UPopover>

                 <!-- Note -->
                 <UPopover mode="hover">
                            <div class="flex flex-col ">
                    <span class="text-gray-500">Note</span>
                    <span class="font-medium truncate">{{ bill?.notes ? bill?.notes :' N/A' }} </span>
                    </div>
                        <template v-if="bill?.notes" #text>
                            <span>{{ bill?.notes }}</span>
                        </template>
                      </UPopover>
                
                   

                    <!-- Order Type -->
                    <div class="flex flex-col ">
                    <span class="text-gray-500">Order Type</span>
                    <UBadge
                size="sm"
                color="blue"
                :ui="{
                        base:'inline-flex justify-center items-center w-fit'
                    }"
                variant="subtle"
                class="text-center"
                >
                {{ bill?.type.replace(/_/g, ' ') }}
                </UBadge>
                    </div>

                      <!-- Payment Type -->
                      <div class="flex flex-col">
                    <span class="text-gray-500">Payment</span>
                    <span class="font-medium">{{ bill?.paymentMethod }} </span>
                    </div>

                   

                </div>
            </template>

        <!-- Responsive table wrapper -->
         
        <div class="overflow-x-auto p-4 mt-2 h-96">
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
                  <UInput v-model="row.barcode" ref="barcodeInputs"  size="sm" @keydown.enter.prevent="handleEnterBarcode(row.barcode,row.id,row.variantId,row.outOfStock,row.value)"/>
                </td>
                <td class="py-1 whitespace-nowrap">
                    <UInput v-model="row.category" size="sm" disabled  />
                </td>
                <td class="py-1 whitespace-nowrap">
                  <UInput v-model="row.name" size="sm"  @keydown.enter="addNewRow(index)" disabled/>
                </td>
                <td class="py-1 whitespace-nowrap">
                  <UInput v-model="row.qty"  ref="qtyInputs" type="number" size="sm"  @keydown.enter="addNewRow(index)" disabled/>
                </td>
                <td class="py-1 whitespace-nowrap">
                  <UInput v-model="row.rate" type="number" size="sm"  @keydown.enter="addNewRow(index)" disabled/>
                </td>
                <td class="py-1 whitespace-nowrap">
                  <UInput v-model="row.discount" type="number" size="sm"  @keydown.enter="addNewRow(index)"/>
                </td>
                <td class="py-1 whitespace-nowrap">
                  <UInput v-model="row.tax" type="number" size="sm" @keydown.enter="addNewRow(index)" disabled />
                </td>
                <td class="py-1 ps-2 whitespace-nowrap" :class="{'text-red-500': row.outOfStock}">
                  {{ row.outOfStock ? -row.value: row.value }}
                </td>
                <td>
                  <div class="py-1">
                    <UDropdown :items="action(row)">
                    <UButton
                            color="primary"
                            variant="ghost"
                            icon="i-heroicons-ellipsis-horizontal-20-solid"
                        />
                    </UDropdown>
                  </div>
                </td>
              </tr>
            </tbody>


          </table>
          
        </div>

        <!-- Other form elements -->
        <template #footer>
        <div v-if="!token" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 text-sm mt-4 justify-end items-end">
            <div class="mb-4">
              <label class="block  font-medium">Sub Total</label>
              <UInput :model-value="subtotal"  disabled />
            </div>
            <div class="mb-4">
              <label class="block  font-medium">Delivery fees</label>
              <UInput :model-value="bill?.deliveryFees"  disabled />
            </div>

            <div class="mb-4">
              <label class="block  font-medium">Discount %</label>
              <UInput ref="discountref"  type="number" v-model="discount"  @keydown.enter.prevent="handleEnterMainDiscount()" />
            </div>

            <div class="mb-4">
              <label class="block  font-medium">Tax %</label>
              <UInput type="number" :model-value="bill?.tax || 0" disabled/>
            </div>
            <div class="mb-4">
              <label class="block  text-primary font-medium">Grand Total</label>
              <UInput
                 :model-value="grandTotal + bill?.deliveryFees"
                type="number"
                disabled
                class="font-bold rounded-md border-2 border-primary-300"
                />
            </div>
            <div class="mb-4 p-1">
                 <UButton ref="packref" block @click="handlePack">Pack</UButton>
            </div>
   
         
        </div>
    </template>
      </UCard>
 
  </UDashboardPanelContent>
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