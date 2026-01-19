<script setup lang="ts">
import {
  useFindManyInvestment,
  useUpdateManyInvestment,
  useFindManyCompanyUser,
} from '~/lib/hooks'
import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, type Duration } from 'date-fns'
import { startOfDay, endOfDay } from 'date-fns'

const emit = defineEmits(['edit', 'delete', 'open', 'values'])
const useAuth = () => useNuxtApp().$auth

const UpdateManyInvestment = useUpdateManyInvestment({ optimisticUpdate: true })

const selectedRows = ref<any[]>([])
const selectedStatus = ref<string[]>([])
const selectedDirection = ref<string[]>([])
const selectedUser = ref<string[]>([])

const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref<any>({})

const selectedDate = ref({
  start: startOfDay(new Date()),
  end: endOfDay(new Date()),
})

const sort = ref({ column: 'createdAt', direction: 'desc' as const })
const page = ref(1)
const pageCount = ref('10')

/* ---------------------------------------------------
   TABLE COLUMNS
--------------------------------------------------- */
const columns = [
  { key: 'createdAt', label: 'Date', sortable: true },
  { key: 'user.name', label: 'User', sortable: true },
  { key: 'direction', label: 'Type', sortable: true },
  { key: 'note', label: 'Note', sortable: true },
  { key: 'paymentMode', label: 'Payment Mode', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Actions' },
]

/* ---------------------------------------------------
   ROW ACTIONS
--------------------------------------------------- */
const action = (row: any) => [
  [
    {
      label: 'Edit',
      icon: 'i-heroicons-pencil-square-20-solid',
      click: () => emit('edit', row),
    },
  ],
  [
    {
      label: 'Delete',
      icon: 'i-heroicons-trash-20-solid',
      click: () => {
        isDeleteModalOpen.value = true
        deletingRowIdentity.value = row
      },
    },
  ],
]

const active = (rows: any[]) => [
  [
    {
      label: 'Mark Completed',
      click: () => multiUpdate('COMPLETED', rows.map(r => r.id)),
    },
    {
      label: 'Mark Pending',
      click: () => multiUpdate('PENDING', rows.map(r => r.id)),
    },
  ],
]

/* ---------------------------------------------------
   DATE RANGES
--------------------------------------------------- */
const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } },
]

function isRangeSelected(duration: Duration) {
  return (
    isSameDay(selectedDate.value.start, sub(new Date(), duration)) &&
    isSameDay(selectedDate.value.end, new Date())
  )
}

function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

/* ---------------------------------------------------
   USERS FILTER
--------------------------------------------------- */
const userQueryArgs = computed(() => ({
  where: {
    companyId: useAuth().session.value?.companyId,
    deleted: false,
  },
  select: {
    userId: true,
    name: true,
  },
}))

const { data: companyUsers } = useFindManyCompanyUser(userQueryArgs)

/* ---------------------------------------------------
   QUERY
--------------------------------------------------- */
const queryArgs = computed<Prisma.InvestmentFindManyArgs>(() => ({
  where: {
    companyId: useAuth().session.value?.companyId,

    ...(selectedStatus.value.length && {
      status: { in: selectedStatus.value },
    }),

    ...(selectedDirection.value.length && {
      direction: { in: selectedDirection.value },
    }),

    ...(selectedUser.value.length && {
      userId: { in: selectedUser.value },
    }),

    createdAt: {
      gte: startOfDay(selectedDate.value.start),
      lte: endOfDay(selectedDate.value.end),
    },
  },

  include: {
    user: true,
  },

  orderBy: {
    [sort.value.column]: sort.value.direction,
  },

  skip: (page.value - 1) * Number(pageCount.value),
  take: Number(pageCount.value),
}))

const { data: investments, isLoading } = useFindManyInvestment(queryArgs)

/* ---------------------------------------------------
   TOTALS
--------------------------------------------------- */
const pageTotal = computed(() => investments.value?.length || 0)

const totalAmount = computed(() =>
  investments.value?.reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  ) || 0
)

watch(
  [pageTotal, totalAmount],
  () => {
    emit('values', {
      pageTotal: pageTotal.value,
      totalAmount: totalAmount.value,
    })
  },
  { immediate: true }
)

/* ---------------------------------------------------
   BULK UPDATE
--------------------------------------------------- */
const multiUpdate = async (status: string, ids: string[]) => {
  await UpdateManyInvestment.mutateAsync({
    where: {
      id: { in: ids },
    },
    data: {
      status,
    },
  })
}

/* ---------------------------------------------------
   RESET FILTERS
--------------------------------------------------- */
const resetFilters = () => {
  selectedStatus.value = []
  selectedDirection.value = []
  selectedUser.value = []
  selectedDate.value = {
    start: startOfDay(new Date()),
    end: endOfDay(new Date()),
  }
}
</script>

<template>
  <UCard class="w-full">
    <template #header>
      <div class="flex flex-col sm:flex-row justify-between gap-3">

        <div class="flex flex-wrap gap-3">
          <USelectMenu
            v-model="selectedStatus"
            :options="['COMPLETED', 'PENDING']"
            multiple
            placeholder="Status"
            class="w-40"
          />

          <USelectMenu
            v-model="selectedDirection"
            :options="['IN', 'OUT']"
            multiple
            placeholder="Type"
            class="w-40"
          />

          <USelectMenu
            v-model="selectedUser"
            :options="companyUsers"
            option-attribute="name"
            value-attribute="userId"
            multiple
            placeholder="User"
            class="w-40"
          />

          <UPopover>
            <UButton icon="i-heroicons-calendar-days-20-solid">
              {{ format(selectedDate.start, 'd MMM, yyy') }} -
              {{ format(selectedDate.end, 'd MMM, yyy') }}
            </UButton>

            <template #panel="{ close }">
              <DatePicker v-model="selectedDate" @close="close" />
            </template>
          </UPopover>
        </div>

        <UButton color="primary" @click="emit('open')">
          Add Investment
        </UButton>
      </div>
    </template>

    <UTable
      v-model="selectedRows"
      v-model:sort="sort"
      :rows="investments"
      :columns="columns"
      :loading="isLoading"
      sort-mode="manual"
    >
      <template #createdAt-data="{ row }">
        {{ format(row.createdAt, 'd MMM, yyy') }}
      </template>

      <template #direction-data="{ row }">
        <UBadge
          size="sm"
          :color="row.direction === 'IN' ? 'green' : 'red'"
          variant="subtle"
        >
          {{ row.direction === 'IN' ? 'Invested' : 'Withdrawn' }}
        </UBadge>
      </template>

      <template #status-data="{ row }">
        <UBadge
          size="sm"
          :color="row.status === 'COMPLETED' ? 'green' : 'orange'"
          variant="subtle"
        >
          {{ row.status }}
        </UBadge>
      </template>

      <template #paymentMode-data="{ row }">
        <UBadge size="sm" variant="subtle">
          {{ row.paymentMode }}
        </UBadge>
      </template>

      <template #actions-data="{ row }">
        <UDropdown :items="action(row)">
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-ellipsis-horizontal-20-solid"
          />
        </UDropdown>
      </template>
    </UTable>

    <template #footer>
      <div class="flex flex-wrap justify-between items-center">
        <div class="text-sm hidden sm:block">
          Showing
          <span class="font-medium">{{ (page - 1) * Number(pageCount) + 1 }}</span>
          to
          <span class="font-medium">
            {{ Math.min(page * Number(pageCount), pageTotal) }}
          </span>
          of
          <span class="font-medium">{{ pageTotal }}</span>
          results
        </div>

        <UPagination
          v-model="page"
          :page-count="Number(pageCount)"
          :total="pageTotal"
        />
      </div>
    </template>
  </UCard>

  <UDashboardModal
    v-model="isDeleteModalOpen"
    title="Delete Investment"
    description="Are you sure you want to delete this investment entry?"
    icon="i-heroicons-exclamation-circle"
  >
    <template #footer>
      <UButton
        color="red"
        label="Delete"
        @click="() => {
          emit('delete', deletingRowIdentity.id)
          isDeleteModalOpen = false
        }"
      />
      <UButton label="Cancel" @click="isDeleteModalOpen = false" />
    </template>
  </UDashboardModal>
</template>
