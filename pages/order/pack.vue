
<script setup>
import { item } from '@unovis/ts/components/bullet-legend/style';
import { useFindUniqueTrynbuy,useUpdateItem, useFindUniqueItem,useUpdateTrynbuyCartItem } from '~/lib/hooks';

const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const route = useRoute();
const router = useRouter();
const UpdateTrynbuyCartItem = useUpdateTrynbuyCartItem()
const UpdateItem = useUpdateItem()
const orderId = route.query.id;

// Out-of-stock modal state
const oosModalOpen = ref(false)
const oosModalRow = ref(null)
const oosModalStep = ref(null) // 'updateStock' | 'assignOos' | null
const oosLoading = ref(false)
const cancelModalOpen = ref(false)
const cancelReason = ref('')
const cancelLoading = ref(false)

// Format any numeric value to 2 decimal places for display.
const fmt2 = (n) => (Number(n) || 0).toFixed(2)

// Order-status gating for the Pack page
const STATUS_RANK = {
  ORDER_RECEIVED: 10,
  PACKED: 20,
  PICKED: 30,
  DELIVERED: 40,
  DECISION_DONE: 50,
  RETURNED: 60,
  COMPLETED: 70,
  CANCELLED: 100,
}
const statusRank = (s) => STATUS_RANK[String(s || '').toUpperCase()] || 0
const orderStatus = computed(() => trynbuy.value?.orderStatus || '')
const isPickedOrLater = computed(() => statusRank(orderStatus.value) >= STATUS_RANK.PICKED)
const isDecisionDoneOrLater = computed(() => statusRank(orderStatus.value) >= STATUS_RANK.DECISION_DONE)
// Show "returned" red highlight only when the order has reached DECISION_DONE and this row was returned
const isReturnedHighlighted = (row) => isDecisionDoneOrLater.value && !!row.isReturned
// Unified "row should be displayed in red" — out-of-stock OR returned-after-decision
const isRowRed = (row) => row.outOfStock || isReturnedHighlighted(row)

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

const getCurrentCompanyId = () => useAuth().session.value?.companyId || null
const getCurrentClientId = () => trynbuy.value?.client?.id || null


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
  { key: 'stock', label: 'STOCK' },
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
      pickupOtps: true,
      deliveryOtp: true,

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
              qty: true,
            },
          },
        },
      },

      // ✅ Returned items (filtered to this company) — used to flag rows after DECISION_DONE
      returnedItems: {
        where: {
          variant: {
            product: {
              companyId: {
                equals: companyId,
              },
            },
          },
        },
        select: {
          id: true,
          itemId: true,
          variantId: true,
          quantity: true,
        },
      },
    },
  }
})

const { data: trynbuy, refetch: trynbuyRefetch } = useFindUniqueTrynbuy(trynbuyArgs)

// Always render the saved OTP from DB on page open / reload.
// pickup_otps is per-store (set when this store clicks Pack); delivery_otp is
// generated at order creation and used when the delivery partner finalises drop-off.
watchEffect(() => {
  const companyId = useAuth().session.value?.companyId
  const fromDb = trynbuy.value?.pickupOtps?.[companyId] || trynbuy.value?.deliveryOtp
  if (fromDb) packOtp.value = fromDb
})


// ✅ Map cartItems instead of entries
watch(
  () => trynbuy.value,
  (newData) => {
    if (!newData || !newData.cartItems) return
    console.log(trynbuy)
    const returned = Array.isArray(newData.returnedItems) ? newData.returnedItems : []
    const returnedItemIds = new Set(returned.map(r => r.itemId).filter(Boolean))

    items.value = newData.cartItems.map((cartItem, index) => {
      const variant = cartItem.variant || {}
      const item = cartItem.item || {}

      const baseRate = variant.sprice || 0
      const qty = cartItem.quantity || 1
      // Match billing convention: discount = dprice − sprice (absolute amount, can be negative)
      const discount = (variant.dprice ?? 0) - (variant.sprice ?? 0)
      const tax = variant.tax || 0

      let value = qty * baseRate
      if (discount > 0) value -= (value * discount) / 100
      // if (tax > 0) value += (value * tax) / 100

      return {
        id: cartItem.id,
        variantId: variant.id,
        itemId: item.id || null,
        sn: index + 1,
        name: `${variant.product?.name}-${variant.name}` || '',
        barcode: item.barcode || '',
        size: item.size || '',
        qty,
        stock: Number(item.qty ?? 0),
        rate: baseRate,
        discount,
        tax,
        value,
        image: variant.images?.[0] || null,
        status: cartItem.status || 'ORDER_RECEIVED',
        outOfStock: cartItem.status === 'OUTOFSTOCK',
        isReturned: returnedItemIds.has(item.id),
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

  await notifyMarketplaceAndDelivery()
};

// Open the out-of-stock modal — if stock > 0 we ask to zero it first,
// otherwise we go straight to the OOS assignment confirmation.
const openOosModal = (row) => {
  if (row.outOfStock) return
  oosModalRow.value = row
  oosModalStep.value = (Number(row.stock) || 0) > 0 ? 'updateStock' : 'assignOos'
  oosModalOpen.value = true
}

const closeOosModal = () => {
  oosModalOpen.value = false
  oosModalStep.value = null
  oosModalRow.value = null
  oosLoading.value = false
}

const confirmUpdateStock = async (yes) => {
  const row = oosModalRow.value
  if (!row) return
  if (yes && row.itemId) {
    try {
      oosLoading.value = true
      await UpdateItem.mutateAsync({
        where: { id: row.itemId },
        data: { qty: 0 },
      })
      const idx = items.value.findIndex(it => it.id === row.id)
      if (idx !== -1) items.value[idx].stock = 0
      toast.add({ title: 'Stock updated to 0', color: 'green' })
    } catch (err) {
      console.error(err)
      toast.add({ title: 'Failed to update stock', color: 'red' })
      oosLoading.value = false
      return
    }
    oosLoading.value = false
  }
  oosModalStep.value = 'assignOos'
}

const confirmAssignOos = async (yes) => {
  const row = oosModalRow.value
  if (yes && row) {
    oosLoading.value = true
    await handleOutOfStock(row)
    oosLoading.value = false
  }
  closeOosModal()
}

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

  await notifyMarketplaceAndDelivery()
};

const notifyMarketplaceAndDelivery = async () => {
  const clientId = getCurrentClientId()
  const trynbuyId = trynbuy.value?.id || null

  if (!clientId || !trynbuyId) return

  try {
    await $fetch(`/api/pack/${trynbuyId}/${clientId}`, {
      baseURL: serverUrl,
    })
  } catch (error) {
    console.error('Failed to sync pack update', error)
  }
}

const openCancelModal = () => {
  cancelReason.value = ''
  cancelModalOpen.value = true
}

const closeCancelModal = () => {
  if (cancelLoading.value) return
  cancelModalOpen.value = false
  cancelReason.value = ''
}




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
          data: { status: row.outOfStock ? 'OUTOFSTOCK' : 'ORDER_RECEIVED' },
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
      title: 'Store packed status saved & client notified',
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

const handleCancelStore = async () => {
  const clientId = getCurrentClientId()
  const trynbuyId = trynbuy.value?.id || null
  const companyId = getCurrentCompanyId()
  const reason = cancelReason.value.trim()

  if (!clientId || !trynbuyId || !companyId) {
    toast.add({
      title: 'Missing order details for cancellation',
      color: 'red',
    })
    return
  }

  if (!reason) {
    toast.add({
      title: 'Cancellation reason is required',
      color: 'red',
    })
    return
  }

  try {
    cancelLoading.value = true
    const response = await $fetch(`/api/pack/${trynbuyId}/${clientId}/cancel-store`, {
      method: 'POST',
      baseURL: serverUrl,
      body: {
        companyId,
        reason,
      },
    })

    toast.add({
      title: response?.partialCancellation
        ? 'This store was cancelled. Remaining stores stay active.'
        : 'Order cancelled successfully.',
      color: 'green',
    })

    closeCancelModal()
    await trynbuyRefetch()
    router.push('/order/trynbuy')
  } catch (error) {
    console.error(error)
    toast.add({
      title: error?.data?.error || error?.message || 'Unable to cancel this store',
      color: 'red',
    })
  } finally {
    cancelLoading.value = false
  }
}






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
                    isRowRed(row) ? 'border-red-500' : 'border-gray-200'
                  ]"
                />
              </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': isRowRed(row) }">
                  <UInput v-model="row.barcode" ref="barcodeInputs"  size="sm" :class="{ 'oos-input': isRowRed(row) }" />
                </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': isRowRed(row) }">
                  <UInput v-model="row.name" size="sm" :class="{ 'oos-input': isRowRed(row) }"  @keydown.enter="addNewRow(index)" disabled/>
                </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': isRowRed(row) }">
                  <UInput v-model="row.qty"  ref="qtyInputs" type="number" size="sm" :class="{ 'oos-input': isRowRed(row) }"  @keydown.enter="addNewRow(index)" disabled/>
                </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': isRowRed(row) }">
                  <UInput :model-value="fmt2(row.rate)" type="text" size="sm" :class="{ 'oos-input': isRowRed(row) }"  @keydown.enter="addNewRow(index)" disabled/>
                </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': isRowRed(row) }">
                  <UInput
                    :model-value="row.discount"
                    type="number"
                    step="0.01"
                    size="sm"
                    :class="{ 'oos-input': isRowRed(row) }"
                    @update:model-value="v => row.discount = Number(v) || 0"
                    @blur="row.discount = Number(fmt2(row.discount))"
                    @keydown.enter="addNewRow(index)"
                  />
                </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': isRowRed(row) }">
                  <UInput :model-value="fmt2(row.tax)" type="text" size="sm" :class="{ 'oos-input': isRowRed(row) }" @keydown.enter="addNewRow(index)" disabled />
                </td>
                <td class="py-1 whitespace-nowrap" :class="{ 'text-red-500': isRowRed(row) }">
                  <UInput
                    :model-value="row.stock"
                    type="number"
                    size="sm"
                    :class="{ 'oos-input': isRowRed(row) || row.stock <= 0 }"
                    disabled
                  />
                </td>
                <td class="py-1 ps-2 whitespace-nowrap" :class="{'text-red-500': isRowRed(row)}">
                  {{ row.outOfStock ? '-' + fmt2(row.value) : fmt2(row.value) }}
                </td>
                <td>
                  <div v-if="!isPickedOrLater" class="py-1">
                    <UButton
                      :color="row.outOfStock ? 'green' : 'red'"
                      variant="ghost"
                      :icon="row.outOfStock ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                      :title="row.outOfStock ? 'Mark in stock' : 'Mark out of stock'"
                      @click="row.outOfStock ? handleInStock(row) : openOosModal(row)"
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

          <div class="mb-4 w-full p-1 flex justify-between gap-3">
            <UButton
              color="red"
              variant="solid"
              icon="i-heroicons-x-circle"
              @click="openCancelModal"
            >
              Cancel
            </UButton>
            <UButton
              ref="packref"
              icon="i-heroicons-clipboard-document-check"
              :disabled="isPickedOrLater"
              @click="handlePack"
            >
              Pack
            </UButton>
          </div>

        
    </template>
      </UCard>

      <!-- Out-of-stock confirmation modal -->
      <UModal v-model="oosModalOpen" :prevent-close="oosLoading">
        <UCard
          :ui="{
            ring: '',
            divide: 'divide-y divide-gray-100 dark:divide-gray-800',
          }"
        >
          <template #header>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">
              {{ oosModalStep === 'updateStock' ? 'Update product stock?' : 'Mark out of stock?' }}
            </h3>
          </template>

          <div v-if="oosModalRow" class="space-y-2 text-sm">
            <p class="text-gray-700 dark:text-gray-300">
              <span class="font-medium">{{ oosModalRow.name }}</span>
              <span v-if="oosModalRow.barcode" class="text-gray-500"> · {{ oosModalRow.barcode }}</span>
            </p>

            <p v-if="oosModalStep === 'updateStock'" class="text-gray-600 dark:text-gray-400">
              Current stock is <span class="font-semibold text-gray-900 dark:text-white">{{ oosModalRow.stock }}</span>.
              Do you want to update this product item's qty to 0?
            </p>
            <p v-else class="text-gray-600 dark:text-gray-400">
              Assign this item as out of stock for this order?
            </p>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <template v-if="oosModalStep === 'updateStock'">
                <UButton
                  color="gray"
                  variant="outline"
                  :disabled="oosLoading"
                  @click="confirmUpdateStock(false)"
                >
                  No
                </UButton>
                <UButton
                  color="primary"
                  :loading="oosLoading"
                  @click="confirmUpdateStock(true)"
                >
                  Yes
                </UButton>
              </template>
              <template v-else>
                <UButton
                  color="gray"
                  variant="outline"
                  :disabled="oosLoading"
                  @click="confirmAssignOos(false)"
                >
                  No
                </UButton>
                <UButton
                  color="red"
                  :loading="oosLoading"
                  @click="confirmAssignOos(true)"
                >
                  Yes
                </UButton>
              </template>
            </div>
          </template>
        </UCard>
      </UModal>

      <UModal v-model="cancelModalOpen" :prevent-close="cancelLoading">
        <UCard
          :ui="{
            ring: '',
            divide: 'divide-y divide-gray-100 dark:divide-gray-800',
          }"
        >
          <template #header>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">
              Cancel store from this order?
            </h3>
          </template>

          <div class="space-y-4 text-sm">
            <p class="text-gray-600 dark:text-gray-400">
              This will cancel only this store's items. If this is the last active store, the full order will be cancelled.
            </p>

            <div class="rounded-lg border border-red-200 bg-red-50 p-3">
              <div class="text-xs font-medium uppercase tracking-wide text-red-700">Fixed penalty</div>
              <div class="mt-1 text-lg font-semibold text-red-900">Rs 50</div>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Cancellation reason
              </label>
              <UTextarea
                v-model="cancelReason"
                :rows="4"
                placeholder="Enter the cancellation reason"
              />
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="gray"
                variant="outline"
                :disabled="cancelLoading"
                @click="closeCancelModal"
              >
                Back
              </UButton>
              <UButton
                color="red"
                :loading="cancelLoading"
                @click="handleCancelStore"
              >
                Confirm Cancel
              </UButton>
            </div>
          </template>
        </UCard>
      </UModal>

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

