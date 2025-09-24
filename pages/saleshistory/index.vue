<script setup lang="ts">
import { Switch } from '@headlessui/vue'
import type { Period, Range } from '~/types'
import {
  useUpdateBill,
  useFindManyBill,
  useCountBill
} from '~/lib/hooks'
import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, type Duration } from 'date-fns'

const UpdateBill = useUpdateBill()
const router = useRouter()
const useAuth = () => useNuxtApp().$auth
const toast = useToast()

// 🔹 Date ranges
const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]
const selectedDate = ref({ start: sub(new Date(), { days: 14 }), end: new Date() })

// 🔹 Columns
const columns = [
  { key: 'invoiceNumber', label: 'Inv#', sortable: true },
  { key: 'createdAt', label: 'Date', sortable: true },
  { key: 'grandTotal', label: 'Total', sortable: true },
  { key: 'paymentStatus', label: 'Payment', sortable: true },
  { key: 'notes', label: 'Notes', sortable: true },
  { key: 'deleted', label: 'Deleted', sortable: true },
  { key: 'action', label: '', sortable: false },
]

const historycolumns = [
  { key: 'invoice_number', label: 'Inv#', sortable: true },
  { key: 'changedAt', label: 'Date', sortable: true },
  { key: 'grand_total', label: 'Total', sortable: true },
  { key: 'payment_status', label: 'Payment', sortable: true },
  { key: 'notes', label: 'Notes', sortable: true },
  { key: 'operation', label: 'Operation', sortable: true },
  { key: 'action', label: '', sortable: false },
]

// 🔹 Status filter
const todoStatus = [
  { label: 'Paid', value: 'PAID' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Cancelled', value: 'CANCELLED' }
]

// 🔹 Selected Columns
const selectedColumns = ref(columns)
const columnsTable = computed(() => columns.filter((c) => selectedColumns.value.includes(c)))

// 🔹 Filters
const search = ref<number | null>(null)
const selectedStatus = ref<any>([])
const resetFilters = () => {
  search.value = ''
  selectedStatus.value = []
}

// 🔹 Pagination
const sort = ref({ column: 'updatedAt', direction: 'desc' as const })
const expand = ref({ openedRows: [], row: null })
const page = ref(1)
const pageCount = ref('20')
const selectedRows = ref([])


const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1)
const pageTo = computed(() => Math.min(page.value * parseInt(pageCount.value), pageTotal.value || 0))

// 🔹 Helpers for date filter
function isRangeSelected(duration: Duration) {
  return (
    isSameDay(selectedDate.value.start, sub(new Date(), duration)) &&
    isSameDay(selectedDate.value.end, new Date())
  )
}
function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}



// 🔹 Query
const queryArgs = computed<Prisma.BillFindManyArgs>(() => {
  return {
    where: {
      AND: [
        { companyId: useAuth().session.value?.companyId },
        ...(search.value ? [{ invoiceNumber: search.value }] : []),
        ...(selectedStatus.value.length
          ? [{ OR: selectedStatus.value.map((s: any) => ({ paymentStatus: s.value })) }]
          : []),
        ...(selectedDate.value
          ? [
              { updatedAt: { gte: selectedDate.value.start.toISOString() } },
              { updatedAt: { lte: selectedDate.value.end.toISOString() } }
            ]
          : [])
      ],
      billHistories: { some: {} }
    },
    include: { billHistories: true },
    orderBy: { [sort.value.column]: sort.value.direction },
    skip: (page.value - 1) * parseInt(pageCount.value),
    take: parseInt(pageCount.value)
  }
})

const countArgs = computed(() => ({
  where: queryArgs.value.where,
}));

const { data: pageTotal } = useCountBill(countArgs)

const { data: bills, isLoading, refetch } = useFindManyBill(queryArgs)

// 🔹 Restore Action
const restoreBill = async (id: string) => {
  await UpdateBill.mutateAsync({
    where: { id },
    data: { deleted: false }
  })
  toast.add({ title: 'Bill Restored!', color: 'green' })
  refetch()
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
                body: {
                    padding: '',
                    base: 'divide-y divide-gray-200 dark:divide-gray-700',
                },
                footer: { padding: 'p-4' },
            }"
        >
      <!-- 🔹 Filters -->
      <template #header>
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 w-full">
          <div class="flex sm:flex-row flex-col gap-3 w-full sm:w-auto">
            <div class="flex flex-row gap-3 w-full sm:w-auto">
              <UInput
                v-model="search"
                icon="i-heroicons-magnifying-glass-20-solid"
                type="number"
                placeholder="Search Invoice"
                class="w-full sm:w-40"
              />
              <USelectMenu
                v-model="selectedStatus"
                :options="todoStatus"
                multiple
                placeholder="Status"
                class="w-full sm:w-40"
              />
            </div>
            <UPopover :popper="{ placement: 'bottom-start' }" class="z-10">
              <UButton icon="i-heroicons-calendar-days-20-solid" class="w-full sm:w-60">
                {{ format(selectedDate.start, 'd MMM, yyy') }} - {{ format(selectedDate.end, 'd MMM, yyy') }}
              </UButton>
              <template #panel="{ close }">
                <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                  <div class="hidden sm:flex flex-col py-4">
                    <UButton
                      v-for="(range, index) in ranges"
                      :key="index"
                      :label="range.label"
                      color="gray"
                      variant="ghost"
                      class="rounded-none px-6 hidden sm:block"
                      :class="[isRangeSelected(range.duration) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50']"
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

      <!-- 🔹 Header buttons -->
      <div class="flex justify-between items-center w-full px-4 py-3">
        <div class="flex items-center gap-1.5">
          <span class="text-sm leading-5 hidden sm:block">Rows per page:</span>
          <USelect
            v-model="pageCount"
            :options="[3, 5, 10, 20, 30, 40].map(num => ({ label: num, value: num }))"
            class="me-2 w-20"
            size="xs"
          />
        </div>
        <div class="flex gap-1.5 items-center z-10">
          <!-- <USelectMenu v-model="selectedColumns" :options="columns" multiple>
            <UButton icon="i-heroicons-view-columns" color="gray" size="xs"> Columns </UButton>
          </USelectMenu> -->
          <UButton
            icon="i-heroicons-funnel"
            color="gray"
            size="xs"
            :disabled="search === '' && selectedStatus.length === 0"
            @click="resetFilters"
          >
            Reset
          </UButton>
        </div>
      </div>

      <!-- 🔹 Table -->
      <UTable
        v-model:sort="sort"
        v-model:expand="expand"
        :rows="bills"
        :columns="columns"
        :loading="isLoading"
        :multiple-expand="false"
        sort-mode="manual"
        class="w-full"
      >
        <template #createdAt-data="{ row }">
          {{ new Date(row.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
        </template>
        <template #grandTotal-data="{ row }"> ₹{{ row.grandTotal?.toFixed(2) }} </template>
        <template #action-data="{ row }">
          <UButton
            v-if="row.deleted"
            color="primary"
            variant="ghost"
            icon="i-heroicons-arrow-path"
            @click="restoreBill(row.id)"
          />
        </template>

        <!-- 🔹 Expanded Row -->
        <template #expand="{ row }">
          <UTable
            :columns="historycolumns"
            :rows="(row.billHistories || []).map(h => ({ ...h.data, id: h.id, operation: h.operation, changedAt: h.changedAt }))"
            class="text-sm"
          >
            <template #changedAt-data="{ row }">
              {{ new Date(row.changedAt).toLocaleString('en-GB') }}
            </template>
            <template #grand_total-data="{ row }"> ₹{{ row.grand_total?.toFixed(2) }} </template>
            <template #action-data="{ row }">
              <UButton
                color="primary"
                variant="ghost"
                icon="i-heroicons-eye"
                @click="router.push(`/saleshistory/${row.id}`)"
              />
            </template>
          </UTable>
        </template>
      </UTable>

      <!-- 🔹 Footer -->
        <template #footer>
                <div class="flex flex-wrap justify-between items-center">
                    <div>
                        <span class="text-sm leading-5 hidden sm:block">
                            Showing
                            <span class="font-medium">{{ pageFrom }}</span>
                            to
                            <span class="font-medium">{{ pageTo }}</span>
                            of
                            <span class="font-medium">{{ pageTotal }}</span>
                            results
                        </span>
                    </div>

                    <UPagination
                        v-model="page"
                        :page-count="parseInt(pageCount)"
                        :total="pageTotal"
                        :ui="{
                            wrapper: 'flex items-center gap-1',
                            rounded:
                                '!rounded-full min-w-[32px] justify-center',
                            default: {
                                activeButton: {
                                    variant: 'outline',
                                },
                            },
                        }"
                    />
                </div>
            </template>
    </UCard>
  </UDashboardPanelContent>
</template>
