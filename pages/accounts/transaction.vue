<script setup lang="ts">
import { ref } from 'vue'
import Form from '~/components/Accounts/Form.vue'
import List from '~/components/Accounts/List.vue'

import {
  useCreateMoneyTransaction,
  useUpdateMoneyTransaction,
  useDeleteMoneyTransaction,
} from '~/lib/hooks'

const createTx = useCreateMoneyTransaction({ optimisticUpdate: true })
const updateTx = useUpdateMoneyTransaction({ optimisticUpdate: true })
const deleteTx = useDeleteMoneyTransaction({ optimisticUpdate: true })

const toast = useToast()
const useAuth = () => useNuxtApp().$auth

/* ---------------------------------------------------
   CREATE
--------------------------------------------------- */
const addTransaction = async (tx: any) => {
  try {
    await createTx.mutateAsync({
      data: {
        partyType: tx.partyType,
        direction: tx.direction,
        status: tx.status || 'PENDING',
        amount: Number(tx.amount) || 0,
        paymentMode: tx.paymentMode,

        // ✅ BANK ACCOUNT (optional)
        ...(tx.accountId && { accountId: tx.accountId }),

        ...(tx.note && { note: tx.note }),

        company: {
          connect: {
            id: useAuth().session.value?.companyId,
          },
        },
      },
    })

    toast.add({
      title: 'Entry added',
      color: 'green',
    })
  } catch (error: any) {
    toast.add({
      title: 'Failed to add entry',
      description: error.message,
      color: 'red',
    })
  }
}

/* ---------------------------------------------------
   UPDATE
--------------------------------------------------- */
const editTransaction = async (id: string, data: any) => {
  try {
    await updateTx.mutateAsync({
      where: { id },
      data: {
        partyType: data.partyType,
        direction: data.direction,
        status: data.status,
        amount: Number(data.amount),
        paymentMode: data.paymentMode,

        // ✅ BANK ACCOUNT (can be null)
        accountId: data.accountId ?? null,

        ...(data.note && { note: data.note }),
      },
    })

    toast.add({
      title: 'Entry updated',
      color: 'green',
    })
  } catch (error: any) {
    toast.add({
      title: 'Failed to update entry',
      description: error.message,
      color: 'red',
    })
  }
}

/* ---------------------------------------------------
   DELETE
--------------------------------------------------- */
const deleteTransaction = async (id: string) => {
  try {
    await deleteTx.mutateAsync({ where: { id } })

    toast.add({
      title: 'Entry deleted',
      color: 'green',
    })
  } catch (error: any) {
    toast.add({
      title: 'Error deleting entry',
      description: error.message,
      color: 'red',
    })
  }
}

/* ---------------------------------------------------
   FORM STATE
--------------------------------------------------- */
const showForm = ref(false)
const selectedTx = ref<any | null>(null)

const openForm = (tx = null) => {
  selectedTx.value = tx
  showForm.value = true
}

const closeForm = () => {
  showForm.value = false
  selectedTx.value = null
}

/* ---------------------------------------------------
   SAVE HANDLER
--------------------------------------------------- */
const saveTransaction = async (form: any) => {
  try {
    if (selectedTx.value) {
      await editTransaction(selectedTx.value.id, form)
    } else {
      await addTransaction(form)
    }
  } finally {
    closeForm()
  }
}

/* ---------------------------------------------------
   TOTALS
--------------------------------------------------- */
const pageTotal = ref(0)
const totalAmount = ref(0)

const onValues = ({ pageTotal: p, totalAmount: t }) => {
  pageTotal.value = p
  totalAmount.value = t
}

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
        <div class="text-sm text-gray-500">Total Amount</div>
        <div class="text-xl font-semibold">
          {{ formatCurrency(totalAmount) }}
        </div>
      </UCard>
    </div>

    <!-- LIST -->
    <List
      @edit="openForm"
      @delete="deleteTransaction"
      @open="openForm"
      @values="onValues"
    />

    <!-- FORM MODAL -->
    <UModal v-model="showForm">
      <Form
        :transaction="selectedTx"
        @save="saveTransaction"
        @cancel="closeForm"
      />
    </UModal>
  </UDashboardPanelContent>
</template>
