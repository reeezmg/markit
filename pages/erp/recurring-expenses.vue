<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query';
import { indiaExpenseDate, recurringExpenseInput } from '~/utils/recurring-expenses';

const scope = useCompanyScope('form');
const toast = useToast();
const queryClient = useQueryClient();
const { categories, loadCategories, createCategory } = useExpenseFormOptions();
const { data: schedules, pending, error, refresh } = await useCompanyFetch<any[]>('/api/accounts/recurring-expenses');
const modal = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const processing = ref(false);
const toggling = ref<string | null>(null);
const formError = ref('');
const newCategory = ref('');
const addingCategory = ref(false);
const defaults = () => ({ name: '', categoryId: '', note: '', totalAmount: '' as number | string,
  taxAmount: 0 as number | string, recoverableTaxAmount: null as number | string | null,
  nextDueDate: indiaExpenseDate(), dayOfMonth: Number(indiaExpenseDate().slice(8)), active: true });
const form = ref(defaults());
const columns = [
  { key: 'name', label: 'Expense' }, { key: 'categoryName', label: 'Category' },
  { key: 'totalAmount', label: 'Monthly amount' }, { key: 'nextDueDate', label: 'Next due' },
  { key: 'active', label: 'Status' }, { key: 'actions', label: '' },
];
const errorMessage = (e: any) => e?.data?.statusMessage || e?.message || 'Please try again';
function open(row?: any) {
  editingId.value = row?.id || null;
  form.value = row ? { ...defaults(), ...row } : defaults();
  formError.value = '';
  newCategory.value = '';
  modal.value = true;
  void loadCategories().catch(e => { formError.value = errorMessage(e); });
}
async function save() {
  formError.value = '';
  let body;
  try { body = recurringExpenseInput(form.value); }
  catch (e: any) { formError.value = e.message; return; }
  saving.value = true;
  try {
    await scope.fetch(`/api/accounts/recurring-expenses${editingId.value ? '/' + editingId.value : ''}`, {
      method: editingId.value ? 'PUT' : 'POST', body,
    });
    modal.value = false;
    await refresh();
    toast.add({ title: 'Recurring expense saved', color: 'green' });
  } catch (e) { formError.value = errorMessage(e); }
  finally { saving.value = false; }
}
async function toggle(row: any) {
  toggling.value = row.id;
  try {
    await scope.fetch(`/api/accounts/recurring-expenses/${row.id}`, { method: 'PATCH', body: { active: !row.active } });
    await refresh();
  } catch (e) { toast.add({ title: 'Could not update schedule', description: errorMessage(e), color: 'red' }); }
  finally { toggling.value = null; }
}
async function processDue() {
  processing.value = true;
  try {
    const result = await scope.fetch<{ created: number; failed: number; remaining: number }>('/api/accounts/recurring-expenses/process', { method: 'POST' });
    await refresh();
    await queryClient.invalidateQueries({ queryKey: ['expenses'] });
    toast.add({ title: `${result.created} expense(s) generated`,
      description: `${result.failed} failed. ${result.remaining} schedule(s) still due.`, color: result.failed ? 'orange' : 'green' });
  } catch (e) { toast.add({ title: 'Could not generate expenses', description: errorMessage(e), color: 'red' }); }
  finally { processing.value = false; }
}
async function addCategory() {
  if (!newCategory.value.trim()) return;
  addingCategory.value = true;
  try {
    const category = await createCategory(newCategory.value.trim());
    form.value.categoryId = category.id;
    newCategory.value = '';
  } catch (e) { formError.value = errorMessage(e); }
  finally { addingCategory.value = false; }
}
watch(scope.companyId, () => { modal.value = false; form.value = defaults(); });
</script>

<template>
  <UDashboardPanelContent class="pb-24 space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="text-xl font-semibold">Recurring Expense</h1><p class="text-sm text-gray-500">Schedule fixed monthly expenses such as rent and salaries.</p></div>
      <div class="flex gap-2">
        <UButton color="gray" :loading="processing" @click="processDue">Generate due expenses</UButton>
        <UButton icon="i-heroicons-plus" @click="open()">Add recurring expense</UButton>
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-3"><CompanyFormField /></div>
    <UAlert color="blue" title="Generated as pending expenses" description="Due entries appear in Daily Expense, where you can edit the amount and record payment. Schedules run daily at 6:00 AM India time. Resuming a paused schedule catches up from its next due date; edit that date to skip paused months. Use Daily Expense for bills whose amount changes each month." />
    <UAlert v-if="error" color="red" title="Could not load recurring expenses" :description="errorMessage(error)" :actions="[{ label: 'Retry', click: () => refresh() }]" />
    <UTable :rows="schedules || []" :columns="columns" :loading="pending" :empty-state="{ icon: 'i-heroicons-arrow-path', label: 'No recurring expenses yet. Add your first monthly schedule.' }">
      <template #name-data="{ row }"><div class="font-medium">{{ row.name }}</div><div v-if="row.lastError" class="max-w-xs text-xs text-red-500">{{ row.lastError }}</div></template>
      <template #totalAmount-data="{ row }">{{ Number(row.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</template>
      <template #nextDueDate-data="{ row }">{{ row.nextDueDate }}<div class="text-xs text-gray-500">Day {{ row.dayOfMonth }} of each month</div></template>
      <template #active-data="{ row }"><UBadge :color="row.active ? 'green' : 'gray'" variant="subtle">{{ row.active ? 'Active' : 'Paused' }}</UBadge></template>
      <template #actions-data="{ row }"><div class="flex gap-2"><UButton color="gray" variant="ghost" @click="open(row)">Edit</UButton><UButton color="gray" variant="ghost" :loading="toggling === row.id" :disabled="!!toggling" @click="toggle(row)">{{ row.active ? 'Pause' : 'Resume' }}</UButton></div></template>
    </UTable>
    <UButton to="/erp/expenses" color="gray" variant="link">View Daily Expense</UButton>
    <UModal v-model="modal" :prevent-close="saving">
      <UCard>
        <template #header><h2 class="font-semibold">{{ editingId ? 'Edit recurring expense' : 'Add recurring expense' }}</h2></template>
        <form class="space-y-4" @submit.prevent="save">
          <UAlert v-if="formError" color="red" :title="formError" />
          <UFormGroup label="Name" required><UInput v-model="form.name" placeholder="Shop rent" maxlength="120" required /></UFormGroup>
          <UFormGroup label="Category" required><USelect v-model="form.categoryId" :options="categories" option-attribute="name" value-attribute="id" placeholder="Select category" required /></UFormGroup>
          <div class="flex gap-2"><UInput v-model="newCategory" placeholder="New category name" class="flex-1" /><UButton type="button" color="gray" :loading="addingCategory" :disabled="!newCategory.trim()" @click="addCategory">Add category</UButton></div>
          <UFormGroup label="Monthly amount (including tax)" required><UInput v-model="form.totalAmount" type="number" min="0.01" step="0.01" required /></UFormGroup>
          <ExpenseTaxFields v-model:tax="form.taxAmount" v-model:recoverable="form.recoverableTaxAmount" />
          <div class="grid grid-cols-2 gap-3">
            <UFormGroup label="Next due date" required><UInput v-model="form.nextDueDate" type="date" min="2000-01-01" max="2100-12-31" required @update:model-value="form.dayOfMonth = Number(String($event).slice(8))" /></UFormGroup>
            <UFormGroup label="Monthly day" required help="Shorter months use their last day."><UInput v-model="form.dayOfMonth" type="number" min="1" max="31" required /></UFormGroup>
          </div>
          <UFormGroup label="Note"><UTextarea v-model="form.note" maxlength="350" /></UFormGroup>
          <UCheckbox v-model="form.active" label="Schedule active" />
          <p class="text-xs text-gray-500">Changes apply to future generated entries. Existing expenses stay as recorded.</p>
          <div class="flex justify-end gap-2"><UButton type="button" color="gray" :disabled="saving" @click="modal = false">Cancel</UButton><UButton type="submit" :loading="saving">Save schedule</UButton></div>
        </form>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
