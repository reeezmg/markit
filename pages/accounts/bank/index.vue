<script setup lang="ts">
import { ref, computed } from 'vue'

import BankForm from '~/components/Bank/Form.vue'

import {
  useCreateBankAccount,
  useUpdateBankAccount,
  useDeleteBankAccount,
  useFindManyBankAccount,
  useFindUniqueCompany,
  useUpdateCompany,
} from '~/lib/hooks'

const toast = useToast()
const useAuth = () => useNuxtApp().$auth

/* ---------------------------------------------------
   HOOKS
--------------------------------------------------- */
const createBank = useCreateBankAccount({ optimisticUpdate: true })
const updateBank = useUpdateBankAccount({ optimisticUpdate: true })
const deleteBank = useDeleteBankAccount({ optimisticUpdate: true })
const updateCompany = useUpdateCompany({ optimisticUpdate: true })

/* ---------------------------------------------------
   MODAL STATE
--------------------------------------------------- */
const showBankForm = ref(false)
const selectedBank = ref<any | null>(null)
const isDeleteModalOpen = ref(false)
const deletingRow = ref<any>(null)

/* ---------------------------------------------------
   OPEN / CLOSE
--------------------------------------------------- */
const openBankForm = (row = null) => {
  selectedBank.value = row
  showBankForm.value = true
}

const closeBankForm = () => {
  showBankForm.value = false
  selectedBank.value = null
}

/* ---------------------------------------------------
   CREATE / UPDATE
--------------------------------------------------- */
const addBank = (bank: any) => {
  createBank.mutate({
    data: {
      accHolderName: bank.accHolderName,
      bankName: bank.bankName,
      accountNo: bank.accountNo,
      ifsc: bank.ifsc,
      gstin: bank.gstin,
      upiId: bank.upiId,
      openingBalance: Number(bank.openingBalance),
      company: {
        connect: { id: useAuth().session.value!.companyId },
      },
    },
  })

  toast.add({ title: 'Bank account added', color: 'green' })
}

const editSecondaryBank = async (id: string, bank: any) => {
  await updateBank.mutateAsync({
    where: { id },
    data: {
      accHolderName: bank.accHolderName,
      bankName: bank.bankName,
      accountNo: bank.accountNo,
      ifsc: bank.ifsc,
      gstin: bank.gstin,
      upiId: bank.upiId,
      openingBalance: Number(bank.openingBalance),
    },
  })

  toast.add({ title: 'Bank account updated', color: 'green' })
}

const editPrimaryBank = async (bank: any) => {
  await updateCompany.mutateAsync({
    where: { id: useAuth().session.value!.companyId },
    data: {
      accHolderName: bank.accHolderName,
      bankName: bank.bankName,
      accountNo: bank.accountNo,
      ifsc: bank.ifsc,
      gstin: bank.gstin,
      upiId: bank.upiId,
    },
  })

  toast.add({ title: 'Primary bank updated', color: 'green' })
}

const saveBank = async (form: any) => {
  if (selectedBank.value?.isPrimary) {
    await editPrimaryBank(form)
  } else if (selectedBank.value) {
    await editSecondaryBank(selectedBank.value.id, form)
  } else {
    addBank(form)
  }

  closeBankForm()
}

/* ---------------------------------------------------
   DELETE
--------------------------------------------------- */
const confirmDelete = async () => {
  await deleteBank.mutateAsync({
    where: { id: deletingRow.value.id },
  })
  toast.add({ title: 'Bank account deleted', color: 'green' })
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
const companyQuery = computed(() => ({
  where: { id: useAuth().session.value?.companyId },
}))

const bankQuery = computed(() => ({
  where: { companyId: useAuth().session.value?.companyId },
  skip: (page.value - 1) * parseInt(pageCount.value),
  take: parseInt(pageCount.value),
}))

const { data: company } = useFindUniqueCompany(companyQuery)
const { data: banks, isLoading } = useFindManyBankAccount(bankQuery)

/* ---------------------------------------------------
   PRIMARY BANK
--------------------------------------------------- */
const primaryBankRow = computed(() => {
  if (!company.value?.bankName) return null

  return {
    id: 'PRIMARY_BANK',
    isPrimary: true,
    bankName: company.value.bankName,
    accHolderName: company.value.accHolderName,
    accountNo: company.value.accountNo,
    ifsc: company.value.ifsc,
    upiId: company.value.upiId,
    raw: {
      accHolderName: company.value.accHolderName,
      bankName: company.value.bankName,
      accountNo: company.value.accountNo,
      ifsc: company.value.ifsc,
      gstin: company.value.gstin,
      upiId: company.value.upiId,
    },
  }
})

/* ---------------------------------------------------
   ROWS
--------------------------------------------------- */
const rows = computed(() => {
  const primary = primaryBankRow.value ? [primaryBankRow.value] : []

  const others =
    banks.value?.map(b => ({
      id: b.id,
      bankName: b.bankName,
      accHolderName: b.accHolderName,
      accountNo: b.accountNo,
      ifsc: b.ifsc,
      upiId: b.upiId,
      isPrimary: false,
      raw: b,
    })) ?? []

  return [...primary, ...others]
})

/* ---------------------------------------------------
   PAGINATION META
--------------------------------------------------- */
const pageTotal = computed(() => rows.value.length)
const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1)
const pageTo = computed(() =>
  Math.min(page.value * parseInt(pageCount.value), pageTotal.value)
)

/* ---------------------------------------------------
   ACTIONS
--------------------------------------------------- */
const goToDetails = (row: any) => {
  if (row.isPrimary) navigateTo('/accounts/bank/primary')
  else navigateTo(`/accounts/bank/${row.id}`)
}

const actionItems = (row: any) => [
  [
    {
      label: 'Details',
      icon: 'i-heroicons-document-text-20-solid',
      click: () => goToDetails(row),
    },
    {
      label: 'Edit',
      icon: 'i-heroicons-pencil-square-20-solid',
      click: () => openBankForm(row),
    },
  ],
  [
    {
      label: 'Delete',
      icon: 'i-heroicons-trash-20-solid',
      disabled: row.isPrimary,
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
          <h2 class="font-semibold">Bank Accounts</h2>

          <UButton color="primary" @click="openBankForm()">
            Add Bank Account
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
          { key: 'bankName', label: 'Bank' },
          { key: 'accHolderName', label: 'Account Holder' },
          { key: 'accountNo', label: 'Account No' },
          { key: 'ifsc', label: 'IFSC' },
          { key: 'upiId', label: 'UPI ID' },
          { key: 'actions', label: 'Actions' },
        ]"
      >
        <template #bankName-data="{ row }">
          <div class="flex items-center gap-2">
            <span>{{ row.bankName }}</span>
            <UBadge v-if="row.isPrimary" size="xs" color="primary">
              Primary
            </UBadge>
          </div>
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
      title="Delete Bank Account"
      description="Are you sure you want to delete this bank account?"
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
    <UModal v-model="showBankForm">
      <BankForm
        :bank="selectedBank?.raw"
        @save="saveBank"
        @cancel="closeBankForm"
      />
    </UModal>

  </UDashboardPanelContent>
</template>
