<script setup lang="ts">
import { ref, computed } from 'vue'
import { format } from 'date-fns'

import InvestmentForm from '~/components/Investment/Form.vue'
import InvestmentTransferForm from '~/components/Investment/TransferForm.vue'

import {
  useCreateInvestment,
  useUpdateInvestment,
  useDeleteInvestment,
  useCreateAccountTransfer,
  useFindManyInvestment,
  useFindManyAccountTransfer,
} from '~/lib/hooks'

const toast = useToast()
const useAuth = () => useNuxtApp().$auth

/* ---------------------------------------------------
   HOOKS
--------------------------------------------------- */
const createInvestment = useCreateInvestment({ optimisticUpdate: true })
const updateInvestment = useUpdateInvestment({ optimisticUpdate: true })
const deleteInvestment = useDeleteInvestment({ optimisticUpdate: true })
const createTransfer = useCreateAccountTransfer({ optimisticUpdate: true })

/* ---------------------------------------------------
   MODAL STATE
--------------------------------------------------- */
const showInvestmentForm = ref(false)
const showTransferForm = ref(false)
const selectedInvestment = ref<any | null>(null)

/* ---------------------------------------------------
   OPEN / CLOSE
--------------------------------------------------- */
const openInvestmentForm = (row = null) => {
  selectedInvestment.value = row
  showInvestmentForm.value = true
}

const openTransferForm = () => {
  showTransferForm.value = true
}

const closeInvestmentForm = () => {
  showInvestmentForm.value = false
  selectedInvestment.value = null
}

const closeTransferForm = () => {
  showTransferForm.value = false
}

/* ---------------------------------------------------
   CREATE INVESTMENT
--------------------------------------------------- */
const addInvestment = (investment: any) => {
  createInvestment.mutate({
    data: {
      ...(investment.date && {
        createdAt: new Date(investment.date).toISOString(),
      }),
      direction: investment.direction,
      amount: Number(investment.amount),
      paymentMode: investment.paymentMode,
      status: investment.status || 'COMPLETED',
      ...(investment.note && { note: investment.note }),

      user: {
        connect: {
          companyId_userId: {
            companyId: useAuth().session.value!.companyId,
            userId: investment.userId,
          },
        },
      },

      company: {
        connect: {
          id: useAuth().session.value!.companyId,
        },
      },
    },
  })

  toast.add({ title: 'Investment added', color: 'green' })
}

/* ---------------------------------------------------
   UPDATE INVESTMENT
--------------------------------------------------- */
const editInvestment = async (id: string, data: any) => {
  await updateInvestment.mutateAsync({
    where: { id },
    data: {
      ...(data.date && {
        createdAt: new Date(data.date).toISOString(),
      }),
      direction: data.direction,
      amount: Number(data.amount),
      paymentMode: data.paymentMode,
      status: data.status,
      ...(data.note && { note: data.note }),
      user: {
        connect: {
          companyId_userId: {
            companyId: useAuth().session.value!.companyId,
            userId: data.userId,
          },
        },
      },
    },
  })

  toast.add({ title: 'Investment updated', color: 'green' })
}

/* ---------------------------------------------------
   DELETE INVESTMENT
--------------------------------------------------- */
const deleteInvestmentRow = async (id: string) => {
  await deleteInvestment.mutateAsync({ where: { id } })
  toast.add({ title: 'Investment deleted', color: 'green' })
}

/* ---------------------------------------------------
   SAVE INVESTMENT HANDLER
--------------------------------------------------- */
const saveInvestment = async (form: any) => {
  if (selectedInvestment.value) {
    await editInvestment(selectedInvestment.value.id, form)
  } else {
    addInvestment(form)
  }
  closeInvestmentForm()
}

/* ---------------------------------------------------
   SAVE TRANSFER HANDLER ✅ (FIX)
--------------------------------------------------- */
const saveTransfer = async (transfer: any) => {
  try {
    // 1️⃣ Create Account Transfer
    await createTransfer.mutateAsync({
      data: {
        ...(transfer.date && {
          createdAt: new Date(transfer.date).toISOString(),
        }),

        fromType: transfer.fromType,
        toType: transfer.toType,
        amount: transfer.amount,
        ...(transfer.note && { note: transfer.note }),

        company: {
          connect: {
            id: useAuth().session.value!.companyId,
          },
        },
      },
    })

    // 2️⃣ Auto-create Investment when needed
    if (transfer.fromType === 'CASH' && transfer.toType === 'INVESTMENT') {
      createInvestment.mutate({
        data: {
          direction: 'IN',
          amount: transfer.amount,
          paymentMode: 'CASH',
          status: 'COMPLETED',
          company: {
            connect: { id: useAuth().session.value!.companyId },
          },
        },
      })
    }

    if (transfer.fromType === 'BANK' && transfer.toType === 'INVESTMENT') {
      createInvestment.mutate({
        data: {
          direction: 'IN',
          amount: transfer.amount,
          paymentMode: 'BANK',
          status: 'COMPLETED',
          company: {
            connect: { id: useAuth().session.value!.companyId },
          },
        },
      })
    }

    toast.add({
      title: 'Transfer completed',
      color: 'green',
    })

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
   FETCH DATA
--------------------------------------------------- */
const investmentQuery = computed(() => ({
  where: { companyId: useAuth().session.value?.companyId },
  include: { user: true },
}))

const transferQuery = computed(() => ({
  where: { companyId: useAuth().session.value?.companyId },
}))

const { data: investments } = useFindManyInvestment(investmentQuery)
const { data: transfers } = useFindManyAccountTransfer(transferQuery)

/* ---------------------------------------------------
   COMBINED ROWS
--------------------------------------------------- */
const rows = computed(() => {
  const inv =
    investments.value?.map(i => ({
      id: i.id,
      date: i.createdAt,
      entryType: 'INVESTMENT',
      details: i.direction === 'IN' ? 'Capital Invested' : 'Capital Withdrawn',
      user: i.user?.name,
      amount: i.amount,
      note: i.note,
      raw: i,
    })) ?? []

  const tr =
    transfers.value?.map(t => ({
      id: t.id,
      date: t.createdAt,
      entryType: 'TRANSFER',
      details: `${t.fromType} → ${t.toType}`,
      user: '-',
      amount: t.amount,
      note: t.note,
      raw: t,
    })) ?? []

  return [...inv, ...tr].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
})

/* ---------------------------------------------------
   TOTALS
--------------------------------------------------- */
const pageTotal = computed(() => rows.value.length)

const totalAmount = computed(() =>
  rows.value
    .filter(r => r.entryType === 'INVESTMENT')
    .reduce((sum, r) => sum + Number(r.amount || 0), 0)
)

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(v ?? 0)
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

    <!-- ACTION BUTTONS -->
    <div class="flex gap-2 mb-4">
      <UButton color="primary" @click="openInvestmentForm()">
        Add Investment
      </UButton>

      <UButton color="gray" @click="openTransferForm">
        Investment Transfer
      </UButton>
    </div>

    <!-- TABLE -->
    <UTable :rows="rows" :columns="[
      { key: 'date', label: 'Date' },
      { key: 'entryType', label: 'Type' },
      { key: 'details', label: 'Details' },
      { key: 'user', label: 'User' },
      { key: 'amount', label: 'Amount' },
      { key: 'note', label: 'Note' },
    ]">
      <template #date-data="{ row }">
        {{ format(row.date, 'd MMM y') }}
      </template>

      <template #amount-data="{ row }">
        {{ formatCurrency(row.amount) }}
      </template>
    </UTable>

    <!-- MODALS -->
    <UModal v-model="showInvestmentForm">
      <InvestmentForm
        :investment="selectedInvestment"
        @save="saveInvestment"
        @cancel="closeInvestmentForm"
      />
    </UModal>

    <UModal v-model="showTransferForm">
      <InvestmentTransferForm
        @save="saveTransfer"
        @cancel="closeTransferForm"
      />
    </UModal>
  </UDashboardPanelContent>
</template>
