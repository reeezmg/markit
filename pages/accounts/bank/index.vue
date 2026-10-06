<script setup lang="ts">
import { ref, computed } from 'vue'


import { useFindManyBankAccount } from '~/lib/hooks/bank-account';
import { useFindUniqueCompany } from '~/lib/hooks/company';

const useAuth = () => useNuxtApp().$auth
const PRIMARY_BANK_DETAILS_URL = '/accounts/bank/primary'

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
  const companyData = company.value
  return {
    id: 'PRIMARY_BANK',
    isPrimary: true,
    bankName: companyData?.bankName || 'Primary Bank',
    accHolderName: companyData?.accHolderName || '',
    accountNo: companyData?.accountNo || '',
    ifsc: companyData?.ifsc || '',
    upiId: companyData?.upiId || '',
    raw: {
      isPrimary: true,
      accHolderName: companyData?.accHolderName || '',
      bankName: companyData?.bankName || '',
      accountNo: companyData?.accountNo || '',
      ifsc: companyData?.ifsc || '',
      gstin: companyData?.gstin || '',
      upiId: companyData?.upiId || '',
      openingBalance: companyData?.bank ?? 0,
      openingBankDate: companyData?.openingBankDate ?? null,
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
      raw: {
        ...b,
        openingBankDate: b.openingBalanceDate ?? b.createdAt ?? null,
      },
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
  if (row.isPrimary) {
    navigateTo(PRIMARY_BANK_DETAILS_URL)
    return
  }

  navigateTo(`/accounts/bank/${row.id}`)
}

</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <UAlert class="mb-4" title="Legacy bank history" description="These records are read-only. Manage bank accounts and opening balances in Accountant." />
    <UButton class="mb-4" to="/accountant/chart-of-accounts">Open Accountant</UButton>
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
          <UButton label="Details" variant="ghost" color="gray" @click="goToDetails(row)" />
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

  </UDashboardPanelContent>
</template>
