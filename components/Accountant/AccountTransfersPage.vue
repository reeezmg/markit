<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold">Account Transfers</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Move money between cash, bank, card, and clearing accounts.
        </p>
      </div>
      <UButton icon="i-lucide-arrow-left-right" @click="openCreate"
        >New Transfer</UButton
      >
    </div>
    <UCard
      class="w-full"
      :ui="{
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { padding: 'px-4 py-5' },
        body: { padding: '', base: 'divide-y divide-gray-200 dark:divide-gray-700' },
        footer: { padding: 'p-4' },
      }"
    >
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UInput
            v-model="search"
            icon="i-heroicons-magnifying-glass-20-solid"
            placeholder="Search transfers..."
            aria-label="Search transfers"
            class="w-full sm:w-64"
          />
          <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Rows per page</span>
            <USelect v-model="pageSize" :options="[10, 25, 50, 100]" aria-label="Rows per page" />
          </div>
        </div>
      </template>
      <UTable
        :rows="pagedRows"
        :columns="columns"
        :loading="loading"
        :empty-state="{ icon: 'i-lucide-arrow-left-right', label: 'No transfers found.' }"
        class="w-full"
      >
        <template #transferDate-data="{ row }">{{ date(row.transferDate) }}</template>
        <template #transferNumber-data="{ row }">
          <UButton color="primary" variant="link" :padded="false" @click="openDetails(row)">
            {{ row.transferNumber }}
          </UButton>
        </template>
        <template #fromAccount-data="{ row }">{{ row.fromAccount?.name || '-' }}</template>
        <template #toAccount-data="{ row }">{{ row.toAccount?.name || '-' }}</template>
        <template #amount-data="{ row }">
          <span class="font-medium tabular-nums">{{ money(row.amount, row.currency) }}</span>
        </template>
        <template #referenceNumber-data="{ row }">{{ row.referenceNumber || '-' }}</template>
        <template #description-data="{ row }">
          <span class="block max-w-xs truncate" :title="row.description">{{ row.description || '-' }}</span>
        </template>
        <template #actions-data="{ row }">
          <UDropdown :items="actions(row)">
            <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" :aria-label="`Actions for ${row.transferNumber}`" />
          </UDropdown>
        </template>
      </UTable>
      <template #footer>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="text-sm text-gray-500 dark:text-gray-400">
            Showing {{ pageFrom }} to {{ pageTo }} of {{ filtered.length }} results
          </span>
          <UPagination
            v-model="page"
            :page-count="Number(pageSize)"
            :total="filtered.length"
            :ui="{ wrapper: 'flex items-center gap-1', rounded: '!rounded-full min-w-[32px] justify-center', default: { activeButton: { variant: 'outline' } } }"
          />
        </div>
      </template>
    </UCard>

    <AccountantModal v-model="detailsOpen" :title="selected?.transferNumber || 'Transfer details'">
      <template #body>
        <div v-if="selected" class="space-y-5">
          <dl class="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt class="text-gray-500 dark:text-gray-400">Date</dt><dd>{{ date(selected.transferDate) }}</dd></div>
            <div><dt class="text-gray-500 dark:text-gray-400">Amount</dt><dd class="font-semibold">{{ money(selected.amount, selected.currency) }}</dd></div>
            <div><dt class="text-gray-500 dark:text-gray-400">From account</dt><dd>{{ selected.fromAccount?.name || '-' }}</dd></div>
            <div><dt class="text-gray-500 dark:text-gray-400">To account</dt><dd>{{ selected.toAccount?.name || '-' }}</dd></div>
            <div><dt class="text-gray-500 dark:text-gray-400">Reference</dt><dd>{{ selected.referenceNumber || '-' }}</dd></div>
            <div v-if="selected.imported"><dt class="text-gray-500 dark:text-gray-400">Source</dt><dd>Imported history</dd></div>
          </dl>
          <p v-if="selected.description" class="whitespace-pre-wrap text-sm">{{ selected.description }}</p>
          <SalesJournalEntries resource="account-transfer" :resource-id="selected.id" />
        </div>
      </template>
    </AccountantModal>

    <AccountantModal
      v-model="formOpen"
      :title="editingId ? 'Edit Transfer' : 'Transfer Funds'"
      :ui="{ content: 'max-w-xl' }"
    >
      <template #body
        ><form class="space-y-4" @submit.prevent="save">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormGroup label="Transfer Date" required
              ><UInput
                v-model="form.transferDate"
                type="date"
                class="w-full" /></UFormGroup
            ><UFormGroup label="Transfer Number"
              ><UInput
                :model-value="editing?.transferNumber || nextNumber"
                disabled
                class="w-full"
            /></UFormGroup>
          </div>
          <UFormGroup label="From Account" required
            ><USelectMenu
              v-model="form.fromAccountId"
              :options="fromOptions"
              value-attribute="value"
              option-attribute="label"
              searchable
              class="w-full"
          /></UFormGroup>
          <div class="flex justify-center">
            <UButton
              color="gray"
              variant="soft"
              icon="i-lucide-arrow-down-up"
              size="sm"
              @click="swap"
              >Swap Accounts</UButton
            >
          </div>
          <UFormGroup label="To Account" required
            ><USelectMenu
              v-model="form.toAccountId"
              :options="toOptions"
              value-attribute="value"
              option-attribute="label"
              searchable
              class="w-full"
          /></UFormGroup>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormGroup label="Amount" required
              ><UInput
                v-model.number="form.amount"
                type="number"
                min="0.01"
                step="0.01"
                class="w-full"
                ><template #leading>₹</template></UInput
              ></UFormGroup
            ><UFormGroup label="Reference #"
              ><UInput v-model="form.referenceNumber" class="w-full"
            /></UFormGroup>
          </div>
          <UFormGroup label="Description"
            ><UTextarea v-model="form.description" :rows="3" class="w-full"
          /></UFormGroup>
          <div class="rounded-md bg-gray-50 dark:bg-gray-800 p-3 text-xs text-gray-500 dark:text-gray-400">
            This publishes a balanced entry: debit the destination account and
            credit the source account.
          </div>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="formOpen = false"
              >Cancel</UButton
            ><UButton type="submit" :loading="saving">Save Transfer</UButton>
          </div>
        </form></template
      >
    </AccountantModal>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
const api = useAccountantApi();
const selectedAccountSession = useSelectedAccounts();
const baseCurrency = ref("INR");
const toast = useToast(),
  rows = ref<any[]>([]),
  accounts = ref<any[]>([]),
  selectedId = ref(""),
  search = ref(""),
  page = ref(1),
  pageSize = ref(10),
  loading = ref(false),
  detailsOpen = ref(false),
  formOpen = ref(false),
  editingId = ref(""),
  nextNumber = ref(""),
  saving = ref(false);
const form = reactive({
  transferDate: new Date().toISOString().slice(0, 10),
  fromAccountId: "",
  toAccountId: "",
  amount: 0,
  currency: "INR",
  exchangeRate: 1,
  referenceNumber: "",
  description: "",
});
const eligible = computed(() =>
  accounts.value.filter(
    (a) =>
      ["CASH", "BANK", "PAYMENT_CLEARING_ACCOUNT", "CREDIT_CARD"].includes(
        a.accountType,
      ) && a.isActive,
  ),
);
const fromOptions = computed(() =>
  eligible.value
    .filter((a) => a.id !== form.toAccountId)
    .map((a) => ({
      value: a.id,
      label: `${a.name} · ${money(a.balance, baseCurrency.value)}`,
    })),
);
const toOptions = computed(() =>
  eligible.value
    .filter((a) => a.id !== form.fromAccountId)
    .map((a) => ({
      value: a.id,
      label: `${a.name} · ${money(a.balance, baseCurrency.value)}`,
    })),
);
const filtered = computed(() =>
  rows.value.filter(
    (r) =>
      !search.value ||
      `${r.transferNumber} ${r.referenceNumber || ""} ${r.fromAccount?.name} ${r.toAccount?.name} ${r.description || ""}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
  ),
);
const selected = computed(() =>
    rows.value.find((r) => r.id === selectedId.value),
  ),
  editing = computed(() => rows.value.find((r) => r.id === editingId.value));
const columns = [
  { key: 'transferDate', label: 'Date' },
  { key: 'transferNumber', label: 'Transfer No.' },
  { key: 'fromAccount', label: 'From Account' },
  { key: 'toAccount', label: 'To Account' },
  { key: 'amount', label: 'Amount', class: 'text-right' },
  { key: 'referenceNumber', label: 'Reference' },
  { key: 'description', label: 'Description' },
  { key: 'actions', label: 'Actions' },
];
const pageFrom = computed(() => filtered.value.length ? (page.value - 1) * Number(pageSize.value) + 1 : 0);
const pageTo = computed(() => Math.min(page.value * Number(pageSize.value), filtered.value.length));
const pagedRows = computed(() => filtered.value.slice((page.value - 1) * Number(pageSize.value), page.value * Number(pageSize.value)));
watch([search, pageSize], () => { page.value = 1; });
watch(() => filtered.value.length, (total) => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(total / Number(pageSize.value))));
});
function openDetails(row: any) {
  selectedId.value = row.id;
  detailsOpen.value = true;
}
function actions(row: any) {
  const items = [[{ label: 'Details', icon: 'i-heroicons-document-magnifying-glass', click: () => openDetails(row) }]];
  if (!row.imported) items.push([
    { label: 'Edit', icon: 'i-heroicons-pencil-square-20-solid', click: () => openEdit(row) },
    { label: 'Delete', icon: 'i-heroicons-trash-20-solid', click: () => remove(row) },
  ]);
  return items;
}
async function load() {
  loading.value = true;
  try {
    const [t, a, n] = await Promise.all([
      api.get<{ data: any[] }>("/account-transfers"),
      api.get<{ data: any[]; baseCurrency: string }>("/accounting-accounts"),
      api.get<{ transferNumber: string }>("/account-transfers/next-number"),
    ]);
    rows.value = t.data;
    baseCurrency.value = a.baseCurrency;
    accounts.value = a.data;
    nextNumber.value = n.transferNumber;
  } finally {
    loading.value = false;
  }
}
function reset() {
  Object.assign(form, {
    transferDate: new Date().toISOString().slice(0, 10),
    fromAccountId: "",
    toAccountId: "",
    amount: 0,
    currency: "INR",
    exchangeRate: 1,
    referenceNumber: "",
    description: "",
  });
}
async function openCreate() {
  editingId.value = "";
  reset();
  const settings = await selectedAccountSession.get(api.companyId.value);
  const defaults = settings.defaults.transfers || {};
  if (eligible.value.some(a => a.id === defaults.fromAccountId)) form.fromAccountId = defaults.fromAccountId;
  if (eligible.value.some(a => a.id === defaults.toAccountId)) form.toAccountId = defaults.toAccountId;
  formOpen.value = true;
}
function openEdit(r: any) {
  editingId.value = r.id;
  Object.assign(form, {
    transferDate: r.transferDate.slice(0, 10),
    fromAccountId: r.fromAccountId,
    toAccountId: r.toAccountId,
    amount: Number(r.amount),
    currency: r.currency,
    exchangeRate: Number(r.exchangeRate),
    referenceNumber: r.referenceNumber || "",
    description: r.description || "",
  });
  formOpen.value = true;
}
function swap() {
  [form.fromAccountId, form.toAccountId] = [
    form.toAccountId,
    form.fromAccountId,
  ];
}
async function save() {
  if (!form.fromAccountId || !form.toAccountId || form.amount <= 0)
    return toast.add({
      title: "Complete the transfer details",
      color: "red",
    });
  saving.value = true;
  try {
    const row: any = editingId.value
      ? await api.patch(`/account-transfers/${editingId.value}`, form)
      : await api.post("/account-transfers", form);
    formOpen.value = false;
    await load();
    selectedId.value = row.id;
    toast.add({ title: "Transfer saved", color: "green" });
  } catch (e: any) {
    toast.add({
      title: "Could not save transfer",
      description: e.message,
      color: "red",
    });
  } finally {
    saving.value = false;
  }
}
async function remove(row: any) {
  if (row.imported || !confirm(`Delete ${row.transferNumber}?`))
    return;
  try {
    await api.delete(`/account-transfers/${row.id}`);
    if (selectedId.value === row.id) {
      selectedId.value = "";
      detailsOpen.value = false;
    }
    await load();
    toast.add({ title: "Transfer deleted", color: "green" });
  } catch (e: any) {
    toast.add({
      title: "Could not delete transfer",
      description: e.message,
      color: "red",
    });
  }
}
const money = (v: any, c = "INR") =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: c }).format(
      Number(v || 0),
    ),
  date = (v: string) => new Date(v).toLocaleDateString("en-IN");
onMounted(() =>
  load().catch((e: any) =>
    toast.add({
      title: "Could not load transfers",
      description: e.message,
      color: "red",
    }),
  ),
);
</script>
