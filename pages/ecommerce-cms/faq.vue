<script setup lang="ts">
type FaqRow = {
  id: string
  question: string
  answer: string
  sortOrder: number
  status: boolean
}

const toast = useToast()

const { data: faqs, pending, refresh } = await useFetch<FaqRow[]>('/api/ecommerce-cms/faq', {
  default: () => [],
})

const form = reactive({
  id: '',
  question: '',
  answer: '',
  sortOrder: 0,
  status: true,
})

const isSaving = ref(false)
const showForm = ref(false)
const editing = computed(() => !!form.id)

function resetForm() {
  form.id = ''
  form.question = ''
  form.answer = ''
  form.sortOrder = (faqs.value?.length || 0) + 1
  form.status = true
}

function openNew() {
  resetForm()
  showForm.value = true
}

function edit(row: FaqRow) {
  form.id = row.id
  form.question = row.question
  form.answer = row.answer
  form.sortOrder = row.sortOrder
  form.status = row.status
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  resetForm()
}

async function save() {
  if (!form.question.trim() || !form.answer.trim()) {
    toast.add({ title: 'Question and answer are required', color: 'red' })
    return
  }

  isSaving.value = true
  try {
    const body = {
      question: form.question,
      answer: form.answer,
      sortOrder: Number(form.sortOrder || 0),
      status: form.status,
    }

    if (form.id) {
      await $fetch(`/api/ecommerce-cms/faq/${form.id}`, { method: 'PUT', body })
      toast.add({ title: 'FAQ updated' })
    } else {
      await $fetch('/api/ecommerce-cms/faq', { method: 'POST', body })
      toast.add({ title: 'FAQ added' })
    }

    showForm.value = false
    resetForm()
    await refresh()
  } catch (error: any) {
    toast.add({
      title: 'Unable to save FAQ',
      description: error?.data?.statusMessage || error?.message,
      color: 'red',
    })
  } finally {
    isSaving.value = false
  }
}

async function toggle(row: FaqRow) {
  await $fetch(`/api/ecommerce-cms/faq/${row.id}`, {
    method: 'PUT',
    body: { status: !row.status },
  })
  await refresh()
}

async function remove(row: FaqRow) {
  await $fetch(`/api/ecommerce-cms/faq/${row.id}`, { method: 'DELETE' })
  toast.add({ title: 'FAQ deleted' })
  await refresh()
  if (form.id === row.id) resetForm()
}

const rowActions = (row: FaqRow) => [
  [{ label: 'Edit', icon: 'i-heroicons-pencil-square-20-solid', click: () => edit(row) }],
  [{ label: row.status ? 'Hide' : 'Show', icon: row.status ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid', click: () => toggle(row) }],
  [{ label: 'Delete', icon: 'i-heroicons-trash-20-solid', click: () => remove(row) }],
]

// ── Table: search + sort + client-side pagination ─────────────────────────────
const columns = [
  { key: 'sortOrder', label: '#', sortable: true },
  { key: 'question', label: 'Question', sortable: true },
  { key: 'answer', label: 'Answer', sortable: false },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Actions', sortable: false },
]

const search = ref('')
const sort = ref({ column: 'sortOrder', direction: 'asc' as 'asc' | 'desc' })
const page = ref(1)
const pageCount = ref('10')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  let rows = [...(faqs.value || [])]
  if (q) rows = rows.filter((r) => `${r.question} ${r.answer}`.toLowerCase().includes(q))
  const { column, direction } = sort.value
  rows.sort((a: any, b: any) => {
    const av = a[column], bv = b[column]
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av ?? '').localeCompare(String(bv ?? ''))
    return direction === 'asc' ? cmp : -cmp
  })
  return rows
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
            <h1 class="text-xl font-semibold text-gray-900 dark:text-white">FAQ</h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Questions shown on your storefront.</p>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <UInput v-model="search" icon="i-heroicons-magnifying-glass-20-solid" placeholder="Search..." size="sm" class="w-full sm:w-48" />
            <UButton icon="i-heroicons-plus" size="sm" color="primary" label="New FAQ" @click="openNew" />
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
        :empty-state="{ icon: 'i-heroicons-question-mark-circle', label: 'No FAQs yet' }"
      >
        <template #question-data="{ row }">
          <span class="font-medium text-gray-900 dark:text-white">{{ row.question }}</span>
        </template>
        <template #answer-data="{ row }">
          <span class="line-clamp-2 text-sm text-gray-500 dark:text-gray-400 max-w-md">{{ row.answer }}</span>
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
          <div class="font-semibold text-gray-900 dark:text-white">{{ editing ? 'Edit FAQ' : 'Add FAQ' }}</div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Question" required>
            <UInput v-model="form.question" placeholder="How long does delivery take?" />
          </UFormGroup>

          <UFormGroup label="Answer" required>
            <UTextarea v-model="form.answer" :rows="6" placeholder="Answer shown on the ecommerce storefront." />
          </UFormGroup>

          <div class="grid grid-cols-2 gap-3">
            <UFormGroup label="Sort order">
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
            <UButton :loading="isSaving" icon="i-heroicons-check" :label="editing ? 'Save changes' : 'Create FAQ'" @click="save" />
          </div>
        </template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
