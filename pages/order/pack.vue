
<script setup>
import { item } from '@unovis/ts/components/bullet-legend/style';
import { useFindUniqueTrynbuy,useUpdateItem, useFindUniqueItem,useUpdateEntry,useUpdateTrynbuyCartItem } from '~/lib/hooks';

const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const route = useRoute();
const router = useRouter();
const UpdateEntry = useUpdateEntry()
const UpdateTrynbuyCartItem = useUpdateTrynbuyCartItem()
const orderId = route.query.id;

const paymentMethod = ref('Cash');
const tokenEntries = ref([])

const qtyInputs = ref([]);
const barcodeInputs = ref([]);  
const packref = ref();


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
  { key: 'image', label: 'IMAGE' },
  { key: 'barcode', label: 'BAR CODE' },
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

// ✅ Replace trynbuy with Trynbuy
const trynbuyArgs = computed(() => {
  const companyId = useAuth().session.value?.companyId

  return {
    where: { id: orderId },
    select: {
      id: true,
      createdAt: true,
      orderNumber: true,
      subtotal: true,
      productDiscount: true,
      totalDiscount: true,
      shipping: true,
      deliveryType: true,
      deliveryTime: true,
      orderStatus: true,

      // ✅ Delivery location details
      location: {
        select: {
          name: true,
          formattedAddress: true,
          houseDetails: true,
        },
      },

      // ✅ Client details
      client: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },

      // ✅ Cart items (filtered by current company)
      cartItems: {
        where: {
          variant: {
            product: {
              companyId: {
                equals: companyId, // ✅ safer & explicit Prisma filter
              },
            },
          },
        },
        select: {
          id: true,
          quantity: true,
          status: true,
          // ✅ Variant details
          variant: {
            select: {
              id: true,
              name: true,
              images: true,
              sprice: true,
              dprice: true,
              tax: true,
              discount: true,
              product: {
                select: {
                  name: true,
                  company: {
                    select: {
                      id: true,
                      name: true,
                      logo: true,
                    },
                  },
                },
              },
            },
          },

          // ✅ Item details
          item: {
            select: {
              id: true,
              barcode: true,
              size: true,
            },
          },
        },
      },
    },
  }
})

const { data: trynbuy, refetch: trynbuyRefetch } = useFindUniqueTrynbuy(trynbuyArgs)


// ✅ Map cartItems instead of entries
watch(
  () => trynbuy.value,
  (newData) => {
    if (!newData || !newData.cartItems) return
    console.log(trynbuy)
    items.value = newData.cartItems.map((cartItem, index) => {
      const variant = cartItem.variant || {}
      const item = cartItem.item || {}

      const baseRate = variant.sprice || 0
      const qty = cartItem.quantity || 1
      const discount = variant.discount || 0
      const tax = variant.tax || 0

      let value = qty * baseRate
      if (discount > 0) value -= (value * discount) / 100
      // if (tax > 0) value += (value * tax) / 100

      return {
        id: cartItem.id,
        variantId: variant.id,
        sn: index + 1,
        name: `${variant.product?.name}-${variant.name}` || '',
        barcode: item.barcode || '',
        size: item.size || '',
        qty,
        rate: baseRate,
        discount,
        tax,
        value,
        image: variant.images?.[0] || null,
        outOfStock: false, // no direct field in cartItem, so manual
      }
    })
  },
  { deep: true, immediate: true }
)



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

//pack all items

const handlePack = async () => {
  const allOutOfStock = items.value.every(item => item.outOfStock);
  const clientId = trynbuy.value?.client?.id || null;
  const trynbuyId = trynbuy.value?.id || null;

  try {
    if (!trynbuyId) throw new Error("Missing Trynbuy ID");

    // 1️⃣ Collect all cart item IDs from the Trynbuy
    const cartItemIds = trynbuy.value?.cartItems?.map(ci => ci.id) || [];

    if (!cartItemIds.length) throw new Error("No cart items found for this Trynbuy");

    // 2️⃣ Update all cart items in one mutation
    await Promise.all(
      cartItemIds.map(id =>
        UpdateTrynbuyCartItem.mutateAsync({
          where: { id },
          data: { status: 'PACKED' },
        })
      )
    );

    // 3️⃣ Optionally notify backend to emit socket event
    if (trynbuyId && clientId) {
      await $fetch(`/api/pack/${trynbuyId}/${clientId}`, {
        baseURL: 'http://localhost:3005', // ✅ Adjust for production
      });
    }

    toast.add({
      title: 'All items marked as packed & client notified',
      color: 'green',
    });

  } catch (err) {
    console.error(err);
    toast.add({
      title: 'Something went wrong while packing',
      color: 'red',
    });
  }
};






const handleSave = async () => {
  try {
   

   

  } catch (error) {
    console.error('Error creating trynbuy', error);
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

                   <!-- Order Number  -->
                    <div class="flex flex-col ">
                    <span class="text-gray-500">Order #</span>
                    <span class="font-medium">{{ trynbuy?.orderNumber }} </span>
                    </div>

                     <!-- Delivery Date -->
                     <div class="flex flex-col w-fit">
                    <span class="text-gray-500">Ordered Time</span>
                    <span class="font-medium">{{ trynbuy?.createdAt?.toLocaleString('en-GB', {
                dateStyle: 'short',
                timeStyle: 'short',
                })}}</span>
                    </div>
                     <div class="flex flex-col w-fit">
                    <span class="text-gray-500">Delivery Time</span>
                    <span class="font-medium">{{ trynbuy?.deliveryTime?.toLocaleString('en-GB', {
                dateStyle: 'short',
                timeStyle: 'short',
                })}}</span>
                    </div>

                    <!-- Customer Name  -->
                    <div class="flex flex-col ">
                    <span class="text-gray-500">Name</span>
                    <span class="font-medium">{{ trynbuy?.client?.name ? trynbuy?.client?.name :'-' }} </span>
                    </div>

                    <!-- Customer Phone -->
                    <div class="flex flex-col ">
                    <span class="text-gray-500">Phone</span>
                    <span class="font-medium">{{ trynbuy?.client?.phone ? trynbuy?.client?.phone : '-' }} </span>
                    </div>

                    <!-- Customer Address -->
                    <UPopover mode="hover">
                            <div class="flex flex-col ">
                    <span class="text-gray-500">Address</span>
                    <span class="font-medium">{{ trynbuy?.location?.houseDetails || trynbuy?.location?.name }} </span>
                    </div>
                        <template #panel>
                            <div class="flex flex-col p-3">
                                <span>{{trynbuy?.location?.formattedAddress}}</span>
                            </div>
                        </template>
                      </UPopover>

                 <!-- Note -->
                 <UPopover mode="hover">
                            <div class="flex flex-col ">
                    <span class="text-gray-500">Note</span>
                    <span class="font-medium truncate">{{ trynbuy?.notes ? trynbuy?.notes :' N/A' }} </span>
                    </div>
                        <template v-if="trynbuy?.notes" #text>
                            <span>{{ trynbuy?.notes }}</span>
                        </template>
                      </UPopover>
                
                   

                    <!-- Order Type -->
                    <div class="flex flex-col ">
                    <span class="text-gray-500">Order Status</span>
                    <UBadge
                size="sm"
                color="blue"
                :ui="{
                        base:'inline-flex justify-center items-center w-fit'
                    }"
                variant="subtle"
                class="text-center"
                >
                {{ trynbuy?.orderStatus }}
                </UBadge>
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
                <img
                  v-if="row.image"
                  :src="`https://images.markit.co.in/${row.image}`"
                  class="w-12 h-12 rounded-md object-cover border"
                />
              </td>
                <td class="py-1 whitespace-nowrap">
                  <UInput v-model="row.barcode" ref="barcodeInputs"  size="sm" />
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
        
          <div class="mb-4 w-full p-1 flex justify-end">
            <UButton
              ref="packref"
              icon="i-heroicons-clipboard-document-check"
              @click="handlePack"
            >
              Pack
            </UButton>
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