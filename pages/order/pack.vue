
<script setup>
import { item } from '@unovis/ts/components/bullet-legend/style';
import { useFindUniqueTrynbuy,useUpdateItem, useFindUniqueItem,useUpdateTrynbuyCartItem } from '~/lib/hooks';

const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const route = useRoute();
const router = useRouter();
const UpdateTrynbuyCartItem = useUpdateTrynbuyCartItem()
const orderId = route.query.id;

const paymentMethod = ref('Cash');
const tokenEntries = ref([])
const packOtp = ref(null)

const qtyInputs = ref([]);
const barcodeInputs = ref([]);  
const packref = ref();


const items = ref([
  { id:'', variantId:'',name:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0,sizes:{}, totalQty:0, outOfStock:false, status: 'ORDER_RECEIVED' },
]);
const config = useRuntimeConfig();
const serverUrl = config.public.serverUrl


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

// Load existing pickup OTP if order is already packed (page refresh case)
watch(trynbuy, async (val) => {
  if (val?.orderStatus === 'PACKED' && !packOtp.value) {
    const companyId = useAuth().session.value?.companyId;
    const trynbuyId = val?.id;
    if (trynbuyId && companyId) {
      try {
        const res = await $fetch(`/api/pack/${trynbuyId}/otp?companyId=${companyId}`, { baseURL: serverUrl });
        if (res?.pickupOtp) packOtp.value = res.pickupOtp;
      } catch {}
    }
  }
}, { once: true })


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
        status: cartItem.status || 'ORDER_RECEIVED',
        outOfStock: cartItem.status === 'OUTOFSTOCK',
      }
    })
  },
  { deep: true, immediate: true }
)



const handleOutOfStock = async (row) => {
  if (row.outOfStock) return;

  await UpdateTrynbuyCartItem.mutateAsync({
    where: { id: row.id },
    data: { status: 'OUTOFSTOCK' },
  });

  const index = items.value.findIndex((item) => item.id === row.id);
  if (index !== -1) {
    items.value[index] = {
      ...items.value[index],
      outOfStock: true,
      status: 'OUTOFSTOCK',
    };
  }

  toast.add({
    title: 'Item marked out of stock',
    color: 'green',
  });
};

const handleInStock = async (row) => {
  if (!row.outOfStock) return;

  await UpdateTrynbuyCartItem.mutateAsync({
    where: { id: row.id },
    data: { status: 'ORDER_RECEIVED' },
  });

  const index = items.value.findIndex((item) => item.id === row.id);
  if (index !== -1) {
    items.value[index] = {
      ...items.value[index],
      outOfStock: false,
      status: 'ORDER_RECEIVED',
    };
  }

  toast.add({
    title: 'Item marked In stock',
    color: 'green',
  });
};




//pack all items

const handlePack = async () => {
  const clientId = trynbuy.value?.client?.id || null;
  const trynbuyId = trynbuy.value?.id || null;

  try {
    if (!trynbuyId) throw new Error("Missing Trynbuy ID");
    if (!items.value.length) throw new Error("No cart items found for this Trynbuy");

    await Promise.all(
      items.value.map(row =>
        UpdateTrynbuyCartItem.mutateAsync({
          where: { id: row.id },
          data: { status: row.outOfStock ? 'OUTOFSTOCK' : 'PACKED' },
        })
      )
    );

    if (trynbuyId && clientId) {
      const companyId = useAuth().session.value?.companyId;
      const response = await $fetch(`/api/pack/${trynbuyId}/${clientId}?companyId=${companyId}`, {
        baseURL: serverUrl,
      });
      if (response?.pickupOtp) {
        packOtp.value = response.pickupOtp;
      }
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
    { id: '', variantId: '', sn: 1, size: '', barcode: '', category: [], item: '', qty: 1, rate: 0, discount: 0, tax: 0, value: 0, sizes: {}, totalQty: 0, outOfStock: false, status: 'ORDER_RECEIVED' }
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
                  :class="[
                    'w-12 h-12 rounded-md object-cover border',
                    row.outOfStock ? 'border-red-500' : 'border-gray-200'
                  ]"
                />
              </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': row.outOfStock }">
                  <UInput v-model="row.barcode" ref="barcodeInputs"  size="sm" :class="{ 'oos-input': row.outOfStock }" />
                </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': row.outOfStock }">
                  <UInput v-model="row.name" size="sm" :class="{ 'oos-input': row.outOfStock }"  @keydown.enter="addNewRow(index)" disabled/>
                </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': row.outOfStock }">
                  <UInput v-model="row.qty"  ref="qtyInputs" type="number" size="sm" :class="{ 'oos-input': row.outOfStock }"  @keydown.enter="addNewRow(index)" disabled/>
                </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': row.outOfStock }">
                  <UInput v-model="row.rate" type="number" size="sm" :class="{ 'oos-input': row.outOfStock }"  @keydown.enter="addNewRow(index)" disabled/>
                </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': row.outOfStock }">
                  <UInput v-model="row.discount" type="number" size="sm" :class="{ 'oos-input': row.outOfStock }"  @keydown.enter="addNewRow(index)"/>
                </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': row.outOfStock }">
                  <UInput v-model="row.tax" type="number" size="sm" :class="{ 'oos-input': row.outOfStock }" @keydown.enter="addNewRow(index)" disabled />
                </td>
                <td class="py-1 ps-2 whitespace-nowrap" :class="{'text-red-500': row.outOfStock}">
                  {{ row.outOfStock ? -row.value: row.value }}
                </td>
                <td>
                  <div class="py-1">
                    <UButton
                      :color="row.outOfStock ? 'green' : 'red'"
                      variant="ghost"
                      :icon="row.outOfStock ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                      :title="row.outOfStock ? 'Mark in stock' : 'Mark out of stock'"
                      @click="row.outOfStock ? handleInStock(row) : handleOutOfStock(row)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>


          </table>
          
        </div>

        <!-- Other form elements -->
        <template #footer>

          <!-- Pickup OTP display -->
          <div v-if="packOtp" class="mb-4 w-full p-4 bg-amber-50 border border-amber-300 rounded-xl text-center">
            <p class="text-sm font-medium text-amber-700 mb-1">Pickup OTP for Delivery Person</p>
            <p class="text-4xl font-mono font-bold tracking-widest text-amber-900">{{ packOtp }}</p>
            <p class="text-xs text-amber-600 mt-1">Share this code with the delivery partner when they arrive</p>
          </div>

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

.oos-input :deep(input) {
  border-color: #ef4444 !important;
  color: #ef4444 !important;
}

.oos-input :deep(input::placeholder) {
  color: #ef4444 !important;
}
</style>

