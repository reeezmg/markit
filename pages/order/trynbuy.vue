<script setup lang="ts">
import { Switch } from '@headlessui/vue'
import { sub, format, isSameDay, type Duration } from 'date-fns'
import { startOfDay, endOfDay } from 'date-fns'
import { useRouter } from '#app'
import { computed, ref, watch } from 'vue'
import {
  useFindManyTrynbuy,
  useCountTrynbuy,
  useUpdateBill,
} from '~/lib/hooks'
import type { Prisma } from '@prisma/client'
const checkoutStore = useCheckoutStore()

// ✅ Auth & Router
const router = useRouter()
const useAuth = () => useNuxtApp().$auth

// ✅ Date Ranges
const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]
const selectedDate = ref({
  start: sub(new Date(), { days: 7 }),
  end: new Date(),
})

// ✅ Columns
const columns = [
  { key: 'orderNumber', label: 'Order#', sortable: true },
  { key: 'createdAt', label: 'Date', sortable: true },
  { key: 'deliveryType', label: 'Delivery', sortable: true },
  { key: 'deliveryTime', label: 'Delivery Time', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Actions', sortable: false },
]

// ✅ Sub-table Columns (Cart Items)
const itemColumns = [
  { key: 'item.barcode', label: 'Barcode' },
  { key: 'variant.name', label: 'Variant' },
  { key: 'item.size', label: 'Size' },
  { key: 'quantity', label: 'Qty' },
  { key: 'variant.dprice', label: 'Rate' },
  { key: 'variant.tax', label: 'Tax' },
]

// ✅ Filters
const todoStatus = [
  { label: 'Paid', value: 'PAID' },
  { label: 'Pending', value: 'PENDING' },
]

// ✅ State
const selectedColumns = ref(columns)
const selectedRows = ref([])
const notes = ref<Record<string, string>>({})
const search = ref<number | null>(null)
const selectedStatus = ref<any[]>([])
const sort = ref({ column: 'createdAt', direction: 'desc' as const })
const expand = ref({ openedRows: [], row: null })
const page = ref(1)
const pageCount = ref('10')

// ✅ Helper Computed
const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1)
const pageTo = computed(() =>
  Math.min(page.value * parseInt(pageCount.value), pageTotal.value || 0)
)

function isRangeSelected(duration: Duration) {
  return isSameDay(selectedDate.value.start, sub(new Date(), duration)) && isSameDay(selectedDate.value.end, new Date())
}

function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

// ✅ Query Args (with new M2M company + filtered cartItems)
const queryArgs = computed<Prisma.TrynbuyFindManyArgs>(() => ({
  where: {
    AND: [
      // ✅ Fetch Trynbuys linked to current company (M2M relation)
      {
        company: {
          some: { id: useAuth().session.value?.companyId },
        },
      },
      ...(search.value ? [{ orderNumber: search.value }] : []),
      ...(selectedStatus.value.length
        ? [
            {
              OR: selectedStatus.value.map((item: any) => ({
                orderStatus: item.value,
              })),
            },
          ]
        : []),
      ...(selectedDate.value
        ? [
           {
              createdAt: {
              gte: startOfDay(selectedDate.value.start),
              lte: endOfDay(selectedDate.value.end),
            }
           },
          ]
        : []),
    ],
  },
  include: {
    cartItems: {
      where: {
        // ✅ Only include items whose product’s company matches the logged-in company
        variant: {
          product: {
            companyId: useAuth().session.value?.companyId,
          },
        },
      },
      include: {
        variant: {
          include: {
            product: true, // optional: include product name if needed
          },
        },
        item: true,
      },
    },
     bill:{
            where:{
              companyId: useAuth().session.value?.companyId,
            }
          }
  },
  orderBy: { [sort.value.column]: sort.value.direction },
  skip: (page.value - 1) * parseInt(pageCount.value),
  take: parseInt(pageCount.value),
}))



const countArgs = computed(() => ({
  where: queryArgs.value.where,
}))

// ✅ Hooks
const { data: trynbuys, isLoading, refetch } = useFindManyTrynbuy(queryArgs)

watch(trynbuys, (newData) => {
 console.log('📦 Fetched TrynBuys:', newData)
})

const { data: pageTotal } = useCountTrynbuy(countArgs)
const UpdateBill = useUpdateBill()

watch(
  () => checkoutStore.lastUpdate,
  async () => {
    const res = await refetch()
  },
  { immediate: true }
)


// ✅ Handlers
const resetFilters = () => {
  search.value = null
  selectedStatus.value = []
}

const handleUpdate = async (id: string) => {
  const res = await UpdateBill.mutateAsync({
    where: { id },
    data: { notes: notes.value[id] },
  })
  console.log('📝 Updated Bill:', res)
}

const handleChange = (value: string, row: any) => {
  notes.value[row.id] = value
}
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <UCard
      class="w-full"
      :ui="{
        base: '',
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { padding: 'px-4 py-5' },
        body: { base: 'divide-y divide-gray-200 dark:divide-gray-700' },
        footer: { padding: 'p-4' },
      }"
    >
      <!-- Filters -->
      <template #header>
        <div
          class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 w-full"
        >
          <div class="flex flex-row gap-3 w-full sm:w-auto">
            <UInput
              v-model="search"
              icon="i-heroicons-magnifying-glass-20-solid"
              type="number"
              placeholder="Search Order#"
              class="w-full sm:w-40"
            />
            <USelectMenu
              v-model="selectedStatus"
              :options="todoStatus"
              multiple
              placeholder="Status"
              class="w-full sm:w-40"
            />
            <UPopover :popper="{ placement: 'bottom-start' }" class="z-10">
              <UButton
                icon="i-heroicons-calendar-days-20-solid"
                class="w-full sm:w-60"
              >
                {{ format(selectedDate.start, 'd MMM, yyy') }} -
                {{ format(selectedDate.end, 'd MMM, yyy') }}
              </UButton>
              <template #panel="{ close }">
                <div
                  class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800"
                >
                  <div class="hidden sm:flex flex-col py-4">
                    <UButton
                      v-for="(range, index) in ranges"
                      :key="index"
                      :label="range.label"
                      color="gray"
                      variant="ghost"
                      class="rounded-none px-6 hidden sm:block"
                      :class="[
                        isRangeSelected(range.duration)
                          ? 'bg-gray-100 dark:bg-gray-800'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                      ]"
                      truncate
                      @click="selectRange(range.duration)"
                    />
                  </div>
                  <DatePicker v-model="selectedDate" @close="close" />
                </div>
              </template>
            </UPopover>
          </div>
        </div>
      </template>

      <!-- Table -->
      <UTable
        v-model:sort="sort"
        v-model:expand="expand"
        :rows="trynbuys"
        :columns="columns"
        :loading="isLoading"
        :multiple-expand="false"
        sort-mode="manual"
        class="w-full"
      >
        <template #actions-data="{ row }">
          <UDropdown :items="[
            [
              {
                label: 'Pack',
                icon: 'i-heroicons-clipboard-document-check-20-solid',
                click: () => router.push(`./pack?id=${row.id}`),
              },
              {
                label: 'Bill',
                icon: 'i-heroicons-document-text',
                click: () => router.push(`/erp/edit/${row.bill[0]?.id}`),
              },
            ],
          ]">
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-ellipsis-horizontal-20-solid"
            />
          </UDropdown>
        </template>

        <template #createdAt-data="{ row }">
          {{ new Date(row.createdAt).toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }) }}
        </template>

        <template #deliveryTime-data="{ row }">
          {{
            row.deliveryTime
              ? new Date(row.deliveryTime).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '-'
          }}
        </template>

       <template #status-data="{ row }">
        <UBadge
          size="sm"
          :color="
            (row.cartItems?.[0]?.status === 'BILLED'
              ? 'green'
              : row.cartItems?.[0]?.status === 'ALL_RETURNED'
              ? 'purple'
              : row.cartItems?.[0]?.status === 'CANCELLED'
              ? 'red'
              : row.cartItems?.[0]?.status === 'DELIVERED'
              ? 'orange'
              : row.cartItems?.[0]?.status === 'ORDER_RECEIVED'
              ? 'yellow'
              : 'gray')
          "
          variant="subtle"
        >
          {{
            row.cartItems?.[0]?.status
              ? row.cartItems[0].status
                  .split('_')
                  .map(
                    w =>
                      w.charAt(0).toUpperCase() +
                      w.slice(1).toLowerCase()
                  )
                  .join(' ')
              : '-'
          }}
        </UBadge>
      </template>


        <!-- Subtable -->
        <template #expand="{ row }">
          <UTable :rows="row.cartItems" :columns="itemColumns" />
        </template>
      </UTable>

      <!-- Footer -->
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
            :ui="{
              wrapper: 'flex items-center gap-1',
              rounded: '!rounded-full min-w-[32px] justify-center',
              default: { activeButton: { variant: 'outline' } },
            }"
          />
        </div>
      </template>
    </UCard>
  </UDashboardPanelContent>
</template>
