<script setup lang="ts">
type MessageRow = {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  message: string
  status: 'new' | 'opened' | 'replied' | 'closed'
  repliedAt?: string | null
  createdAt: string
  updatedAt: string
}

const toast = useToast()

const { data: messages, pending, refresh } = await useFetch<MessageRow[]>('/api/ecommerce-cms/messages', {
  default: () => [],
})

// Colors restricted to nuxt.config safelistColors (['primary','red','orange','green','tertiary']) + gray.
const STATUS_META: Record<MessageRow['status'], { label: string; color: string }> = {
  new: { label: 'New', color: 'red' },
  opened: { label: 'Opened', color: 'orange' },
  replied: { label: 'Replied', color: 'green' },
  closed: { label: 'Closed', color: 'gray' },
}

async function setStatus(row: MessageRow, status: MessageRow['status'], opts: { silent?: boolean } = {}) {
  try {
    await $fetch(`/api/ecommerce-cms/messages/${row.id}`, { method: 'PUT', body: { status } })
    await refresh()
    if (!opts.silent) toast.add({ title: `Marked ${STATUS_META[status].label.toLowerCase()}` })
  } catch (error: any) {
    toast.add({ title: 'Could not update status', description: error?.data?.statusMessage || error?.message, color: 'red' })
  }
}

async function remove(row: MessageRow) {
  try {
    await $fetch(`/api/ecommerce-cms/messages/${row.id}`, { method: 'DELETE' })
    toast.add({ title: 'Message deleted' })
    await refresh()
  } catch (error: any) {
    toast.add({ title: 'Could not delete', description: error?.data?.statusMessage || error?.message, color: 'red' })
  }
}

function openMessage(row: MessageRow) {
  if (row.status === 'new') setStatus(row, 'opened', { silent: true })
}

function replyEmail(row: MessageRow) {
  if (!row.email) return
  const subject = encodeURIComponent('Re: your message to our store')
  const body = encodeURIComponent(`Hi ${row.name},\n\n`)
  window.location.href = `mailto:${row.email}?subject=${subject}&body=${body}`
  if (row.status !== 'replied' && row.status !== 'closed') setStatus(row, 'replied', { silent: true })
}

function replyWhatsapp(row: MessageRow) {
  const digits = (row.phone || '').replace(/\D/g, '')
  if (!digits) {
    toast.add({ title: 'No phone number on this message', color: 'red' })
    return
  }
  const text = encodeURIComponent(`Hi ${row.name}, thanks for reaching out to us.`)
  window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener')
  if (row.status !== 'replied' && row.status !== 'closed') setStatus(row, 'replied', { silent: true })
}

const rowActions = (row: MessageRow) => {
  const targets: MessageRow['status'][] = ['new', 'opened', 'replied', 'closed']
  return [
    targets
      .filter((s) => s !== row.status)
      .map((s) => ({ label: `Mark ${STATUS_META[s].label.toLowerCase()}`, icon: 'i-heroicons-flag-20-solid', click: () => setStatus(row, s) })),
    [{ label: 'Delete', icon: 'i-heroicons-trash-20-solid', click: () => remove(row) }],
  ]
}

function fmtDate(value: string) {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ── Filter chips + search + sort + client-side pagination ─────────────────────
const columns = [
  { key: 'status', label: 'Status', sortable: true },
  { key: 'name', label: 'Name', sortable: true },
  { key: 'contact', label: 'Contact', sortable: false },
  { key: 'message', label: 'Message', sortable: false },
  { key: 'createdAt', label: 'Received', sortable: true },
  { key: 'actions', label: 'Actions', sortable: false },
]

const filter = ref<'all' | MessageRow['status']>('all')
const search = ref('')
const sort = ref({ column: 'createdAt', direction: 'desc' as 'asc' | 'desc' })
const page = ref(1)
const pageCount = ref('10')

const counts = computed(() => {
  const c = { all: 0, new: 0, opened: 0, replied: 0, closed: 0 } as Record<string, number>
  for (const m of messages.value || []) { c.all++; c[m.status]++ }
  return c
})

const filterTabs = computed(() =>
  (['all', 'new', 'opened', 'replied', 'closed'] as const).map((key) => ({
    key,
    label: key === 'all' ? 'All' : STATUS_META[key].label,
    count: counts.value[key] || 0,
  }))
)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = [...(messages.value || [])]
  if (filter.value !== 'all') list = list.filter((m) => m.status === filter.value)
  if (q) list = list.filter((r) => `${r.name} ${r.email || ''} ${r.phone || ''} ${r.message}`.toLowerCase().includes(q))
  const { column, direction } = sort.value
  list.sort((a: any, b: any) => {
    let cmp: number
    if (column === 'createdAt') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    else cmp = String(a[column] ?? '').localeCompare(String(b[column] ?? ''))
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

watch([search, filter, pageCount], () => { page.value = 1 })
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
          <div class="flex items-center gap-3">
            <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Messages</h1>
            <UBadge v-if="counts.new" color="red" variant="subtle">{{ counts.new }} new</UBadge>
          </div>
          <UInput v-model="search" icon="i-heroicons-magnifying-glass-20-solid" placeholder="Search..." size="sm" class="w-full sm:w-56" />
        </div>
      </template>

      <div class="flex flex-wrap justify-between items-center gap-3 w-full px-4 py-3">
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="tab in filterTabs"
            :key="tab.key"
            :color="filter === tab.key ? 'primary' : 'gray'"
            :variant="filter === tab.key ? 'solid' : 'soft'"
            size="xs"
            @click="filter = tab.key"
          >
            {{ tab.label }}<span class="ml-1 opacity-70">{{ tab.count }}</span>
          </UButton>
        </div>
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
        :empty-state="{ icon: 'i-heroicons-inbox', label: 'No messages here' }"
      >
        <template #status-data="{ row }">
          <UBadge :color="STATUS_META[row.status].color" variant="subtle">{{ STATUS_META[row.status].label }}</UBadge>
        </template>

        <template #name-data="{ row }">
          <span class="font-medium text-gray-900 dark:text-white">{{ row.name }}</span>
        </template>

        <template #contact-data="{ row }">
          <div class="min-w-0 text-xs">
            <div v-if="row.email" class="truncate text-gray-600 dark:text-gray-300">{{ row.email }}</div>
            <div v-if="row.phone" class="truncate text-gray-500">{{ row.phone }}</div>
          </div>
        </template>

        <template #message-data="{ row }">
          <UPopover mode="click">
            <button
              class="max-w-xs truncate text-left text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              @click="openMessage(row)"
            >
              {{ row.message }}
            </button>
            <template #panel>
              <div class="max-w-sm whitespace-pre-line p-4 text-sm text-gray-700 dark:text-gray-200">{{ row.message }}</div>
            </template>
          </UPopover>
        </template>

        <template #createdAt-data="{ row }">
          <span class="whitespace-nowrap text-xs text-gray-500">{{ fmtDate(row.createdAt) }}</span>
        </template>

        <template #actions-data="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton v-if="row.email" size="xs" color="gray" variant="soft" icon="i-heroicons-envelope" title="Reply by email" @click="replyEmail(row)" />
            <UButton v-if="row.phone" size="xs" color="green" variant="soft" icon="i-simple-icons-whatsapp" title="Reply on WhatsApp" @click="replyWhatsapp(row)" />
            <UDropdown :items="rowActions(row)">
              <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
            </UDropdown>
          </div>
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
  </UDashboardPanelContent>
</template>
