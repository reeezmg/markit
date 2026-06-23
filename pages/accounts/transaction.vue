<script setup lang="ts">
import { ref } from 'vue'
import Form from '~/components/Accounts/Form.vue'
import List from '~/components/Accounts/List.vue'

const toast = useToast()

const addTransaction = async (tx: any) => {
  try {
    await $fetch('/api/accounts/transactions', { method: 'POST', body: tx })
    toast.add({ title: 'Entry added', color: 'green' })
  } catch (error: any) {
    toast.add({ title: 'Failed to add entry', description: error.message, color: 'red' })
  }
}

const editTransaction = async (id: string, data: any) => {
  try {
    await $fetch(`/api/accounts/transactions/${id}`, { method: 'PUT', body: data })
    toast.add({ title: 'Entry updated', color: 'green' })
  } catch (error: any) {
    toast.add({ title: 'Failed to update entry', description: error.message, color: 'red' })
  }
}

const deleteTransaction = async (id: string) => {
  try {
    await $fetch(`/api/accounts/transactions/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Entry deleted', color: 'green' })
  } catch (error: any) {
    toast.add({ title: 'Error deleting entry', description: error.message, color: 'red' })
  }
}

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

const saveTransaction = async (form: any) => {
  try {
    if (selectedTx.value) await editTransaction(selectedTx.value.id, form)
    else await addTransaction(form)
  } finally {
    closeForm()
  }
}

const pageTotal = ref(0)
const totalAmount = ref(0)

const onValues = ({ pageTotal: p, totalAmount: t }: { pageTotal: number; totalAmount: number }) => {
  pageTotal.value = p
  totalAmount.value = t
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v ?? 0)
</script>

<template>
  <UDashboardPanelContent class="pb-24">
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

    <List
      @edit="openForm"
      @delete="deleteTransaction"
      @open="openForm"
      @values="onValues"
    />

    <UModal v-model="showForm">
      <Form
        :transaction="selectedTx"
        @save="saveTransaction"
        @cancel="closeForm"
      />
    </UModal>
  </UDashboardPanelContent>
</template>
