<script setup lang="ts">
type Customer = {
  id: string; name: string; email?: string | null; phone?: string | null; status: boolean
  orderCount: number; totalSpent: number; lastOrderAt?: string | null
  cartItems: number; wishlistItems: number
  marketingOptInRequestedAt?: string | null; marketingOptInAt?: string | null; marketingOptInEmail?: string | null
}
type Order = { id: string; orderNumber?: number; status: string; paymentStatus: string; grandTotal: number; createdAt: string }
type ShoppingItem = { id?: string; variantId?: string; name?: string; qty?: number }
type Detail = { customer: Customer; orders: Order[]; cart?: { items: ShoppingItem[] } | null;
  wishlist?: { items: ShoppingItem[] } | null; feedback: { id: string; title: string; rating: number; createdAt: string }[];
  activities: { id: string; kind: string; body: string; dueAt?: string | null; completedAt?: string | null; createdAt: string }[] }

const search = ref('')
const query = ref('')
const page = ref(1)
const pageCount = ref(10)
const segment = ref('all')
const segments = [
  { label: 'All customers', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Repeat', value: 'repeat' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Has cart', value: 'cart' },
]
const columns = [
  { key: 'name', label: 'Customer' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'orderCount', label: 'Orders' },
  { key: 'totalSpent', label: 'Spent' },
  { key: 'lastOrderAt', label: 'Last order' },
  { key: 'shopping', label: 'Cart / wishlist' },
  { key: 'consent', label: 'Marketing consent' },
  { key: 'actions', label: 'Actions' },
]
const selectedColumns = ref([...columns])
const visibleColumns = computed(() => columns.filter(column => selectedColumns.value.includes(column)))
const selectedId = ref<string | null>(null)
const activity = reactive({ kind: 'note', body: '', dueAt: '' })
const activitySaving = ref(false)
const toast = useToast()
type FetchState<T> = { data: Ref<T>; pending: Ref<boolean>; error: Ref<unknown>;
  execute: () => Promise<unknown>; refresh: () => Promise<unknown> }
const simpleUseFetch = useFetch as unknown as <T>(url: string | (() => string), options?: Record<string, unknown>) => Promise<FetchState<T>>
const request = $fetch as unknown as (url: string, options?: Record<string, unknown>) => Promise<unknown>
const list = await simpleUseFetch<{ customers: Customer[]; total: number; page: number; limit: number }>('/api/ecommerce-cms/customers', {
  query: computed(() => ({ q: query.value, segment: segment.value, page: page.value, limit: pageCount.value })),
  default: () => ({ customers: [], total: 0, page: 1, limit: 10 }),
})
const detail = await simpleUseFetch<Detail | null>(() => `/api/ecommerce-cms/customers/${selectedId.value}`, {
  immediate: false,
  watch: false,
})

watch(selectedId, (id) => { if (id) detail.execute() })
function applySearch() { page.value = 1; query.value = search.value.trim() }
function resetFilters() { search.value = ''; query.value = ''; segment.value = 'all'; page.value = 1 }
const pageFrom = computed(() => list.data.value.total ? (page.value - 1) * pageCount.value + 1 : 0)
const pageTo = computed(() => Math.min(page.value * pageCount.value, list.data.value.total))
watch(pageCount, () => { page.value = 1 })
function money(value: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0) }
function date(value?: string | null) { return value ? new Date(value).toLocaleDateString('en-IN') : '—' }
function consent(row: Customer) { return row.marketingOptInAt && row.marketingOptInEmail?.toLowerCase() === row.email?.toLowerCase()
  ? 'Confirmed' : row.marketingOptInRequestedAt ? 'Pending verification' : 'Not requested' }
async function addActivity() {
  if (!selectedId.value) return
  activitySaving.value = true
  try {
    await request(`/api/ecommerce-cms/customers/${selectedId.value}/activities`, { method: 'POST',
      body: { ...activity, dueAt: activity.kind === 'task' && activity.dueAt ? new Date(activity.dueAt).toISOString() : undefined } })
    activity.body = ''; activity.dueAt = ''
    await detail.refresh()
    toast.add({ title: 'Follow-up saved' })
  } catch (e: any) {
    toast.add({ title: 'Could not save follow-up', description: e?.data?.statusMessage || e.message, color: 'red' })
  } finally { activitySaving.value = false }
}
async function completeTask(id: string) {
  if (!selectedId.value) return
  try {
    await request(`/api/ecommerce-cms/customers/${selectedId.value}/activities/${id}`, { method: 'PUT' })
    await detail.refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not complete task', description: e?.data?.statusMessage || e.message, color: 'red' })
  }
}
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <UCard class="w-full" :ui="{ body: { padding: '' }, footer: { padding: 'p-4' } }">
      <template #header>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 class="text-lg font-semibold text-gray-900 dark:text-white">Storefront customers</h1>
            <p class="text-xs text-gray-500 dark:text-gray-400">Customer activity and follow-ups for this store.</p>
          </div>
          <form class="flex w-full gap-2 sm:w-auto" @submit.prevent="applySearch">
            <UInput v-model="search" icon="i-heroicons-magnifying-glass-20-solid" aria-label="Search customers" placeholder="Search name, email or phone" class="min-w-0 flex-1 sm:w-64" />
            <UButton type="submit" label="Search" color="primary" />
          </form>
        </div>
      </template>

      <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="hidden text-sm text-gray-600 dark:text-gray-300 sm:block">Rows per page:</span>
          <USelect v-model="pageCount" :options="[5, 10, 20, 30, 50]" size="xs" class="w-20" />
          <USelect v-model="segment" :options="segments" option-attribute="label" value-attribute="value" size="xs" class="w-40" @change="page = 1" />
        </div>
        <div class="flex items-center gap-2">
          <USelectMenu v-model="selectedColumns" :options="columns" multiple>
            <UButton icon="i-heroicons-view-columns" color="gray" size="xs">Columns</UButton>
          </USelectMenu>
          <UButton icon="i-heroicons-funnel" color="gray" size="xs" :disabled="!query && segment === 'all'" @click="resetFilters">Reset</UButton>
        </div>
      </div>

      <p v-if="list.error.value" class="px-4 py-3 text-sm text-red-600">Could not load customers.</p>
      <UTable :rows="list.data.value.customers" :columns="visibleColumns" :loading="list.pending.value" class="w-full">
        <template #name-data="{ row }"><span class="font-medium text-gray-900 dark:text-white">{{ row.name || 'Unnamed customer' }}</span></template>
        <template #phone-data="{ row }">{{ row.phone || '—' }}</template>
        <template #email-data="{ row }">{{ row.email || '—' }}</template>
        <template #totalSpent-data="{ row }">{{ money(row.totalSpent) }}</template>
        <template #lastOrderAt-data="{ row }">{{ date(row.lastOrderAt) }}</template>
        <template #shopping-data="{ row }">{{ row.cartItems }} / {{ row.wishlistItems }}</template>
        <template #consent-data="{ row }">{{ consent(row) }}</template>
        <template #actions-data="{ row }">
          <UButton color="gray" variant="ghost" size="xs" icon="i-heroicons-eye" :aria-label="`View ${row.name || 'customer'}`" @click="selectedId = row.id">View</UButton>
        </template>
      </UTable>

      <template #footer>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="text-sm text-gray-600 dark:text-gray-300">Showing {{ pageFrom }} to {{ pageTo }} of {{ list.data.value.total }} customers</span>
          <UPagination v-model="page" :page-count="pageCount" :total="list.data.value.total"
            :ui="{ wrapper: 'flex items-center gap-1', rounded: '!rounded-full min-w-[32px] justify-center', default: { activeButton: { variant: 'outline' } } }" />
        </div>
      </template>
    </UCard>

    <div v-if="selectedId" class="fixed inset-0 z-50 flex justify-end bg-black/40" @click.self="selectedId = null">
      <div class="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl dark:bg-gray-900">
        <button class="mb-4 rounded border px-3 py-1 text-sm" @click="selectedId = null">Close</button>
        <p v-if="detail.pending.value">Loading customer…</p>
        <p v-else-if="detail.error.value" class="text-red-600">Could not load customer details.</p>
        <template v-else-if="detail.data.value">
          <h2 class="text-xl font-semibold">{{ detail.data.value.customer.name || 'Unnamed customer' }}</h2>
          <p class="text-sm text-gray-500">{{ detail.data.value.customer.email }} · {{ detail.data.value.customer.phone }}</p>
          <p class="mt-2 text-sm">Marketing consent: {{ consent(detail.data.value.customer) }}</p>
          <section class="mt-6"><h3 class="font-semibold">Orders</h3><p v-if="!detail.data.value.orders.length" class="text-sm text-gray-500">No storefront orders.</p>
            <div v-for="order in detail.data.value.orders" :key="order.id" class="mt-2 rounded-lg border p-3 text-sm dark:border-gray-700">
              <div class="flex justify-between"><span>#{{ order.orderNumber || order.id.slice(0, 8) }} · {{ order.status }}</span><span>{{ money(order.grandTotal) }}</span></div>
              <p class="text-gray-500">{{ date(order.createdAt) }} · {{ order.paymentStatus }}</p>
            </div>
          </section>
          <section class="mt-6"><h3 class="font-semibold">Shopping activity</h3>
            <p class="text-sm text-gray-500">Cart · {{ detail.data.value.cart?.items?.length || 0 }} items</p>
            <p v-for="item in detail.data.value.cart?.items || []" :key="item.id || item.variantId" class="ml-2 text-sm">{{ item.name || item.variantId || item.id }} <span v-if="item.qty">× {{ item.qty }}</span></p>
            <p class="mt-2 text-sm text-gray-500">Wishlist · {{ detail.data.value.wishlist?.items?.length || 0 }} items</p>
            <p v-for="item in detail.data.value.wishlist?.items || []" :key="item.id || item.variantId" class="ml-2 text-sm">{{ item.name || item.variantId || item.id }}</p>
          </section>
          <section class="mt-6"><h3 class="font-semibold">Feedback</h3><p v-if="!detail.data.value.feedback.length" class="text-sm text-gray-500">No feedback.</p><p v-for="item in detail.data.value.feedback" :key="item.id" class="mt-2 text-sm">{{ item.title }} · {{ item.rating }}/5 · {{ date(item.createdAt) }}</p></section>
          <section class="mt-6 space-y-3"><h3 class="font-semibold">Notes and follow-ups</h3>
            <form class="grid gap-2" @submit.prevent="addActivity">
              <select v-model="activity.kind" class="rounded border bg-transparent px-2 py-2"><option value="note">Note</option><option value="task">Follow-up task</option></select>
              <textarea v-model="activity.body" required maxlength="2000" rows="2" placeholder="What needs follow-up?" class="rounded border bg-transparent px-2 py-2" />
              <label v-if="activity.kind === 'task'" class="text-sm">Due date <input v-model="activity.dueAt" type="datetime-local" class="rounded border bg-transparent px-2 py-1"></label>
              <button :disabled="activitySaving" class="w-fit rounded bg-primary-500 px-3 py-2 text-white disabled:opacity-50">Add</button>
            </form>
            <div v-for="item in detail.data.value.activities" :key="item.id" class="rounded border p-3 text-sm dark:border-gray-700">
              <div class="flex justify-between"><span class="font-medium capitalize">{{ item.kind }} {{ item.completedAt ? '· Done' : '' }}</span><span class="text-gray-500">{{ date(item.createdAt) }}</span></div>
              <p class="whitespace-pre-wrap">{{ item.body }}</p><p v-if="item.dueAt" class="text-gray-500">Due {{ date(item.dueAt) }}</p>
              <button v-if="item.kind === 'task' && !item.completedAt" class="mt-2 rounded border px-2 py-1" @click="completeTask(item.id)">Mark done</button>
            </div>
          </section>
        </template>
      </div>
    </div>
  </UDashboardPanelContent>
</template>
