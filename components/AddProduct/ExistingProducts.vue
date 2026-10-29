<script setup lang="ts">
const props = defineProps<{ excludedIds: string[]; disabled?: boolean }>()
const emit = defineEmits<{ selected: [product: any] }>()
const scope = useCompanyScope()
const search = ref('')
const open = ref(false)
const choices = ref<any[]>([])
const loading = ref(false)
const error = ref('')
let request = 0
let timer: ReturnType<typeof setTimeout> | undefined
const options = computed(() => choices.value.filter(p => !props.excludedIds.includes(p.id)))
async function load() {
  const generation = ++request
  loading.value = true
  error.value = ''
  try {
    const rows = await scope.fetch<any[]>('/api/products/unassigned', { query: { search: search.value } })
    if (generation === request) choices.value = rows
  } catch (e: any) {
    if (generation === request) { choices.value = []; error.value = e?.data?.statusMessage || 'Could not load products' }
  } finally {
    if (generation === request) loading.value = false
  }
}
watch([search, scope.companyId], () => {
  ++request
  choices.value = []
  clearTimeout(timer)
  timer = setTimeout(load, 250)
})
onMounted(load)
onBeforeUnmount(() => { ++request; clearTimeout(timer) })
watch(() => props.disabled, disabled => {
  if (disabled) open.value = false
})

function selectProduct(product: any, close: () => void) {
  emit('selected', product)
  close()
}
</script>

<template>
  <UPopover
    v-model:open="open"
    class="w-full sm:w-80"
    :disabled="disabled"
    :popper="{ placement: 'bottom-start' }"
  >
    <UInput
      v-model="search"
      class="w-full"
      placeholder="Search product name or product no"
      icon="i-heroicons-magnifying-glass"
      :disabled="disabled"
      @focus="open = true"
    />

    <template #panel="{ close }">
      <div class="w-80 max-w-[calc(100vw-2rem)] p-2">
        <p v-if="loading" class="px-2 py-3 text-sm text-gray-500">Loading products…</p>
        <div v-else-if="error" class="px-2 py-3 text-sm text-red-500">
          {{ error }}
          <UButton label="Retry" variant="link" @click="load" />
        </div>
        <ul v-else class="max-h-64 divide-y divide-gray-200 overflow-y-auto dark:divide-gray-800">
          <li v-for="product in options" :key="product.id" class="flex items-center justify-between gap-2 px-2 py-2">
            <div class="min-w-0 text-sm">
              <p class="truncate font-medium">{{ product.name || product.categoryName || 'Product' }}</p>
              <p class="text-xs text-gray-500">
                PROD-{{ product.productNo ?? '—' }}
                <span v-if="product.brandName"> · {{ product.brandName }}</span>
              </p>
            </div>
            <UButton
              label="Add"
              size="xs"
              variant="soft"
              :disabled="disabled"
              @click="selectProduct(product, close)"
            />
          </li>
          <li v-if="!options.length" class="px-2 py-3 text-sm text-gray-500">
            No unassigned products found.
          </li>
        </ul>
        <p class="border-t border-gray-200 px-2 pt-2 text-xs text-gray-500 dark:border-gray-800">
          The product is linked only after you save the purchase order.
        </p>
      </div>
    </template>
  </UPopover>
</template>
