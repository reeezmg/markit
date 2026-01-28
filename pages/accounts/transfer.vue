<script setup lang="ts">
import { ref, computed } from 'vue'
import { format } from 'date-fns'

import AccountTransferForm from '~/components/AccountTransfer/Form.vue'

import {
  useCreateAccountTransfer,
  useUpdateAccountTransfer,
  useDeleteAccountTransfer,
  useFindManyAccountTransfer,
  useFindManyBankAccount,
  useFindUniqueCompany,
} from '~/lib/hooks'

const toast = useToast()
const useAuth = () => useNuxtApp().$auth

/* ---------------------------------------------------
   HOOKS
--------------------------------------------------- */
const createTransfer = useCreateAccountTransfer({ optimisticUpdate: true })
const updateTransfer = useUpdateAccountTransfer({ optimisticUpdate: true })
const deleteTransfer = useDeleteAccountTransfer({ optimisticUpdate: true })

/* ---------------------------------------------------
   MODAL STATE
--------------------------------------------------- */
const showTransferForm = ref(false)
const selectedTransfer = ref<any | null>(null)
const isDeleteModalOpen = ref(false)
const deletingRow = ref<any>(null)

/* ---------------------------------------------------
   OPEN / CLOSE
--------------------------------------------------- */
const openTransferForm = (row = null) => {
  selectedTransfer.value = row
  showTransferForm.value = true
}

const closeTransferForm = () => {
  showTransferForm.value = false
  selectedTransfer.value = null
}

/* ---------------------------------------------------
   SAVE (CREATE / UPDATE)
--------------------------------------------------- */
const saveTransfer = async (transfer: any) => {
  try {
    if (selectedTransfer.value) {
      await updateTransfer.mutateAsync({
        where: { id: selectedTransfer.value.id },
        data: {
          ...(transfer.date && {
            createdAt: new Date(transfer.date).toISOString(),
          }),
          fromType: transfer.fromType,
          toType: transfer.toType,
          amount: transfer.amount,
          note: transfer.note ?? null,
          fromAccountId: transfer.fromAccountId ?? null,
          toAccountId: transfer.toAccountId ?? null,
        },
      })
      toast.add({ title: 'Transfer updated', color: 'green' })
    } else {
      await createTransfer.mutateAsync({
        data: {
          ...(transfer.date && {
            createdAt: new Date(transfer.date).toISOString(),
          }),
          fromType: transfer.fromType,
          toType: transfer.toType,
          amount: transfer.amount,
          note: transfer.note ?? null,
          ...(transfer.fromAccountId && {
            fromAccountId: transfer.fromAccountId,
          }),
          ...(transfer.toAccountId && {
            toAccountId: transfer.toAccountId,
          }),
          company: {
            connect: { id: useAuth().session.value!.companyId },
          },
        },
      })
      toast.add({ title: 'Transfer created', color: 'green' })
    }

    closeTransferForm()
  } catch (err: any) {
    toast.add({
      title: 'Transfer failed',
      description: err.message,
      color: 'red',
    })
  }
}

/* ---------------------------------------------------
   DELETE
--------------------------------------------------- */
const confirmDelete = async () => {
  await deleteTransfer.mutateAsync({
    where: { id: deletingRow.value.id },
  })
  toast.add({ title: 'Transfer deleted', color: 'green' })
  isDeleteModalOpen.value = false
}

/* ---------------------------------------------------
   PAGINATION
--------------------------------------------------- */
const page = ref(1)
const pageCount = ref('10')

/* ---------------------------------------------------
   FETCH DATA
--------------------------------------------------- */
const queryArgs = computed(() => ({
  where: { companyId: useAuth().session.value?.companyId },
  orderBy: { createdAt: 'desc' },
  skip: (page.value - 1) * parseInt(pageCount.value),
  take: parseInt(pageCount.value),
}))

const { data: transfers, isLoading } =
  useFindManyAccountTransfer(queryArgs)

/* ---------------------------------------------------
   BANKS / COMPANY
--------------------------------------------------- */
const { data: banks } = useFindManyBankAccount(() => ({
  where: { companyId: useAuth().session.value?.companyId },
}))

const { data: company } = useFindUniqueCompany(() => ({
  where: { id: useAuth().session.value?.companyId },
}))

/* ---------------------------------------------------
   HELPERS
--------------------------------------------------- */
const bankMap = computed(() => {
  const map = new Map<string, string>()
  banks.value?.forEach(b => {
    map.set(b.id, b.bankName || 'Bank')
  })
  return map
})

const getAccountLabel = (type: string, accountId?: string | null) => {
  if (type !== 'BANK') return type
  if (accountId && bankMap.value.has(accountId)) {
    return `BANK (${bankMap.value.get(accountId)})`
  }
  return 'BANK (Primary)'
}

/* ---------------------------------------------------
   ROWS
--------------------------------------------------- */
const rows = computed(() =>
  transfers.value?.map(t => ({
    id: t.id,
    date: t.createdAt,
    from: getAccountLabel(t.fromType, t.fromAccountId),
    to: getAccountLabel(t.toType, t.toAccountId),
    amount: t.amount,
    note: t.note,
    raw: t,
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
      click: () => openTransferForm(row.raw),
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
          <div>
            <h2 class="font-semibold">Account Transfers</h2>
            <p class="text-sm text-gray-500">
              Cash ↔ Bank ↔ Investment
            </p>
          </div>

          <UButton color="primary" @click="openTransferForm()">
            New Transfer
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
          { key: 'from', label: 'From' },
          { key: 'to', label: 'To' },
          { key: 'amount', label: 'Amount' },
          { key: 'note', label: 'Note' },
          { key: 'actions', label: 'Actions' },
        ]"
      >
        <template #date-data="{ row }">
          {{ format(row.date, 'dd MMM yyyy') }}
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
      title="Delete Transfer"
      description="Are you sure you want to delete this transfer?"
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
    <UModal v-model="showTransferForm">
      <AccountTransferForm
        :transfer="selectedTransfer"
        @save="saveTransfer"
        @cancel="closeTransferForm"
      />
    </UModal>
  </UDashboardPanelContent>
</template>
