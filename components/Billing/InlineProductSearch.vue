<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { billingErrorMessage } from '~/utils/billing-error'
import { quoteProductSearchFields, isQuoteProductSearchField, type QuoteProductSearchField } from '~/utils/quote-product-search'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ selected: [product: any] }>()
const scope = useCompanyScope()
const root = ref<HTMLElement | null>(null)
const query = ref('')
const field = ref<QuoteProductSearchField>('all')
const products = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const open = ref(false)
const storageKey = 'erp:billing-product-search-field:v1'
let preferenceReady = false
let timer: ReturnType<typeof setTimeout> | undefined
let requestToken = 0

const placeholder = computed(() => field.value === 'all'
  ? 'Search products across all fields'
  : `Search by ${quoteProductSearchFields.find(option => option.value === field.value)!.label.toLowerCase()}`)

watch(field, value => {
  if (preferenceReady) try { localStorage.setItem(storageKey, value) } catch { /* Storage is optional. */ }
})

watch([query, field, () => props.disabled, scope.companyId], ([value, searchField, disabled]) => {
  clearTimeout(timer)
  const token = ++requestToken
  products.value = []; error.value = ''; loading.value = false
  if (!value.trim() || disabled) return
  loading.value = true
  timer = setTimeout(async () => {
    try {
      const result = await scope.fetch<any[]>('/api/bill/searchItems', { query: { q: value, limit: 5, field: searchField } })
      if (token === requestToken) products.value = result
    } catch (cause) {
      if (token === requestToken) error.value = billingErrorMessage(cause, 'Could not search products. Try again.')
    } finally {
      if (token === requestToken) loading.value = false
    }
  }, 250)
}, { flush: 'sync' })

function clearSearch() {
  query.value = ''
  open.value = false
}

function selectProduct(product: any) {
  if (props.disabled) return
  clearSearch()
  emit('selected', product)
}

function handleFocusOut(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) open.value = false
}

onMounted(() => {
  try {
    const saved = localStorage.getItem(storageKey)
    if (isQuoteProductSearchField(saved)) field.value = saved
  } catch { /* Default to all fields when storage is unavailable. */ }
  preferenceReady = true
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  requestToken++
})
</script>

<template>
  <div ref="root" class="relative min-w-0" @focusin="open = true" @focusout="handleFocusOut" @keydown.esc="clearSearch">
    <div class="flex min-w-0 gap-2">
      <USelect v-model="field" :options="[...quoteProductSearchFields]" :disabled="disabled" aria-label="Product search field" class="w-32 shrink-0" />
      <UInput
        v-model="query"
        :loading="loading"
        :disabled="disabled"
        icon="i-heroicons-magnifying-glass"
        :placeholder="placeholder"
        aria-label="Search products"
        class="min-w-0 flex-1"
        autocomplete="off"
        @keydown.enter.prevent="products.length === 1 && selectProduct(products[0])"
      />
    </div>
    <div v-if="open && query.trim() && !disabled" class="absolute right-0 z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
      <button v-for="product in products" :key="product.id" type="button" class="block w-full rounded px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 dark:hover:bg-gray-800 dark:focus:bg-gray-800" @mousedown.prevent @click="selectProduct(product)">
        <span class="block font-medium">{{ product.variant.product?.name }} {{ product.variant.name }}</span>
        <span class="text-xs text-gray-500">{{ product.barcode }} · {{ product.size }} · ₹{{ Number(product.variant.sprice || 0).toFixed(2) }}</span>
        <span class="block text-xs text-gray-500">{{ [...new Set([product.variant.brand?.name, product.variant.product?.brand?.name, product.variant.product?.category?.name, product.variant.product?.collection?.name].filter(Boolean))].join(' · ') }}</span>
      </button>
      <p v-if="loading" role="status" class="px-3 py-2 text-xs text-gray-500">Searching products...</p>
      <p v-else-if="error" role="alert" class="px-3 py-2 text-xs text-red-500">{{ error }}</p>
      <p v-else-if="!products.length" role="status" class="px-3 py-2 text-xs text-gray-500">No in-stock products found.</p>
    </div>
  </div>
</template>
