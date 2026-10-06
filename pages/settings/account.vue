<script setup lang="ts">
import { accountDefaultGroups, acceptsDefaultAccount } from '~/utils/account-defaults';
definePageMeta({ auth: true });
const api = useAccountantApi(), toast = useToast();
const auth = useNuxtApp().$auth;
const allowed = computed(() => ['admin', 'manager', 'accountant'].includes(auth.session.value?.role || ''));
const canManageProfit = computed(() => ['admin', 'manager'].includes(auth.session.value?.role || ''));
const request = (method: 'GET'|'PUT'|'POST', path: string, body?: any, owner = api.companyId.value) => $fetch<any>(`/api/accountant${path}`, { method, headers: { 'x-company-id': owner, 'x-company-filter': owner }, ...(body === undefined ? {} : { body }) });
const erp = ref<any>(null), staff = ref<any>(null), ecommerce = ref<any>(null), data = ref<any>(null);
const busy = ref(''), error = ref(''), loading = ref(false), supplier = ref('');
const profitSettings = ref<any>(null);
const investors = ref<any[]>([]), selectedInvestor = ref(''), editInvestor = ref(false);
const investorProfile = computed(() => investors.value.find(i => i.id === selectedInvestor.value));
const groups = [
  { key: 'billing', title: 'Billing & sales', owner: 'erp', fields: { cash: ['Cash', 'CASH'], bank: ['Payment bank', 'BANK'], receivable: ['Customer credit / receivable', 'ACCOUNTS_RECEIVABLE'], sales: ['Sales income', 'INCOME'], outputTax: ['Sales tax payable', 'OTHER_CURRENT_LIABILITY'], stock: ['Stock / inventory', 'STOCK'], cogs: ['Cost of goods sold', 'COST_OF_GOODS_SOLD'] } },
  { key: 'expense', title: 'Expenses', owner: 'erp', fields: { cash: ['Cash (shared with billing)', 'CASH'], bank: ['Payment bank (shared with billing)', 'BANK'], expense: ['Expense account', 'EXPENSE'], inputTax: ['Recoverable expense tax', 'OTHER_CURRENT_ASSET'], expensePayable: ['Unpaid expenses', 'OTHER_CURRENT_LIABILITY'] } },
  { key: 'salary', title: 'Salary & staff credit', owner: 'staff', fields: { salaryExpense: ['Salary expense', 'EXPENSE'], salaryPayable: ['Salary payable', 'OTHER_CURRENT_LIABILITY'], receivable: ['Staff credit / receivable', 'ACCOUNTS_RECEIVABLE'], cash: ['Cash payments', 'CASH'], bank: ['Payment bank', 'BANK'], opening: ['Staff balance adjustments', 'OTHER_CURRENT_LIABILITY'] } },
];
const state = (owner: string) => owner === 'erp' ? erp.value : staff.value;
const options = (type: string, accounts = data.value?.accounts || []) => accounts.filter((a: any) => a.accountType === type).map((a: any) => ({ label: a.name, value: a.id }));
let generation = 0;
async function load() {
  const version = ++generation;
  loading.value = true; error.value = ''; supplier.value = '';
  selectedInvestor.value = ''; editInvestor.value = false; investors.value = [];
  erp.value = staff.value = ecommerce.value = data.value = null;
  try {
    const owner = api.companyId.value;
    const [e, s, ec, profit, investorList] = await Promise.all([request('GET','/erp',undefined,owner), request('GET','/users',undefined,owner), request('GET','/ecommerce/settings',undefined,owner), request('GET','/investor-profits/settings',undefined,owner), request('GET','/investors',undefined,owner)]);
    const d = await request('GET','/account-settings',undefined,owner);
    if (version !== generation) return;
    erp.value = e; staff.value = s; ecommerce.value = ec; data.value = d;
    profitSettings.value = profit;
    investors.value = investorList.data;
    for (const key of Object.keys(accountDefaultGroups)) data.value.defaults[key] ||= {};
  } catch (e: any) { if (version === generation) error.value = e.message; }
  finally { if (version === generation) loading.value = false; }
}
async function saveMapping(group: typeof groups[number], enable = false) {
  const owner = api.companyId.value, edited = { ...state(group.owner).mappings };
  busy.value = group.key;
  try {
    const endpoint = group.owner === 'erp' ? '/erp' : '/users';
    // Merge only this section with current saved settings to preserve other groups.
    const current = await request('GET',endpoint,undefined,owner);
    const mappings = { ...current.mappings };
    for (const key of Object.keys(group.fields)) mappings[key] = edited[key];
    if (group.owner === 'staff') for (const [key, value] of Object.entries(edited)) if (key.startsWith('bank:')) mappings[key] = value;
    await request('PUT',endpoint, { mappings },owner);
    if (enable) await request('POST',`${endpoint}/enable`,undefined,owner);
    const saved = await request('GET',endpoint,undefined,owner);
    if (owner === api.companyId.value && state(group.owner)) state(group.owner).enabled = saved.enabled;
    toast.add({ title: `${group.title} account settings saved`, color: 'green' });
  } catch (e:any) { error.value=e.data?.statusMessage || e.message; } finally { busy.value = ''; }
}
async function saveDefaults(key: string) {
  if (busy.value) return;
  busy.value = key;
  error.value = '';
  const owner = api.companyId.value;
  try {
    await request('PUT', `/account-settings/${key}`, {
      mappings: { ...data.value.defaults[key] },
      ...(key === 'investments' && canManageProfit.value ? { profitDistributionAccountId: profitSettings.value.accountId } : {}),
    }, owner);
    toast.add({ title: key === 'investments' ? 'Investment account settings saved' : 'Default accounts saved', color: 'green' });
  }
  catch (e:any) { if (owner === api.companyId.value) error.value = e.data?.statusMessage || e.message; }
  finally { busy.value = ''; }
}
async function saveEcommerce(enable = false) {
  busy.value = 'ecommerce';
  try {
    const owner=api.companyId.value;
    const saved=await request(enable?'POST':'PUT',enable?'/ecommerce/enable':'/ecommerce/settings',{mappings:ecommerce.value.mappings},owner);
    if(owner===api.companyId.value)ecommerce.value=saved;
    toast.add({ title: 'Online sales accounts saved', color: 'green' });
  } catch (e:any) { error.value=e.data?.statusMessage || e.message; } finally { busy.value = ''; }
}
async function investorSaved() {
  editInvestor.value = false;
  const owner = api.companyId.value, version = generation;
  try {
    const result = await request('GET', '/investors', undefined, owner);
    if (version === generation && owner === api.companyId.value) investors.value = result.data;
  } catch (e:any) { if (version === generation) error.value = e.data?.statusMessage || e.message; }
}
onMounted(() => { if (allowed.value) load(); });
watch(api.companyId, () => { if (allowed.value) load(); });
const onlineLabels: Record<string,string> = { codClearing: 'COD held by couriers', gatewayClearing: 'Gateway clearing', deliveryIncome: 'Delivery income', codIncome: 'COD charge income', refundPayable: 'Customer refunds due', shippingExpense: 'Shipping expense', gatewayExpense: 'Gateway fees', loyaltyExpense: 'Loyalty rewards', cash: 'Cash', bank: 'Bank', sales: 'Sales', receivable: 'Customer receivable', outputTax: 'Sales tax', stock: 'Stock', cogs: 'Cost of goods sold', inputTax: 'Recoverable input tax', expensePayable: 'Unpaid costs' };
</script>
<template>
  <UDashboardPanelContent class="space-y-6">
    <div><h1 class="text-xl font-semibold">Account settings</h1><p class="text-sm text-gray-500 mt-1">Choose posting accounts and defaults for each workflow. Transaction forms let you change their suggested accounts when needed.</p></div>
    <UAlert v-if="!allowed" title="Account settings require an admin, manager or accountant role." color="amber" />
    <UAlert v-if="error" :title="error" color="red" />
    <UProgress v-if="loading" />
    <template v-if="data">
      <p class="text-sm text-gray-500">Saved defaults apply to new entries. Existing documents keep their recorded accounts.</p>
      <UCard v-for="group in groups" :key="group.key" :id="group.key">
        <template #header><div class="flex items-center justify-between"><h2 class="font-semibold">{{ group.title }}</h2><UBadge :color="state(group.owner).enabled ? 'green' : 'gray'">{{ state(group.owner).enabled ? 'Posting enabled' : 'Not connected' }}</UBadge></div></template>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <UFormGroup v-for="(spec, key) in group.fields" :key="key" :label="spec[0]" required><USelect v-model="state(group.owner).mappings[key]" :options="options(spec[1], state(group.owner).accounts)" :disabled="!!busy" placeholder="Select account" /></UFormGroup>
          <template v-if="group.owner === 'staff'"><UFormGroup v-for="bank in staff.banks" :key="bank.id" :label="`Payments from ${bank.name}`"><USelect v-model="staff.mappings[`bank:${bank.id}`]" :options="options('BANK')" :disabled="!!busy" placeholder="Select account" /></UFormGroup></template>
        </div>
        <div class="flex gap-3 mt-4"><UButton :loading="busy === group.key" :disabled="!!busy" @click="saveMapping(group)">Save {{ group.title.toLowerCase() }}</UButton><UButton v-if="!state(group.owner).enabled" variant="outline" :disabled="!!busy" @click="saveMapping(group, true)">Save & connect new activity</UButton></div>
      </UCard>
      <UCard v-for="(group, key) in accountDefaultGroups" :key="key" :id="String(key)">
        <template #header><h2 class="font-semibold">{{ group.title }}</h2></template>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><UFormGroup v-for="(field, role) in group.fields" :key="role" :label="field.label"><USelect v-model="data.defaults[key][role]" :options="[{ label: 'No default', value: '' }, ...data.accounts.filter((a:any) => acceptsDefaultAccount(field,a)).map((a:any) => ({ label:a.name,value:a.id }))]" :disabled="!!busy" /></UFormGroup></div>
        <div v-if="key === 'investments' && profitSettings" class="mt-4"><UFormGroup label="Profit distribution equity account"><USelect v-model="profitSettings.accountId" :options="profitSettings.accounts.map((a:any)=>({label:a.name,value:a.id}))" :disabled="!!busy || !canManageProfit" /></UFormGroup><p v-if="!canManageProfit" class="text-sm text-gray-500 mt-2">An admin or manager can change the profit distribution account.</p></div>
        <UButton class="mt-4" :loading="busy === key" :disabled="!!busy" @click="saveDefaults(String(key))">{{ key === 'investments' ? 'Save investment settings' : 'Save defaults' }}</UButton>
        <template v-if="key === 'purchase'">
          <div class="border-t mt-5 pt-5 space-y-3"><h3 class="font-medium">Supplier connections & account overrides</h3><p class="text-sm text-gray-500">Select a supplier to configure its connection, review history, or keep supplier-specific accounts. Company defaults prefill new purchase and payment forms.</p><USelectMenu v-model="supplier" :options="data.suppliers" value-attribute="id" option-attribute="name" searchable placeholder="Select supplier" /><DistributorAccounting v-if="supplier" :key="`${api.companyId.value}:${supplier}`" :company-id="api.companyId.value" :distributor-id="supplier" embedded /></div>
        </template>
        <div v-if="key === 'investments'" class="border-t mt-5 pt-5 space-y-3">
          <h3 class="font-medium">Investor account overrides</h3>
          <p class="text-sm text-gray-500">New investors use the company defaults above. Each journal row stays linked to its investor. Select an investor to review or change its accounts; existing balances keep their recorded accounts.</p>
          <USelectMenu v-model="selectedInvestor" :options="investors" value-attribute="id" option-attribute="name" searchable placeholder="Select investor" />
          <UButton v-if="investorProfile" variant="outline" @click="editInvestor = true">Edit investor account overrides</UButton>
          <InvestmentsProfileModal v-if="editInvestor && investorProfile" :key="`${api.companyId.value}:${selectedInvestor}`" :investor="investorProfile" @close="editInvestor = false" @saved="investorSaved" />
        </div>
      </UCard>
      <UCard id="ecommerce"><template #header><h2 class="font-semibold">Online sales & settlements</h2></template>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><UFormGroup v-for="(spec, role) in ecommerce.roles" :key="role" :label="onlineLabels[String(role)] || String(role)"><USelect v-model="ecommerce.mappings[role]" :options="options((spec as any).type)" :disabled="!!busy" /></UFormGroup></div>
        <UButton class="mt-4" :loading="busy === 'ecommerce'" :disabled="!!busy" @click="saveEcommerce(!ecommerce.enabled)">{{ ecommerce.enabled ? 'Save online sales accounts' : 'Save & connect new online activity' }}</UButton>
      </UCard>
      <UButton to="/accountant/chart-of-accounts" variant="outline">Manage chart of accounts</UButton>
    </template>
  </UDashboardPanelContent>
</template>
