<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; product: any }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const scope = useCompanyScope()
const router = useRouter()
const search = ref('')
const orders = ref<any[]>([])
const loading = ref(false)
const error = ref('')
let request = 0
let timer: ReturnType<typeof setTimeout> | undefined
async function load() {
  const generation = ++request
  if (!open.value || !props.product?.companyId) return
  loading.value = true
  error.value = ''
  try {
    const result = await scope.fetch<any[]>('/api/purchaseorder/options', {
      headers: { 'x-company-id': props.product.companyId }, query: { search: search.value },
    })
    if (generation === request) orders.value = result
  } catch (e: any) {
    if (generation === request) { orders.value = []; error.value = e?.data?.statusMessage || 'Could not load purchase orders' }
  } finally { if (generation === request) loading.value = false }
}
watch([open, () => props.product?.id], () => { search.value = ''; orders.value = []; load() }, { immediate: true })
watch(search, () => { ++request; orders.value = []; clearTimeout(timer); timer = setTimeout(load, 250) })
onBeforeUnmount(() => { ++request; clearTimeout(timer) })
async function selectOrder(order: any) {
  await router.push({ path: '/products/add', query: {
    from: 'distributor-purchase-order', poId: order.id, isEdit: 'true',
    productId: props.product.id, entryCompany: props.product.companyId, returnTo: '/products',
  } })
  open.value = false
}
</script>

<template>
  <UModal v-model="open">
    <UCard>
      <template #header><h2 class="font-semibold">Link to Purchase order</h2></template>
      <div class="space-y-3">
        <p class="text-sm">Choose a purchase order for {{ product?.name || 'this product' }}. Review it and save to confirm the link.</p>
        <UInput v-model="search" placeholder="Search PO number, supplier or bill" icon="i-heroicons-magnifying-glass" />
        <p v-if="loading" class="text-sm text-gray-500">Loading purchase orders…</p>
        <div v-else-if="error" class="text-sm text-red-500">{{ error }} <UButton label="Retry" variant="link" @click="load" /></div>
        <ul v-else class="max-h-80 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-800">
          <li v-for="order in orders" :key="order.id" class="py-2">
            <UButton color="gray" variant="ghost" class="w-full justify-start" @click="selectOrder(order)">
              PO-{{ order.purchaseOrderNo ?? '—' }} · {{ order.distributorName || 'Unassigned supplier' }} <span v-if="order.billNo"> · {{ order.billNo }}</span>
            </UButton>
          </li>
          <li v-if="!orders.length" class="text-sm text-gray-500 py-2">No purchase orders found.</li>
        </ul>
      </div>
      <template #footer><UButton label="Cancel" color="gray" variant="soft" @click="open = false" /></template>
    </UCard>
  </UModal>
</template>
