<script setup lang="ts">
import { ref } from 'vue'
import ExpenseForm from '~/components/Expense/ExpenseForm.vue'
import ExpenseQuickAdd from '~/components/Expense/ExpenseQuickAdd.vue'
import ExpenseList from '~/components/Expense/ExpenseList.vue'

const quickAddRef = ref<{ reset: () => void | Promise<void> } | null>(null)

// Optimistic, cached mutations (TanStack Query). They patch the list cache
// immediately, roll back on DB failure, and block when offline.
const { creating, updating, createExpense, updateExpense, deleteExpense } = useExpenseMutations()

// Inline quick-add (above the table). Optimistic, so the row appears instantly
// (no spinner). The form is cleared only after the create succeeds — on failure
// (validation/DB error or offline) the inputs are kept so the user can fix and
// retry.
const addExpense = async (expense: any) => {
  if (await createExpense(expense)) quickAddRef.value?.reset()
}

const deleteExpenseRow = (id: string) => {
  deleteExpense(id)
}

// Edit modal (opened from a row's Edit action)
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
  if (!selectedExpense.value) return
  if (await updateExpense(selectedExpense.value.id, form)) closeForm()
}
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div>
      <ExpenseList
        @edit="openForm"
        @delete="deleteExpenseRow"
      >
        <!-- Inline quick-add bar renders below the KPI summary cards -->
        <template #quick-add>
          <ExpenseQuickAdd
            ref="quickAddRef"
            :loading="creating"
            @create="addExpense"
          />
        </template>
      </ExpenseList>

      <UModal v-model="showForm">
        <ExpenseForm
          :expense="selectedExpense"
          :loading="updating"
          submit-label="Update"
          @save="saveExpense"
          @cancel="closeForm"
        />
      </UModal>
    </div>
  </UDashboardPanelContent>
</template>
