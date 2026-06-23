<script setup lang="ts">
import { ref } from 'vue'
import ExpenseForm from '~/components/Expense/ExpenseForm.vue'
import ExpenseList from '~/components/Expense/ExpenseList.vue'

const toast = useToast()

const normalizeExpenseBody = (expense: any, expenseNumber?: number) => ({
  ...(expenseNumber != null ? { expenseNumber } : {}),
  expenseDate: expense.date,
  expensecategoryId: expense.categoryId,
  userId: expense.userId || null,
  totalAmount: Number(expense.amount) || 0,
  paymentMode: expense.paymentMode,
  status: expense.status || 'Paid',
  note: expense.note || null,
  receipt: expense.receipt || null,
  receiptName: expense.receiptName || null,
  taxAmount: Number(expense.taxAmount || 0),
})

const addExpense = async (expense: any) => {
  try {
    const { number: expenseNumber } = await $fetch<{ number: number }>('/api/counter/increment', {
      method: 'POST',
      body: { entity: 'expense' },
    })
    await $fetch('/api/accounts/expenses', {
      method: 'POST',
      body: normalizeExpenseBody(expense, expenseNumber),
    })
    toast.add({ title: 'Expense added', color: 'green' })
  } catch (error: any) {
    toast.add({ title: 'Failed to create expense', description: error.message, color: 'red' })
  }
}

const editExpense = async (id: string, data: any) => {
  try {
    await $fetch(`/api/accounts/expenses/${id}`, {
      method: 'PUT',
      body: normalizeExpenseBody(data),
    })
    toast.add({ title: 'Expense updated', color: 'green' })
  } catch (error: any) {
    toast.add({ title: 'Failed to update expense', description: error.message, color: 'red' })
  }
}

const deleteExpenseRow = async (id: string) => {
  try {
    await $fetch(`/api/accounts/expenses/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Expense deleted successfully!', color: 'green' })
  } catch (error: any) {
    toast.add({ title: 'Error while deleting expense', description: error.message, color: 'red' })
  }
}

const showForm = ref(false)
const selectedExpense = ref<any | null>(null)

const openForm = (expense = null) => {
  selectedExpense.value = expense
  showForm.value = true
}

const closeForm = () => {
  showForm.value = false
  selectedExpense.value = null
}

const saveExpense = async (form: any) => {
  try {
    if (selectedExpense.value) await editExpense(selectedExpense.value.id, form)
    else await addExpense(form)
  } finally {
    closeForm()
  }
}
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div>
      <ExpenseList
        @edit="openForm"
        @delete="deleteExpenseRow"
        @open="openForm"
      />

      <UModal v-model="showForm">
        <ExpenseForm
          :expense="selectedExpense"
          @save="saveExpense"
          @cancel="closeForm"
        />
      </UModal>
    </div>
  </UDashboardPanelContent>
</template>
