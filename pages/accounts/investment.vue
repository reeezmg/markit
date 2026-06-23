<script setup lang="ts">
import { ref, computed } from 'vue'
import { format } from 'date-fns'

import InvestmentForm from '~/components/Investment/Form.vue'
import {
  useFindManyInvestment,
} from '~/lib/hooks'

/* ---------------------------------------------------
   EMITS
--------------------------------------------------- */
const emit = defineEmits(['open'])

const toast = useToast()
const useAuth = () => useNuxtApp().$auth

/* ---------------------------------------------------
   MODAL STATE
--------------------------------------------------- */
const showInvestmentForm = ref(false)
const selectedInvestment = ref<any | null>(null)
const isDeleteModalOpen = ref(false)
const deletingRow = ref<any>(null)

/* ---------------------------------------------------
   OPEN / CLOSE
--------------------------------------------------- */
const openInvestmentForm = (row = null) => {
  selectedInvestment.value = row
  showInvestmentForm.value = true
}

const closeInvestmentForm = () => {
  showInvestmentForm.value = false
  selectedInvestment.value = null
}

/* ---------------------------------------------------
   SAVE
--------------------------------------------------- */
const saveInvestment = async (form: any) => {
  if (selectedInvestment.value) {
    await $fetch(`/api/accounts/investments/${selectedInvestment.value.id}`, { method: 'PUT', body: form })
    toast.add({ title: 'Investment updated', color: 'green' })
  } else {
    await $fetch('/api/accounts/investments', { method: 'POST', body: { ...form, status: form.status || 'COMPLETED' } })
    toast.add({ title: 'Investment added', color: 'green' })
  }

  closeInvestmentForm()
}

/* ---------------------------------------------------
   DELETE
--------------------------------------------------- */
const confirmDelete = async () => {
  await $fetch(`/api/accounts/investments/${deletingRow.value.id}`, { method: 'DELETE' })
  toast.add({ title: 'Investment deleted', color: 'green' })
  isDeleteModalOpen.value = false
}

/* ---------------------------------------------------
   TABLE STATE
--------------------------------------------------- */
const page = ref(1)
const pageCount = ref('10')

/* ---------------------------------------------------
   FETCH
--------------------------------------------------- */
const queryArgs = computed(() => ({
  where: {
    companyId: useAuth().session.value?.companyId,
  },
  include: { user: true },
  orderBy: { createdAt: 'desc' },
  skip: (page.value - 1) * parseInt(pageCount.value),
  take: parseInt(pageCount.value),
}))

const { data: investments, isLoading } = useFindManyInvestment(queryArgs)

/* ---------------------------------------------------
   ROWS
--------------------------------------------------- */
const rows = computed(() =>
  investments.value?.map(i => ({
    id: i.id,
    date: i.createdAt,
    type: i.direction === 'IN' ? 'Invested' : 'Withdrawn',
    user: i.user?.name ?? '-',
    amount: i.amount,
    note: i.note,
    raw: i,
  })) ?? []
)

/* ---------------------------------------------------
   TOTALS
--------------------------------------------------- */
const pageTotal = computed(() => rows.value.length)
const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1)
const pageTo = computed(() =>
  Math.min(page.value * parseInt(pageCount.value), pageTotal.value)
)

const totalAmount = computed(() =>
  rows.value.reduce((sum, r) => sum + Number(r.amount || 0), 0)
)

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(v ?? 0)

/* ---------------------------------------------------
   ACTION DROPDOWN
--------------------------------------------------- */
const actionItems = (row: any) => [
  [
    {
      label: 'Edit',
      icon: 'i-heroicons-pencil-square-20-solid',
      click: () => openInvestmentForm(row.raw),
    },
  ],
  [
    {
      label: 'Delete',
      icon: 'i-heroicons-trash-20-solid',
      click: () => {
        deletingRow.value = row
        isDeleteModalOpen.value = true
      },
    },
  ],
]
</script>

<template>
  <UDashboardPanelContent class="pb-24">

    <!-- SUMMARY -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <UCard>
        <div class="text-sm text-gray-500">Total Entries</div>
        <div class="text-xl font-semibold">{{ pageTotal }}</div>
      </UCard>

      <UCard>
        <div class="text-sm text-gray-500">Total Capital Amount</div>
        <div class="text-xl font-semibold">
          {{ formatCurrency(totalAmount) }}
        </div>
      </UCard>
    </div>

    <!-- TABLE CARD -->
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
      <!-- HEADER -->
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="font-semibold"></h3>
          <UButton color="primary" @click="openInvestmentForm()">
            Add Investment
          </UButton>
        </div>
      </template>

      <!-- TOP BAR -->
      <div class="flex justify-between items-center px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="text-sm hidden sm:block">Rows per page:</span>
          <USelect
            v-model="pageCount"
            :options="[5,10,20,30,40].map(v => ({ label: v, value: v }))"
            size="xs"
            class="w-20"
          />
        </div>
      </div>

      <!-- TABLE -->
      <UTable
        :rows="rows"
        :loading="isLoading"
        :columns="[
          { key: 'date', label: 'Date' },
          { key: 'type', label: 'Type' },
          { key: 'user', label: 'User' },
          { key: 'amount', label: 'Amount' },
          { key: 'note', label: 'Note' },
          { key: 'actions', label: 'Actions' },
        ]"
      >
        <template #date-data="{ row }">
          {{ format(row.date, 'd MMM yyyy') }}
        </template>

        <template #amount-data="{ row }">
          {{ formatCurrency(row.amount) }}
        </template>

        <template #actions-data="{ row }">
          <UDropdown :items="actionItems(row)">
            <UButton
              icon="i-heroicons-ellipsis-horizontal-20-solid"
              variant="ghost"
              color="gray"
            />
          </UDropdown>
        </template>
      </UTable>

      <!-- FOOTER -->
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

    <!-- DELETE MODAL -->
    <UDashboardModal
      v-model="isDeleteModalOpen"
      title="Delete Investment"
      description="Are you sure you want to delete this investment?"
      icon="i-heroicons-exclamation-circle"
      prevent-close
      :close-button="null"
    >
      <template #footer>
        <UButton color="red" label="Delete" @click="confirmDelete" />
        <UButton color="gray" label="Cancel" @click="isDeleteModalOpen = false" />
      </template>
    </UDashboardModal>

    <!-- FORM MODAL -->
    <UModal v-model="showInvestmentForm">
      <InvestmentForm
        :investment="selectedInvestment"
        @save="saveInvestment"
        @cancel="closeInvestmentForm"
      />
    </UModal>
  </UDashboardPanelContent>
</template>
