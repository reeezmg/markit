<script setup lang="ts">
type Column = { key: string; label: string; sortable?: boolean }
const props = withDefaults(defineProps<{ rows: any[]; columns: Column[]; loading?: boolean; search?: string; searchPlaceholder?: string; emptyLabel?: string; emptyDescription?: string }>(), {
  search: '', searchPlaceholder: 'Search records', emptyLabel: 'No records found', emptyDescription: 'Try another search or adjust your filters.',
})
const emit = defineEmits<{ 'update:search': [value: string]; search: []; refresh: [] }>()
const page = ref(1), pageSize = ref(10), sort = ref({ column: '', direction: 'asc' as 'asc' | 'desc' })
const selectedColumns = ref([...props.columns])
watch(() => props.columns, columns => { selectedColumns.value = [...columns] })
watch(() => [props.search, props.rows, pageSize.value], () => { page.value = 1 })
const columns = computed(() => props.columns.filter(c => c.key === 'actions' || selectedColumns.value.some(s => s.key === c.key)))
const sorted = computed(() => {
  if (!sort.value.column) return props.rows
  const key = sort.value.column, direction = sort.value.direction === 'desc' ? -1 : 1
  return [...props.rows].sort((a, b) => {
    if(typeof a[key]==='number'&&typeof b[key]==='number')return (a[key]-b[key])*direction
    return String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { numeric: true }) * direction
  })
})
const paged = computed(() => sorted.value.slice((page.value - 1) * Number(pageSize.value), page.value * Number(pageSize.value)))
</script>
<template>
  <UCard class="w-full min-w-0" :ui="{ base: '', divide: 'divide-y divide-gray-200 dark:divide-gray-700', header: { padding: 'px-4 py-5' }, body: { padding: '', base: 'divide-y divide-gray-200 dark:divide-gray-700' }, footer: { padding: 'p-4' } }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <UInput :model-value="search" :placeholder="searchPlaceholder" :aria-label="searchPlaceholder" icon="i-heroicons-magnifying-glass-20-solid" class="w-full sm:w-72" @update:model-value="emit('update:search',String($event))" @keyup.enter="emit('search')"/>
          <slot name="filters"/>
        </div>
        <div class="flex flex-wrap items-center gap-2"><slot name="actions"/><UButton color="gray" variant="ghost" icon="i-heroicons-arrow-path" :loading="loading" aria-label="Refresh records" @click="emit('refresh')"/></div>
      </div>
    </template>
    <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div class="flex items-center gap-2"><span class="hidden text-sm text-gray-500 dark:text-gray-400 sm:inline">Rows per page:</span><USelect v-model="pageSize" :options="[10,20,50]" size="xs" class="w-20" aria-label="Rows per page"/></div>
      <div class="flex items-center gap-2"><slot name="tools"/><USelectMenu v-model="selectedColumns" :options="columns.length ? props.columns.filter(c=>c.key!=='actions') : props.columns" multiple option-attribute="label"><UButton color="gray" size="xs" icon="i-heroicons-view-columns">Columns</UButton></USelectMenu><UButton color="gray" size="xs" variant="ghost" :disabled="!search" icon="i-heroicons-x-mark" @click="emit('update:search','');emit('search')">Reset</UButton></div>
    </div>
    <UTable v-model:sort="sort" :rows="paged" :columns="columns" :loading="loading" sort-mode="manual" :empty-state="{icon:'i-heroicons-inbox',label:emptyLabel}" class="w-full">
      <template v-for="name in Object.keys($slots).filter(name=>name.endsWith('-data')||name==='expand')" #[name]="data"><slot :name="name" v-bind="data || {}"/></template>
      <template #empty-state><div class="py-10 text-center"><UIcon name="i-heroicons-inbox" class="mx-auto mb-3 h-8 w-8 text-gray-400"/><p class="text-sm font-medium text-gray-900 dark:text-white">{{emptyLabel}}</p><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{emptyDescription}}</p><div class="mt-4"><slot name="empty-actions"/></div></div></template>
    </UTable>
    <template #footer><div class="flex flex-wrap items-center justify-between gap-3"><p class="text-sm text-gray-500 dark:text-gray-400">Showing <span class="font-medium">{{rows.length?(page-1)*Number(pageSize)+1:0}}</span>–<span class="font-medium">{{Math.min(page*Number(pageSize),rows.length)}}</span> of <span class="font-medium">{{rows.length}}</span></p><UPagination v-model="page" :page-count="Number(pageSize)" :total="rows.length" :max="5"/></div></template>
  </UCard>
</template>
