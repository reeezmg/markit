<script setup lang="ts">
import type { ExpenseParty } from '~/utils/expense-party';
import ExpenseList from '~/components/Expense/ExpenseList.vue';
import ExpenseQuickAdd from '~/components/Expense/ExpenseQuickAdd.vue';
import ExpenseForm from '~/components/Expense/ExpenseForm.vue';
const props = defineProps<{ companyId: string; distributorId: string; distributorName: string }>();
const companyScope = useCompanyScope('form');
watch(() => props.companyId, id => { void companyScope.selectOwner(id); }, { immediate: true });
const party = computed<ExpenseParty>(() => ({ kind: 'distributor', id: props.distributorId, name: props.distributorName, key: `distributor:${props.distributorId}` }));
const { creating, updating, createExpense, updateExpense, deleteExpense } = useExpenseMutations();
const quickAdd = ref<any>(null);
const editing = ref<any>(null);
const open = ref(false);
async function create(value: any) { if (await createExpense(value)) quickAdd.value?.reset(); }
async function save(value: any) { if (await updateExpense(editing.value.id, value)) open.value = false; }
</script>
<template>
  <div class="space-y-3">
    <p class="text-xs text-gray-500">Expenses assigned to this distributor. Purchase-payment expenses are managed in Payments.</p>
    <ExpenseList :company-id="companyId" :distributor-id="distributorId" @edit="editing=$event; open=true" @delete="deleteExpense">
      <template #quick-add>
        <ExpenseQuickAdd ref="quickAdd" :company-id="companyId" :default-party="party" :loading="creating" @create="create" />
      </template>
    </ExpenseList>
    <UModal v-model="open">
      <ExpenseForm v-if="open" :expense="editing" :loading="updating" submit-label="Update" @save="save" @cancel="open=false" />
    </UModal>
  </div>
</template>
