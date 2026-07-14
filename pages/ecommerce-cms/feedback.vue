<script setup lang="ts">
type ClientOption = {
  id: string
  name?: string
  email?: string
  phone?: string
}

type FeedbackRow = {
  id: string
  clientId?: string | null
  customerName: string
  clientEmail?: string | null
  clientPhone?: string | null
  title: string
  message: string
  rating: number
  sortOrder: number
  status: boolean
}

const toast = useToast()

const { data: feedback, pending, refresh } = await useFetch<FeedbackRow[]>('/api/ecommerce-cms/feedback', {
  default: () => [],
})

const { data: clients } = await useFetch<ClientOption[]>('/api/ecommerce-cms/feedback/clients', {
  default: () => [],
})

const form = reactive({
  id: '',
  clientId: '',
  customerName: '',
  title: '',
  message: '',
  rating: 5,
  sortOrder: 0,
  status: true,
})

const isSaving = ref(false)
const showForm = ref(false)
const editing = computed(() => !!form.id)

function resetForm() {
  form.id = ''
  form.clientId = ''
  form.customerName = ''
  form.title = ''
  form.message = ''
  form.rating = 5
  form.sortOrder = (feedback.value?.length || 0) + 1
  form.status = true
}

function openNew() {
  resetForm()
  showForm.value = true
}

function edit(row: FeedbackRow) {
  form.id = row.id
  form.clientId = row.clientId || ''
  form.customerName = row.customerName
  form.title = row.title
  form.message = row.message
  form.rating = row.rating
  form.sortOrder = row.sortOrder
  form.status = row.status
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  resetForm()
}

function clientLabel(client: ClientOption) {
  return [client.name, client.email, client.phone].filter(Boolean).join(' · ')
}

async function save() {
  if (!form.title.trim() || !form.message.trim()) {
    toast.add({ title: 'Title and message are required', color: 'red' })
    return
  }
  if (!form.clientId && !form.customerName.trim()) {
    toast.add({ title: 'Select a client or enter a customer name', color: 'red' })
    return
  }

  isSaving.value = true
  try {
    const body = {
      clientId: form.clientId || null,
      customerName: form.customerName,
      title: form.title,
      message: form.message,
      rating: Number(form.rating || 5),
      sortOrder: Number(form.sortOrder || 0),
      status: form.status,
    }

    if (form.id) {
      await $fetch(`/api/ecommerce-cms/feedback/${form.id}`, { method: 'PUT', body })
      toast.add({ title: 'Feedback updated' })
    } else {
      await $fetch('/api/ecommerce-cms/feedback', { method: 'POST', body })
      toast.add({ title: 'Feedback added' })
    }

    showForm.value = false
    resetForm()
    await refresh()
  } catch (error: any) {
    toast.add({
      title: 'Unable to save feedback',
      description: error?.data?.statusMessage || error?.message,
      color: 'red',
    })
  } finally {
    isSaving.value = false
  }
}

async function toggle(row: FeedbackRow) {
  await $fetch(`/api/ecommerce-cms/feedback/${row.id}`, {
    method: 'PUT',
    body: { status: !row.status },
  })
  await refresh()
}

async function remove(row: FeedbackRow) {
  await $fetch(`/api/ecommerce-cms/feedback/${row.id}`, { method: 'DELETE' })
  toast.add({ title: 'Feedback deleted' })
  await refresh()
  if (form.id === row.id) resetForm()
}

const rowActions = (row: FeedbackRow) => [
  [{ label: 'Edit', icon: 'i-heroicons-pencil-square-20-solid', click: () => edit(row) }],
  [{ label: row.status ? 'Hide' : 'Show', icon: row.status ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid', click: () => toggle(row) }],
  [{ label: 'Delete', icon: 'i-heroicons-trash-20-solid', click: () => remove(row) }],
]

// ── Table: search + sort + client-side pagination ─────────────────────────────
const columns = [
  { key: 'rating', label: 'Rating', sortable: true },
  { key: 'title', label: 'Title', sortable: true },
  { key: 'message', label: 'Message', sortable: false },
  { key: 'customerName', label: 'Customer', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Actions', sortable: false },
]

const search = ref('')
const sort = ref({ column: 'sortOrder', direction: 'asc' as 'asc' | 'desc' })
const page = ref(1)
const pageCount = ref('10')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = [...(feedback.value || [])]
  if (q) list = list.filter((r) => `${r.title} ${r.message} ${r.customerName}`.toLowerCase().includes(q))
  const { column, direction } = sort.value
  list.sort((a: any, b: any) => {
    const av = a[column], bv = b[column]
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av ?? '').localeCompare(String(bv ?? ''))
    return direction === 'asc' ? cmp : -cmp
  })
  return list
})

const pageTotal = computed(() => filtered.value.length)
const rows = computed(() => {
  const n = parseInt(pageCount.value)
  const start = (page.value - 1) * n
  return filtered.value.slice(start, start + n)
})
const pageFrom = computed(() => (pageTotal.value ? (page.value - 1) * parseInt(pageCount.value) + 1 : 0))
const pageTo = computed(() => Math.min(page.value * parseInt(pageCount.value), pageTotal.value))

watch([search, pageCount], () => { page.value = 1 })

onMounted(resetForm)
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <UCard
      class="w-full"
      :ui="{
        base: '',
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { padding: 'px-4 py-5' },
        body: { padding: '', base: 'divide-y divide-gray-200 dark:divide-gray-700' },
        footer: { padding: 'p-4' },
      }"
    >
      <template #header>
        <div class="flex items-center justify-between gap-3 w-full flex-wrap">
          <div>
            <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Feedback</h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Customer testimonials shown on the storefront homepage.</p>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <UInput v-model="search" icon="i-heroicons-magnifying-glass-20-solid" placeholder="Search..." size="sm" class="w-full sm:w-48" />
            <UButton icon="i-heroicons-plus" size="sm" color="primary" label="New feedback" @click="openNew" />
          </div>
        </div>
      </template>

      <div class="flex justify-between items-center w-full px-4 py-3">
        <div class="flex items-center gap-1.5">
          <span class="text-sm leading-5 hidden sm:block">Rows per page:</span>
          <USelect v-model="pageCount" :options="[5, 10, 20, 30, 50].map(n => ({ label: n, value: n }))" class="me-2 w-20" size="xs" />
        </div>
      </div>

      <UTable
        v-model:sort="sort"
        :rows="rows"
        :columns="columns"
        :loading="pending"
        sort-mode="manual"
        class="w-full"
        :empty-state="{ icon: 'i-heroicons-chat-bubble-left-right', label: 'No feedback yet' }"
      >
        <template #rating-data="{ row }">
          <span class="font-semibold text-gray-900 dark:text-white">{{ row.rating }}★</span>
        </template>
        <template #title-data="{ row }">
          <span class="font-medium text-gray-900 dark:text-white">{{ row.title }}</span>
        </template>
        <template #message-data="{ row }">
          <span class="line-clamp-2 text-sm text-gray-500 dark:text-gray-400 max-w-md">{{ row.message }}</span>
        </template>
        <template #customerName-data="{ row }">
          <div class="min-w-0">
            <div class="text-sm text-gray-900 dark:text-white">{{ row.customerName }}</div>
            <div v-if="row.clientEmail || row.clientPhone" class="text-xs text-gray-400 truncate">
              {{ row.clientEmail || row.clientPhone }}
            </div>
          </div>
        </template>
        <template #status-data="{ row }">
          <UBadge :color="row.status ? 'green' : 'gray'" variant="subtle">{{ row.status ? 'Live' : 'Hidden' }}</UBadge>
        </template>
        <template #actions-data="{ row }">
          <UDropdown :items="rowActions(row)">
            <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
          </UDropdown>
        </template>
      </UTable>

      <template #footer>
        <div class="flex flex-wrap justify-between items-center">
          <span class="text-sm leading-5 hidden sm:block">
            Showing <span class="font-medium">{{ pageFrom }}</span> to
            <span class="font-medium">{{ pageTo }}</span> of
            <span class="font-medium">{{ pageTotal }}</span> results
          </span>
          <UPagination
            v-model="page"
            :page-count="parseInt(pageCount)"
            :total="pageTotal"
            :ui="{ wrapper: 'flex items-center gap-1', rounded: '!rounded-full min-w-[32px] justify-center', default: { activeButton: { variant: 'outline' } } }"
          />
        </div>
      </template>
    </UCard>

    <UModal v-model="showForm">
      <UCard>
        <template #header>
          <div class="font-semibold text-gray-900 dark:text-white">{{ editing ? 'Edit feedback' : 'Add feedback' }}</div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Linked client">
            <select v-model="form.clientId" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              <option value="">Manual name</option>
              <option v-for="client in clients" :key="client.id" :value="client.id">
                {{ clientLabel(client) }}
              </option>
            </select>
          </UFormGroup>

          <UFormGroup label="Customer name" :required="!form.clientId">
            <UInput v-model="form.customerName" :disabled="!!form.clientId" placeholder="Customer name" />
          </UFormGroup>

          <UFormGroup label="Title" required>
            <UInput v-model="form.title" placeholder="Loved the finish" />
          </UFormGroup>

          <UFormGroup label="Message" required>
            <UTextarea v-model="form.message" :rows="5" placeholder="Feedback shown on the ecommerce storefront." />
          </UFormGroup>

          <div class="grid grid-cols-3 gap-3">
            <UFormGroup label="Rating">
              <UInput v-model.number="form.rating" type="number" min="1" max="5" />
            </UFormGroup>
            <UFormGroup label="Sort">
              <UInput v-model.number="form.sortOrder" type="number" min="0" />
            </UFormGroup>
            <UFormGroup label="Live">
              <div class="flex h-10 items-center">
                <UToggle v-model="form.status" />
              </div>
            </UFormGroup>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" label="Cancel" @click="closeForm" />
            <UButton :loading="isSaving" icon="i-heroicons-check" :label="editing ? 'Save changes' : 'Create feedback'" @click="save" />
          </div>
        </template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
