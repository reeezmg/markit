<script setup lang="ts">
import { ref, computed } from 'vue'
import { format } from 'date-fns'

import { useFindManyInvestment } from '~/lib/hooks/investment'
const useAuth = () => useNuxtApp().$auth
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

</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <UAlert class="mb-4" title="Legacy investment history" description="Use Investors & ownership in Accountant for capital, shares and profit payouts. All legacy rows are read-only here." />
    <UButton class="mb-4" to="/investments/investors" icon="i-heroicons-arrow-top-right-on-square">Open Investments</UButton>

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
        ]"
      >
        <template #date-data="{ row }">
          {{ format(row.date, 'd MMM yyyy') }}
        </template>

        <template #amount-data="{ row }">
          {{ formatCurrency(row.amount) }}
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
