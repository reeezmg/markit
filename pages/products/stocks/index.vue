<template>
<UDashboardPanelContent class="pb-24">
   <UCard
            class="w-full"
            :ui="{
                base: '',
                divide: 'divide-y divide-gray-200 dark:divide-gray-700',
                header: { padding: 'px-4 py-5' },
                body: {
                    padding: '',
                    base: 'divide-y divide-gray-200 dark:divide-gray-700',
                },
                footer: { padding: 'p-4' },
            }"
        >
  
    <div class="grid md:grid-cols-3 gap-4 px-4 py-3">
      <USelect v-model="filters.category" :options="categories" option-attribute="name" value-attribute="id" placeholder="Filter by Category" />
      <USelect v-model="filters.brand" :options="brands" placeholder="Filter by Brand" />
      <USelect v-model="filters.rating" :options="ratings" placeholder="Filter by Rating" />
      <USelect v-model="filters.distributor" :options="distributors" option-attribute="name" value-attribute="id" placeholder="Filter by Distributor" />
      <UInput v-model="filters.startDate" type="date" placeholder="Start Date" />
      <UInput v-model="filters.endDate" type="date" placeholder="End Date" />
    </div>

<div class="flex justify-between px-4 py-3">
      <UInput
      v-model="search"
      icon="i-heroicons-magnifying-glass-20-solid"
      placeholder="Search"
    />

     <div class="flex space-x-2 items-center">
    <USelect v-model="groupBy" :options="groupOptions" placeholder="Group By" />
    <UButton
      class=" ms-3 "
      @click="resetFilters"
      type="button"
    >
      Reset
    </UButton>
  </div>

    </div>

   <UTable :rows="filteredStockData" :columns="columns" :loading="pending" />

 
  </UCard>
  </UDashboardPanelContent>
</template>

<script setup lang="ts">
const search = ref('')
const groupOptions = [
  { label: 'Product', value: 'product' },
  { label: 'Date', value: 'date' },
  { label: 'Category', value: 'category' },
  { label: 'Brand', value: 'brand' },
  { label: 'Rating', value: 'rating' },
  { label: 'Distributor', value: 'distributor' }
]


const groupBy = ref('product')

const filters = reactive({
  category: null,
  brand: null,
  rating: null,
  distributor: null,
  startDate: null,
  endDate: null
})

function resetFilters() {
  filters.category = null
  filters.brand = null
  filters.rating = null
  filters.distributor = null
  filters.startDate = null
  filters.endDate = null
  search.value = ''
  groupBy.value = 'product'
  refresh()
}


// Fetch aggregate stock data lazily
const { data: stockData, pending, refresh } = await useLazyAsyncData('stock-aggregate', () =>
  $fetch('/api/stock-aggregate', {
    method: 'POST',
    body: { filters: toRaw(filters), groupBy: groupBy.value }
  })
)

// Watch for any changes in filters or groupBy and refresh
watch([filters, groupBy], () => {
  refresh()
}, { deep: true })

const filteredStockData = computed(() => {
  if (!stockData.value) return []

  const key = groupBy.value
  return stockData.value.filter(item => {
    const fieldValue = item[key]?.toString().toLowerCase() || ''
    return fieldValue.includes(search.value.toLowerCase())
  })
})




const columns = computed(() => {
  const common = [
    { key: groupBy.value, label: groupOptions.find(opt => opt.value === groupBy.value)?.label || 'Group' },
    { key: 'qty', label: 'Total Qty' },
    { key: 'stock', label: 'Total Stock Value' }
  ]
  return common
})


// Fetch filter options
const { data: categories } = await useFetch('/api/options/categories')
const { data: brands } = await useFetch('/api/options/brands')
const { data: ratings } = await useFetch('/api/options/ratings')
const { data: distributors } = await useFetch('/api/options/distributors')
</script>
