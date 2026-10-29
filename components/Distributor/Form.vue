<script setup lang="ts">
import { accountDefaultGroups, acceptsDefaultAccount } from '~/utils/account-defaults';

const props = defineProps<{
  selectedSupplier?: any; openingDue?: number; openingDueDate?: string;
  companyId?: string; distributorCompanyKey?: { distributorId: string; companyId: string } | null;
}>();
const emit = defineEmits(['transferred', 'saved', 'cancel', 'busy']);
const companyScope = useCompanyScope('form');
const $fetch = companyScope.fetch;
const { invalidateModels } = useModelCache();
const toast = useToast();
const iscreating = ref(false);
const initializing = ref(true);
const loading = ref(true);
const error = ref('');
const data = ref<any>(null);
const accountingAccounts = ref<Record<string, string>>({});
const fields = accountDefaultGroups.purchase.fields;
const companyLink = computed(() => props.distributorCompanyKey || (props.selectedSupplier?.companyId
  ? { distributorId: props.selectedSupplier.id, companyId: props.selectedSupplier.companyId } : null));
const editingId = computed(() => companyLink.value?.distributorId || props.selectedSupplier?.id || '');
const supplier = ref<any>({});
const dateOnly = (value: any) => value ? new Date(value).toISOString().slice(0, 10) : '';
function formValues(value: any = {}, openingDue = 0, openingDueDate: any = '') {
  value = value || {};
  return { id: value.id || '', name: value.name || '', status: value.status ?? true,
    accHolderName: value.accHolderName || '', bankName: value.bankName || '', accountNo: value.accountNo || '',
    ifsc: value.ifsc || '', upiId: value.upiId || '', gstin: value.gstin || '',
    phoneNo: value.address?.phoneNo || '', street: value.address?.street || '', locality: value.address?.locality || '',
    landmark: value.address?.landmark || '', houseDetails: value.address?.houseDetails || '',
    city: value.address?.city || '', state: value.address?.state || '', pincode: value.address?.pincode || '',
    openingDue: Number(openingDue || 0), openingDueDate: dateOnly(openingDueDate) };
}
supplier.value = formValues(props.selectedSupplier, props.openingDue, props.openingDueDate);
const options = (role: string) => (data.value?.accounts || []).filter((a: any) => acceptsDefaultAccount(fields[role], a))
  .map((a: any) => ({ label: `${a.code ? a.code + ' - ' : ''}${a.name}`, value: a.id }));
const accountsComplete = computed(() => !data.value?.canManageAccounts || Object.entries(fields).every(([key, field]) =>
  (data.value?.accounts || []).some((account: any) => account.id === accountingAccounts.value[key] && acceptsDefaultAccount(field, account))));
let generation = 0;
let initialization = 0;
onBeforeUnmount(() => { generation++; initialization++; emit('busy', false); });
async function loadForm(resetProfile = false) {
  const current = ++generation;
  loading.value = true;
  error.value = '';
  data.value = null;
  accountingAccounts.value = {};
  try {
    const result = await $fetch<any>('/api/distributor/form', { query: editingId.value ? { id: editingId.value } : {} });
    if (current !== generation) return;
    data.value = result;
    if (resetProfile) supplier.value = formValues(result.distributor, result.openingDue, result.openingDueDate);
    accountingAccounts.value = Object.fromEntries(Object.entries(result.mappings || {}).filter(([key]) => key in fields));
  } catch (e: any) {
    if (current === generation) error.value = e?.data?.statusMessage || 'Could not load distributor details and accounts';
  } finally { if (current === generation) loading.value = false; }
}
async function initializeForm() {
  const current = ++initialization;
  generation++;
  const link = companyLink.value;
  const owner = link?.companyId || props.companyId;
  initializing.value = true;
  loading.value = true;
  try {
    await companyScope.ready;
    if (current !== initialization) return;
    await companyScope.beginForm(link ? { model: 'DistributorCompany', id: link.distributorId, companyId: link.companyId } : null);
    if (current !== initialization) return;
    if (owner) await companyScope.selectOwner(owner);
    if (current !== initialization) return;
    await loadForm(true);
  } catch (e: any) {
    if (current !== initialization) return;
    error.value = e?.data?.statusMessage || 'Could not load the distributor company'; loading.value = false;
  } finally { if (current === initialization) initializing.value = false; }
}
watch(() => [editingId.value, companyLink.value?.companyId, props.companyId], initializeForm, { immediate: true });
watch(companyScope.companyId, () => { if (!initializing.value) loadForm(false); });
async function submitForm() {
  if (iscreating.value || loading.value || initializing.value || error.value || !data.value) return;
  if (!supplier.value.name.trim()) return toast.add({ title: 'Enter a distributor name', color: 'red' });
  if (!accountsComplete.value) return toast.add({ title: 'Select all six accounting accounts', color: 'red' });
  iscreating.value = true;
  emit('busy', true);
  try {
    const result = await $fetch<any>('/api/distributor/save', { method: 'POST', body: {
      ...supplier.value, id: editingId.value || undefined,
      ...(data.value.canManageAccounts ? { accountingAccounts: { ...accountingAccounts.value } } : {}),
    } });
    await invalidateModels('Distributor', 'DistributorCompany', 'PurchaseOrder', 'DistributorPayment', 'AccountantManualJournal', 'AccountantAccountingAccount');
    toast.add({ title: editingId.value ? 'Distributor updated' : 'Distributor added', color: 'green' });
    emit('saved', result.distributor);
  } catch (e: any) {
    toast.add({ title: 'Could not save distributor', description: e?.data?.statusMessage || e?.message, color: 'red' });
  } finally { iscreating.value = false; emit('busy', false); }
}
</script>

<template>
  <form class="flex h-dvh flex-col bg-white dark:bg-gray-950" @submit.prevent="submitForm">
    <header class="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-8">
      <div>
        <h2 class="text-xl font-semibold">{{ editingId ? 'Edit distributor' : 'New distributor' }}</h2>
        <p class="mt-1 text-sm text-gray-500">Supplier details, opening balance and accounting accounts</p>
      </div>
      <UButton aria-label="Close distributor form" icon="i-heroicons-x-mark" color="gray" variant="ghost" :disabled="iscreating" @click="emit('cancel')" />
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
      <div class="mx-auto max-w-6xl space-y-6">
        <CompanyFormField :locked="iscreating || loading" @transferred="emit('transferred')" />
        <div v-if="loading" role="status" class="text-sm text-gray-500">Loading distributor details and accounts...</div>
        <UAlert v-if="error" color="red" title="Could not load distributor" :description="error">
          <template #actions><UButton label="Retry" color="gray" @click="initializeForm" /></template>
        </UAlert>
        <fieldset class="grid gap-6 lg:grid-cols-2" :disabled="loading || initializing || iscreating || !!error">
          <section class="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 class="mb-4 text-base font-semibold">Distributor details</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormGroup label="Distributor name" required class="sm:col-span-2"><UInput v-model="supplier.name" required placeholder="Enter distributor name" /></UFormGroup>
              <UFormGroup label="Contact phone"><UInput v-model="supplier.phoneNo" type="tel" placeholder="Phone number" /></UFormGroup>
              <UFormGroup label="GSTIN"><UInput v-model="supplier.gstin" placeholder="GST registration number" /></UFormGroup>
              <UFormGroup label="Status"><UCheckbox v-model="supplier.status" label="Active distributor" /></UFormGroup>
              <p v-if="data?.distributorNumber != null" class="self-end pb-2 text-sm text-gray-500">Distributor number: {{ data.distributorNumber }}</p>
            </div>
          </section>
          <section class="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 class="mb-4 text-base font-semibold">Address</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormGroup label="Building / house"><UInput v-model="supplier.houseDetails" /></UFormGroup>
              <UFormGroup label="Street"><UInput v-model="supplier.street" /></UFormGroup>
              <UFormGroup label="Locality"><UInput v-model="supplier.locality" /></UFormGroup>
              <UFormGroup label="Landmark"><UInput v-model="supplier.landmark" /></UFormGroup>
              <UFormGroup label="City"><UInput v-model="supplier.city" /></UFormGroup>
              <UFormGroup label="State"><UInput v-model="supplier.state" /></UFormGroup>
              <UFormGroup label="Pincode"><UInput v-model="supplier.pincode" /></UFormGroup>
            </div>
          </section>
          <section class="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 class="mb-4 text-base font-semibold">Bank details</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormGroup label="Account holder name"><UInput v-model="supplier.accHolderName" /></UFormGroup>
              <UFormGroup label="Bank name"><UInput v-model="supplier.bankName" /></UFormGroup>
              <UFormGroup label="Account number"><UInput v-model="supplier.accountNo" /></UFormGroup>
              <UFormGroup label="IFSC code"><UInput v-model="supplier.ifsc" /></UFormGroup>
              <UFormGroup label="UPI ID" class="sm:col-span-2"><UInput v-model="supplier.upiId" /></UFormGroup>
            </div>
          </section>
          <section class="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
            <h3 class="mb-4 text-base font-semibold">Opening balance</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormGroup label="Opening due date"><UInput v-model="supplier.openingDueDate" type="date" /></UFormGroup>
              <UFormGroup label="Opening due amount"><UInput v-model.number="supplier.openingDue" type="number" step="0.01" /></UFormGroup>
            </div>
            <p class="mt-3 text-sm text-gray-500">Positive means you owe the distributor; negative means the distributor owes you. Use the balance from before the first recorded transaction.</p>
          </section>
          <section class="rounded-xl border border-gray-200 p-5 dark:border-gray-800 lg:col-span-2">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-base font-semibold">Accounting accounts</h3>
              <UBadge v-if="data?.enabled" color="green" variant="soft">Connected</UBadge>
            </div>
            <template v-if="data?.canManageAccounts">
              <p class="mb-4 text-sm text-gray-500">Company purchase defaults are prefilled. Existing distributor selections are kept. You can choose different accounts for this distributor.</p>
              <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <UFormGroup v-for="(field, key) in fields" :key="key" :label="field.label" required>
                  <USelectMenu v-model="accountingAccounts[key]" :options="options(String(key))" option-attribute="label" value-attribute="value" searchable placeholder="Select an account" />
                  <p v-if="!options(String(key)).length" class="mt-1 text-xs text-amber-600">No compatible account is available in this company's chart of accounts.</p>
                </UFormGroup>
              </div>
              <p class="mt-4 text-sm text-gray-500">{{ data.enabled ? 'Saving updates the defaults for future transactions. Existing posted entries keep their saved accounts.' : 'Saving connects this distributor to accounting and includes its opening balance and existing unposted purchase, credit, payment and return history.' }}</p>
            </template>
            <p v-else-if="!loading" class="text-sm text-gray-500">An admin, manager or accountant can configure the accounting accounts for this distributor.</p>
          </section>
        </fieldset>
      </div>
    </div>
    <footer class="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-950 sm:px-8">
      <UButton label="Cancel" color="gray" variant="soft" :disabled="iscreating" @click="emit('cancel')" />
      <UButton type="submit" :loading="iscreating" :disabled="loading || initializing || !!error || !data || !accountsComplete" :label="data?.canManageAccounts ? 'Save distributor and accounts' : 'Save distributor'" />
    </footer>
  </form>
</template>
