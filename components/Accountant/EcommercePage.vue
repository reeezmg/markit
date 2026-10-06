<script setup lang="ts">
const api = useAccountantApi();
const toast = useToast();
const config = ref<any>(null), orders = ref<any[]>([]), selected = ref<any>(null);
const loading = ref(false), saving = ref(false), error = ref(''), search = ref(''), page = ref(1);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const form = reactive({ action: 'SETTLEMENT', date: today(), amount: 0, fee: 0, tax: 0, funding: 'gatewayClearing', category: 'shippingExpense', moneyAccountId: '', reference: '', note: '', refundDelivery: false, refundCod: false });
const returned = reactive<Record<string, number>>({});
let requestId = '', previousPayload = '';
const labels: Record<string, string> = { receivable: 'Customer amounts due', cash: 'Cash', bank: 'Bank', sales: 'Merchandise sales', outputTax: 'Output tax', stock: 'Stock', cogs: 'Cost of goods sold', inputTax: 'Recoverable input tax', expensePayable: 'Unpaid costs', codClearing: 'COD held by couriers', gatewayClearing: 'Online payments awaiting settlement', deliveryIncome: 'Delivery income', codIncome: 'COD charge income', refundPayable: 'Customer refunds due', shippingExpense: 'Courier and return costs', gatewayExpense: 'Gateway fees', loyaltyExpense: 'Redeemed loyalty rewards' };
const actions = [{ value: 'SETTLEMENT', label: 'Courier / gateway bank settlement' }, { value: 'RETURN', label: 'Receive returned items and credit customer' }, { value: 'REFUND', label: 'Record a completed customer refund' }, { value: 'COST', label: 'Record courier / gateway cost' }, { value: 'COST_PAYMENT', label: 'Pay a previously recorded unpaid cost' }, { value: 'CHARGE', label: 'Add an extra customer charge' }, { value: 'RECEIPT', label: 'Record an additional customer payment' }];
const funding = computed(() => Object.entries(labels).filter(([key]) => (form.action === 'SETTLEMENT' ? ['codClearing', 'gatewayClearing'] : form.action === 'COST' ? ['codClearing', 'gatewayClearing', 'cash', 'bank', 'expensePayable'] : ['codClearing', 'gatewayClearing', 'cash', 'bank']).includes(key)).map(([value, label]) => ({ value, label })));
const categories = computed(() => (form.action === 'CHARGE' ? ['sales', 'deliveryIncome', 'codIncome'] : ['shippingExpense', 'gatewayExpense']).map(value => ({ value, label: labels[value] })));
const moneyAccounts = computed(() => (config.value?.accounts || []).filter((a: any) => a.accountType === (form.action === 'SETTLEMENT' ? 'BANK' : form.funding.toUpperCase())).map((a: any) => ({ value: a.id, label: a.name })));
const showMoneyAccount = computed(() => form.action === 'SETTLEMENT' || ['cash', 'bank'].includes(form.funding));
const number = (n: any) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
watch(() => form.action, () => { form.category = form.action === 'CHARGE' ? 'deliveryIncome' : 'shippingExpense'; form.funding = selected.value?.order.payment_method === 'COD' ? 'codClearing' : 'gatewayClearing'; form.moneyAccountId = ''; form.amount = 0; form.tax = 0; form.fee = 0; });
function defaultMoneyAccount() { const role = form.action === 'SETTLEMENT' ? 'bank' : form.funding; return ['cash','bank'].includes(role) ? config.value?.mappings?.[role] || '' : ''; }
watch(() => [form.funding, form.action], () => { form.moneyAccountId = defaultMoneyAccount(); });
async function loadOrders() { orders.value = await api.get('/ecommerce/orders', { query: { search: search.value, page: page.value } }); }
async function load() { loading.value = true; error.value = ''; try { config.value = await api.get('/ecommerce/settings'); await loadOrders(); } catch (e: any) { error.value = e.message; } finally { loading.value = false; } }
async function open(row: any) { loading.value = true; error.value = ''; selected.value = null; try { selected.value = await api.get(`/ecommerce/orders/${row.id}`); Object.keys(returned).forEach(k => delete returned[k]); Object.assign(form, { amount: 0, fee: 0, tax: 0, reference: '', note: '', refundDelivery: false, refundCod: false }); form.funding = selected.value.order.payment_method === 'COD' ? 'codClearing' : 'gatewayClearing'; } catch (e: any) { error.value = e.message; } finally { loading.value = false; } }
async function save() {
  if (!selected.value || saving.value) return;
  const body = { ...form, moneyAccountId: showMoneyAccount.value && form.moneyAccountId ? form.moneyAccountId : undefined, items: Object.entries(returned).filter(([, qty]) => Number(qty) > 0).map(([entryId, qty]) => ({ entryId, qty: Number(qty) })) };
  const fingerprint = JSON.stringify({ orderId: selected.value.order.id, ...body });
  if (!requestId || previousPayload !== fingerprint) { requestId = crypto.randomUUID(); previousPayload = fingerprint; }
  saving.value = true; error.value = '';
  try {
    await api.post(`/ecommerce/orders/${selected.value.order.id}/events`, { ...body, requestId });
    selected.value = await api.get(`/ecommerce/orders/${selected.value.order.id}`);
    form.amount = 0; form.reference = ''; form.fee = 0; form.tax = 0; Object.keys(returned).forEach(k => delete returned[k]);
    requestId = ''; previousPayload = ''; toast.add({ title: 'Accounting entry recorded', color: 'green' });
  } catch (e: any) { error.value = e.message; } finally { saving.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="space-y-5 p-4">
    <div><h1 class="text-xl font-semibold">Ecommerce accounting</h1><p class="text-sm text-gray-500">Follow sales, customer balances, courier and gateway money, costs and refunds by order.</p></div>
    <UAlert v-if="error" color="red" :title="error" />
    <UAlert v-if="config && !config.enabled" title="Configure online sales in Settings → Account to connect new activity." />
    <div class="flex gap-2"><UInput v-model="search" placeholder="Order number or ID" @keyup.enter="page = 1; loadOrders()" /><UButton :loading="loading" @click="page = 1; loadOrders()">Search</UButton></div>
    <UTable :rows="orders" :loading="loading" :columns="[{ key: 'orderNumber', label: 'Order' }, { key: 'status', label: 'Status' }, { key: 'paymentStatus', label: 'Payment' }, { key: 'grandTotal', label: 'Total' }, { key: 'actions', label: 'Accounting' }]">
      <template #grandTotal-data="{ row }">{{ number(row.grandTotal) }}</template>
      <template #actions-data="{ row }"><span v-if="row.excluded === 'true'" class="text-gray-500">History review required</span><UButton v-else size="xs" :disabled="!config?.enabled" @click="open(row)">Open</UButton></template>
    </UTable>
    <div class="flex gap-2"><UButton :disabled="page <= 1" @click="page--; loadOrders()">Previous</UButton><span class="p-2">{{ page }}</span><UButton :disabled="orders.length < 30" @click="page++; loadOrders()">Next</UButton></div>
    <UCard v-if="selected">
      <template #header>Order {{ selected.order.order_number }}</template>
      <div class="mb-5 grid gap-3 md:grid-cols-4">
        <div v-for="role in ['receivable', 'codClearing', 'gatewayClearing', 'refundPayable', 'expensePayable']" :key="role"><p class="text-sm text-gray-500">{{ labels[role] }}</p><strong>{{ number((['refundPayable', 'expensePayable'].includes(role) ? -1 : 1) * selected.balances[role]) }}</strong></div>
      </div>
      <div class="grid gap-3 md:grid-cols-3">
        <UFormGroup label="Activity"><USelect v-model="form.action" :options="actions" /></UFormGroup>
        <UFormGroup label="Actual date"><UInput v-model="form.date" type="date" /></UFormGroup>
        <UFormGroup label="Reference / evidence"><UInput v-model="form.reference" placeholder="Settlement, refund or return reference" /></UFormGroup>
        <template v-if="form.action !== 'RETURN'">
          <UFormGroup label="Amount"><UInput v-model.number="form.amount" type="number" min="0" step="0.01" /></UFormGroup>
          <UFormGroup v-if="form.action !== 'CHARGE'" :label="form.action === 'SETTLEMENT' ? 'Held by' : 'Payment source / destination'"><USelect v-model="form.funding" :options="funding" /></UFormGroup>
          <UFormGroup v-if="showMoneyAccount && form.action !== 'CHARGE'" label="Cash / bank account"><USelect v-model="form.moneyAccountId" :options="moneyAccounts" placeholder="Use configured account" /></UFormGroup>
          <UFormGroup v-if="['COST', 'CHARGE'].includes(form.action)" label="Category"><USelect v-model="form.category" :options="categories" /></UFormGroup>
          <UFormGroup v-if="form.action === 'SETTLEMENT'" label="Fees deducted (including tax)"><UInput v-model.number="form.fee" type="number" min="0" step="0.01" /></UFormGroup>
          <UFormGroup v-if="['SETTLEMENT', 'COST', 'CHARGE'].includes(form.action)" :label="form.action === 'CHARGE' ? 'Output tax included in amount' : 'Recoverable tax included in cost / fee'"><UInput v-model.number="form.tax" type="number" min="0" step="0.01" /></UFormGroup>
        </template>
      </div>
      <div v-if="form.action === 'RETURN'" class="mt-4 space-y-3">
        <p class="text-sm">Enter only quantities physically received back. This restores stock and credits the customer; record the actual refund separately.</p>
        <UFormGroup v-for="item in selected.sale.signature.metadata.items" :key="item.entryId" :label="`${item.name}${item.size ? ` · ${item.size}` : ''} · originally sold ${item.qty}`"><UInput v-model.number="returned[item.entryId]" type="number" min="0" :max="item.qty" /></UFormGroup>
        <UCheckbox v-model="form.refundDelivery" label="Also credit the original delivery charge" /><UCheckbox v-model="form.refundCod" label="Also credit the original COD charge" />
      </div>
      <UFormGroup class="mt-3" label="Note"><UTextarea v-model="form.note" /></UFormGroup>
      <p class="mt-3 text-sm text-gray-500">Record completed financial activity once. A return request, shipping quote or delivered status does not confirm bank settlement.</p>
      <UButton class="mt-4" :loading="saving" @click="save">Record activity</UButton>
      <div class="mt-6 space-y-2"><h2 class="font-semibold">Recorded activity</h2><div v-for="entry in selected.events" :key="entry.source_key" class="flex justify-between border-b py-2 text-sm"><span>{{ entry.signature.date }} · {{ entry.signature.metadata.action }} · {{ entry.signature.metadata.reference }}</span><NuxtLink v-if="entry.journal_id" :to="`/accountant/manual-journals?journal=${entry.journal_id}`" class="text-primary-500">Journal</NuxtLink></div></div>
    </UCard>
  </div>
</template>
