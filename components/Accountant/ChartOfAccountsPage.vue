<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold">Chart of accounts</h2>
        <p class="text-sm text-gray-500">Choose an account to review its balance and transactions.</p>
      </div>
      <div class="flex gap-2">
        <UButton color="gray" variant="outline" icon="i-heroicons-arrow-path" :loading="loading || ledgerLoading" @click="load">Refresh</UButton>
        <UButton icon="i-heroicons-plus" @click="openCreate">New account</UButton>
      </div>
    </div>
    <UAlert v-if="accountsQuery.isError.value" color="red" title="Could not load accounts" :description="accountsQuery.error.value?.message" />
    <div class="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <UCard :ui="{ body: { padding: 'p-0' }, header: { padding: 'p-3' } }">
        <template #header>
          <div class="space-y-3">
            <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Search account or code" aria-label="Search accounts" />
            <div class="grid grid-cols-2 gap-2">
              <USelect v-model="categoryFilter" :options="categoryFilters" aria-label="Account category" />
              <USelect v-model="statusFilter" :options="statusFilters" aria-label="Account status" />
            </div>
            <div class="text-xs text-gray-500">{{ visibleAccounts.length }} accounts</div>
          </div>
        </template>
        <div class="max-h-64 overflow-y-auto xl:max-h-[72vh]">
          <div v-if="loading && !accounts.length" class="p-6 text-sm text-gray-500">Loading accounts...</div>
          <p v-else-if="!visibleAccounts.length" class="p-6 text-sm text-gray-500">No matching accounts. Try another name or clear the filters.</p>
          <template v-for="category in visibleCategories" :key="category">
            <div class="sticky top-0 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800">{{ title(category) }}</div>
            <button v-for="account in accountsFor(category)" :key="account.id" type="button"
              class="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
              :class="selectedId === account.id ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300' : ''"
              :aria-pressed="selectedId === account.id" @click="selectedId = account.id">
              <UIcon :name="account.depth ? 'i-lucide-corner-down-right' : accountIcon(account)" class="h-4 w-4 shrink-0" />
              <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ account.name }}</span>
                <span class="block truncate text-xs text-gray-500">{{ account.code || 'No code' }} · {{ typeLabel(account.accountType) }}</span></span>
              <UBadge v-if="!account.isActive" color="gray" size="xs">Inactive</UBadge>
              <UIcon v-if="selectedId === account.id" name="i-heroicons-chevron-right" class="h-4 w-4" />
            </button>
          </template>
        </div>
      </UCard>
      <div v-if="selected" class="min-w-0 space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="text-xl font-semibold">{{ selected.name }}</h3>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span>{{ selected.code || 'No code' }} · {{ typeLabel(selected.accountType) }} · {{ baseCurrency }}</span>
              <UBadge :color="selected.isActive ? 'green' : 'gray'" variant="subtle">{{ selected.isActive ? 'Active' : 'Inactive' }}</UBadge>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton color="gray" variant="outline" icon="i-heroicons-pencil-square" :disabled="!ledger || ledgerLoading" @click="openEdit(selected)">Edit account</UButton>
            <UDropdown :items="accountActions">
              <UButton color="gray" variant="outline" icon="i-heroicons-ellipsis-horizontal" aria-label="Account actions" />
            </UDropdown>
          </div>
        </div>
        <UAlert v-if="ledgerQuery.isError.value" color="red" title="Could not load transactions" :description="ledgerQuery.error.value?.message">
          <template #actions><UButton color="red" variant="soft" @click="ledgerQuery.refetch()">Retry</UButton></template>
        </UAlert>
        <div class="grid gap-3 sm:grid-cols-3">
          <UCard :ui="{ body: { padding: 'p-4' } }"><p class="text-xs text-gray-500">Balance {{ ledgerTo ? 'as of ' + formatDate(ledgerTo) : 'to date' }}</p><p class="mt-1 text-xl font-semibold tabular-nums">{{ ledger ? ledgerMoney(ledger.closingBalance) : '—' }} <span class="text-sm">{{ ledger?.balanceSide }}</span></p></UCard>
          <UCard :ui="{ body: { padding: 'p-4' } }"><p class="text-xs text-gray-500">Debits · matching transactions</p><p class="mt-1 text-xl font-semibold tabular-nums">{{ ledger ? ledgerMoney(ledger.filteredDebitTotal) : '—' }}</p></UCard>
          <UCard :ui="{ body: { padding: 'p-4' } }"><p class="text-xs text-gray-500">Credits · matching transactions</p><p class="mt-1 text-xl font-semibold tabular-nums">{{ ledger ? ledgerMoney(ledger.filteredCreditTotal) : '—' }}</p></UCard>
        </div>
        <UCard :ui="{ body: { padding: '' }, header: { padding: 'px-4 py-4' }, footer: { padding: 'p-4' } }">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-wrap items-center gap-3">
                <UPopover :popper="{ placement: 'bottom-start' }">
                  <UButton icon="i-heroicons-calendar-days-20-solid" color="primary" variant="soft">{{ ledgerFrom && ledgerTo ? format(new Date(ledgerFrom + 'T00:00:00'), 'd MMM, yyyy') + ' - ' + format(new Date(ledgerTo + 'T00:00:00'), 'd MMM, yyyy') : 'All dates' }}</UButton>
                  <template #panel="{ close }">
                    <div class="flex flex-col sm:flex-row sm:divide-x divide-gray-200 dark:divide-gray-800">
                      <div class="flex flex-wrap sm:flex-col py-3">
                        <UButton v-for="range in ranges" :key="range.label" :label="range.label" color="gray" variant="ghost" class="rounded-none px-5" @click="selectRange(range.duration); close()" />
                        <UButton label="All dates" color="gray" variant="ghost" class="rounded-none px-5" @click="ledgerFrom = ''; ledgerTo = ''; close()" />
                      </div>
                      <DatePicker v-model="ledgerDateRange" @close="close" />
                    </div>
                  </template>
                </UPopover>
                <UInput v-model="ledgerSearch" icon="i-heroicons-magnifying-glass-20-solid" placeholder="Search reference or details" aria-label="Search transactions" class="w-full sm:w-60" />
              </div>
              <UButton v-if="hasLedgerFilters" color="gray" variant="ghost" @click="resetLedgerFilters">Reset filters</UButton>
            </div>
          </template>
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <div class="flex items-center gap-2 text-sm"><span class="text-gray-500">Rows per page</span><USelect v-model="ledgerPageSize" :options="[10, 20, 50, 100]" size="xs" aria-label="Rows per page" /></div>
            <div class="flex items-center gap-2">
              <USelect v-model="ledgerOrder" :options="[{ label: 'Newest first', value: 'desc' }, { label: 'Oldest first', value: 'asc' }]" size="xs" aria-label="Transaction order" />
              <UButton :color="hasAdvancedFilters ? 'primary' : 'gray'" variant="outline" size="xs" icon="i-heroicons-funnel" @click="openLedgerFilters">Filters</UButton>
            </div>
          </div>
          <div v-if="hasAdvancedFilters" class="flex flex-wrap gap-2 px-4 py-2 text-xs text-gray-500">
            <UBadge v-if="ledgerType" color="gray" variant="subtle">{{ sourceTypeOptions.find(o => o.value === ledgerType)?.label || ledgerType }}</UBadge>
            <UBadge v-if="ledgerSide" color="gray" variant="subtle">{{ ledgerSide === 'DEBIT' ? 'Debits' : 'Credits' }}</UBadge>
            <UBadge v-if="ledgerMin !== '' || ledgerMax !== ''" color="gray" variant="subtle">Amount: {{ ledgerMin === '' ? '0' : ledgerMin }} – {{ ledgerMax === '' ? 'Any' : ledgerMax }}</UBadge>
          </div>
          <UTable :rows="ledger?.data || []" :columns="ledgerColumns" :loading="ledgerLoading" :empty-state="{ icon: 'i-heroicons-document-magnifying-glass', label: 'No transactions match these filters.' }" :ui="{ td: { base: 'align-top', padding: 'px-4 py-3' } }">
            <template #date-data="{ row }"><span class="whitespace-nowrap text-gray-500">{{ formatDate(row.date) }}</span></template>
            <template #transactionDetails-data="{ row }"><div class="max-w-sm whitespace-normal"><p class="font-medium">{{ row.referenceNumber || row.journalNumber }}</p><p class="mt-1 text-sm text-gray-500">{{ row.transactionDetails || '—' }}</p><p v-for="(party, key) in row.sourceParties || {}" :key="key" class="text-xs text-gray-500">{{ party?.name }}</p></div></template>
            <template #type-data="{ row }"><UBadge color="gray" variant="subtle" class="whitespace-nowrap">{{ row.type }}</UBadge></template>
            <template #debit-data="{ row }"><span class="block text-right tabular-nums whitespace-nowrap">{{ row.debit ? ledgerMoney(row.debit) : '—' }}</span></template>
            <template #credit-data="{ row }"><span class="block text-right tabular-nums whitespace-nowrap">{{ row.credit ? ledgerMoney(row.credit) : '—' }}</span></template>
            <template #balance-data="{ row }"><span class="block text-right font-medium tabular-nums whitespace-nowrap">{{ ledgerMoney(row.balance) }} {{ row.balanceSide }}</span></template>
          </UTable>
          <template #footer>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-sm text-gray-500">{{ ledger?.total ? (ledgerPage - 1) * Number(ledgerPageSize) + 1 : 0 }}–{{ Math.min(ledgerPage * Number(ledgerPageSize), ledger?.total || 0) }} of {{ ledger?.total || 0 }} transactions</p>
              <UPagination v-model="ledgerPage" :page-count="Number(ledgerPageSize)" :total="ledger?.total || 0" :disabled="ledgerLoading" />
            </div>
            <p class="mt-3 text-xs text-gray-500">Running balances include all earlier activity, even when search or filters hide some rows. Amounts are in {{ baseCurrency }}.</p>
          </template>
        </UCard>
        <details class="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800">
          <summary class="cursor-pointer font-medium">Account information</summary>
          <dl class="mt-4 grid gap-4 sm:grid-cols-2">
            <div><dt class="text-gray-500">Parent account</dt><dd>{{ parentName(selected.parentId) }}</dd></div>
            <div><dt class="text-gray-500">Description</dt><dd>{{ selected.description || 'No description added.' }}</dd></div>
            <div v-if="selected.openingBalance != null"><dt class="text-gray-500">Opening balance</dt><dd>{{ money(selected.openingBalance) }} as of {{ formatDate(selected.openingBalanceDate!) }}</dd></div>
            <template v-if="isBankType(selected.accountType)"><div><dt class="text-gray-500">Bank</dt><dd>{{ selected.bankName || '—' }}</dd></div><div><dt class="text-gray-500">Account number / IFSC</dt><dd>{{ selected.accountNumber || '—' }} / {{ selected.routingNumber || '—' }}</dd></div></template>
          </dl>
        </details>
      </div>
      <UCard v-else class="min-h-80"><div class="flex flex-col items-center justify-center gap-3 py-20 text-center"><UIcon name="i-heroicons-book-open" class="h-10 w-10 text-gray-400" /><h3 class="font-semibold">Select an account</h3><p class="max-w-sm text-sm text-gray-500">Choose an account from the list to see its balance, find transactions, or update its details.</p></div></UCard>
    </div>
    <UModal v-model="ledgerFilterOpen">
      <UCard>
        <template #header><h3 class="font-semibold">Transaction filters</h3></template>
        <div class="space-y-4">
          <UFormGroup label="Transaction type"><USelect v-model="filterDraft.sourceType" :options="sourceTypeOptions" /></UFormGroup>
          <UFormGroup label="Debit / credit"><USelect v-model="filterDraft.side" :options="[{ label: 'All entries', value: '' }, { label: 'Debit', value: 'DEBIT' }, { label: 'Credit', value: 'CREDIT' }]" /></UFormGroup>
          <div class="grid grid-cols-2 gap-3"><UFormGroup label="Minimum amount"><UInput v-model="filterDraft.min" type="number" min="0" step="0.01" placeholder="0" /></UFormGroup><UFormGroup label="Maximum amount"><UInput v-model="filterDraft.max" type="number" min="0" step="0.01" placeholder="Any amount" /></UFormGroup></div>
        </div>
        <template #footer><div class="flex justify-end gap-2"><UButton color="gray" variant="ghost" @click="ledgerFilterOpen = false">Cancel</UButton><UButton @click="applyLedgerFilters">Apply filters</UButton></div></template>
      </UCard>
    </UModal>
    <AccountantModal
      v-model="formOpen"
      :title="editingId ? 'Edit Account' : 'Create Account'"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="saveAccount">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormGroup label="Account Type" required>
              <USelectMenu
                v-model="form.accountType"
                :options="typeOptions"
                value-attribute="value"
                option-attribute="label"
                searchable
                class="w-full"
                :disabled="editingSystem"
              />
            </UFormGroup>
            <UFormGroup label="Account Name" required>
              <UInput v-model="form.name" maxlength="150" class="w-full" />
            </UFormGroup>
            <UFormGroup
              label="Account Code"
              help="Must be unique; maximum 50 characters."
            >
              <UInput v-model="form.code" maxlength="50" class="w-full" />
            </UFormGroup>
            <UFormGroup label="Currency">
              <USelect
                v-model="form.currency"
                :options="['INR', 'USD', 'EUR', 'GBP', 'AED']"
                class="w-full"
              />
            </UFormGroup>
          </div>

          <div
            v-if="supportsSubAccounts(form.accountType)"
            class="rounded-md border border-gray-200 dark:border-gray-700 p-3"
          >
            <UCheckbox
              v-model="form.isSubAccount"
              label="Make this a sub-account"
              :disabled="editingSystem"
            />
            <UFormGroup
              v-if="form.isSubAccount"
              label="Parent Account"
              required
              class="mt-3"
            >
              <USelectMenu
                v-model="form.parentId"
                :options="parentOptions"
                value-attribute="value"
                option-attribute="label"
                searchable
                class="w-full"
              />
            </UFormGroup>
          </div>

          <div
            v-if="isBankType(form.accountType)"
            class="grid gap-4 rounded-md border border-gray-200 dark:border-gray-700 p-4 sm:grid-cols-2"
          >
            <div class="sm:col-span-2 text-sm font-semibold">
              Bank / card details
            </div>
            <UFormGroup label="Bank Name"
              ><UInput v-model="form.bankName" class="w-full"
            /></UFormGroup>
            <UFormGroup label="Account Number"
              ><UInput v-model="form.accountNumber" class="w-full"
            /></UFormGroup>
            <UFormGroup label="Routing Number / IFSC"
              ><UInput v-model="form.routingNumber" class="w-full"
            /></UFormGroup>
            <UFormGroup
              ><UCheckbox
                v-model="form.isPrimary"
                label="Primary account"
                class="mt-7"
            /></UFormGroup>
          </div>

          <div
            v-if="supportsOpeningBalance(form.accountType)"
            class="grid gap-4 rounded-md border border-gray-200 dark:border-gray-700 p-4 sm:grid-cols-2"
          >
            <div class="sm:col-span-2">
              <div class="text-sm font-semibold">Opening balance</div>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The balance this account carried over when you started using the
                system. It posts a balanced entry against
                <span class="font-medium">Opening Balance Adjustments</span>.
              </p>
            </div>
            <UFormGroup label="Amount" :help="openingBalanceHelp">
              <UInput
                v-model="form.openingBalance"
                type="number"
                step="0.01"
                placeholder="0.00"
                class="w-full"
              />
            </UFormGroup>
            <UFormGroup label="As of date">
              <UInput
                v-model="form.openingBalanceDate"
                type="date"
                class="w-full"
              />
            </UFormGroup>
          </div>

          <UFormGroup label="Description"
            ><UTextarea v-model="form.description" :rows="3" class="w-full"
          /></UFormGroup>
          <UCheckbox
            v-model="form.showOnDashboard"
            label="Add this account to the dashboard watchlist"
          />
          <div class="flex justify-end gap-2 pt-2">
            <UButton color="gray" variant="ghost" @click="formOpen = false"
              >Cancel</UButton
            >
            <UButton type="submit" :loading="saving">{{
              editingId ? "Save Changes" : "Create Account"
            }}</UButton>
          </div>
        </form>
      </template>
    </AccountantModal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { refDebounced } from '@vueuse/core';
import { format, sub, type Duration } from 'date-fns';
const api = useAccountantApi();
const queryClient = useQueryClient();
const ledgerPage = ref(1), ledgerFrom = ref(''), ledgerTo = ref('');
const ledgerPageSize = ref(20), ledgerOrder = ref('desc');
const ledgerSearch = ref(''), debouncedLedgerSearch = refDebounced(ledgerSearch, 300);
const ledgerType = ref(''), ledgerSide = ref(''), ledgerMin = ref(''), ledgerMax = ref('');
const ledgerFilterOpen = ref(false);
const filterDraft = reactive({ sourceType: '', side: '', min: '', max: '' });
const ranges: { label: string; duration: Duration }[] = [
  { label: 'Today', duration: { days: 0 } }, { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 30 days', duration: { days: 30 } }, { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } }, { label: 'Last year', duration: { years: 1 } },
];
const ledgerDateRange = computed({
  get: () => ({ start: ledgerFrom.value ? new Date(ledgerFrom.value + 'T00:00:00') : new Date(), end: ledgerTo.value ? new Date(ledgerTo.value + 'T00:00:00') : new Date() }),
  set: (range: { start: Date; end: Date }) => {
    ledgerFrom.value = format(range.start, 'yyyy-MM-dd'); ledgerTo.value = format(range.end, 'yyyy-MM-dd');
  },
});
function selectRange(duration: Duration) { ledgerDateRange.value = { start: sub(new Date(), duration), end: new Date() }; }
const hasAdvancedFilters = computed(() => Boolean(ledgerType.value || ledgerSide.value || ledgerMin.value !== '' || ledgerMax.value !== ''));
const hasLedgerFilters = computed(() => hasAdvancedFilters.value || Boolean(ledgerFrom.value || ledgerTo.value || ledgerSearch.value));
function openLedgerFilters() {
  Object.assign(filterDraft, { sourceType: ledgerType.value, side: ledgerSide.value, min: ledgerMin.value, max: ledgerMax.value });
  ledgerFilterOpen.value = true;
}
function applyLedgerFilters() {
  if ([filterDraft.min, filterDraft.max].some(v => v !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0)) ||
      (filterDraft.min !== '' && filterDraft.max !== '' && Number(filterDraft.min) > Number(filterDraft.max))) {
    toast.add({ title: 'Enter a valid minimum and maximum amount', color: 'red' }); return;
  }
  ledgerType.value = filterDraft.sourceType; ledgerSide.value = filterDraft.side;
  ledgerMin.value = filterDraft.min; ledgerMax.value = filterDraft.max; ledgerFilterOpen.value = false;
}
function resetLedgerFilters() {
  ledgerFrom.value = ''; ledgerTo.value = ''; ledgerSearch.value = '';
  ledgerType.value = ''; ledgerSide.value = ''; ledgerMin.value = ''; ledgerMax.value = '';
}
const ledgerColumns = [
  { key: 'date', label: 'Date' }, { key: 'transactionDetails', label: 'Transaction details' },
  { key: 'type', label: 'Type' }, { key: 'debit', label: 'Debit', class: 'text-right' },
  { key: 'credit', label: 'Credit', class: 'text-right' }, { key: 'balance', label: 'Running balance', class: 'text-right' },
];

type Account = {
  id: string;
  parentId: string | null;
  category: string;
  accountType: string;
  name: string;
  code: string | null;
  currency: string;
  description: string | null;
  showOnDashboard: boolean;
  isSystem: boolean;
  isActive: boolean;
  bankName: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  isPrimary: boolean;
  depth: number;
  _count: { children: number };
  balance: number;
  debitTotal: number;
  creditTotal: number;
  openingBalance: number | null;
  openingBalanceDate: string | null;
};
const typeGroups: Record<string, string[]> = {
  Asset: [
    "OTHER_ASSET",
    "OTHER_CURRENT_ASSET",
    "CASH",
    "BANK",
    "FIXED_ASSET",
    "ACCOUNTS_RECEIVABLE",
    "STOCK",
    "PAYMENT_CLEARING_ACCOUNT",
    "INTANGIBLE_ASSET",
    "NON_CURRENT_ASSET",
    "DEFERRED_TAX_ASSET",
  ],
  Liability: [
    "OTHER_CURRENT_LIABILITY",
    "CREDIT_CARD",
    "NON_CURRENT_LIABILITY",
    "OTHER_LIABILITY",
    "ACCOUNTS_PAYABLE",
    "OVERSEAS_TAX_PAYABLE",
    "DEFERRED_TAX_LIABILITY",
  ],
  Equity: ["EQUITY"],
  Income: ["INCOME", "OTHER_INCOME"],
  Expense: ["EXPENSE", "COST_OF_GOODS_SOLD", "OTHER_EXPENSE"],
};
const subTypes = new Set([
  "ACCOUNTS_PAYABLE",
  "OTHER_ASSET",
  "OTHER_CURRENT_ASSET",
  "CASH",
  "FIXED_ASSET",
  "STOCK",
  "INTANGIBLE_ASSET",
  "NON_CURRENT_ASSET",
  "OTHER_CURRENT_LIABILITY",
  "NON_CURRENT_LIABILITY",
  "OTHER_LIABILITY",
  "EQUITY",
  "INCOME",
  "OTHER_INCOME",
  "EXPENSE",
  "COST_OF_GOODS_SOLD",
  "OTHER_EXPENSE",
]);
const typeOptions = Object.entries(typeGroups).flatMap(([group, values]) =>
  values.map((value) => ({ value, label: `${group} — ${typeLabel(value)}` })),
);
const categoryFilters = [
  { label: "All Accounts", value: "ALL" },
  ...["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"].map((value) => ({
    label: title(value),
    value,
  })),
];
const statusFilters = [
  { label: "All Statuses", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];
const saving = ref(false),
  formOpen = ref(false);
const selectedId = ref(typeof useRoute().query.account === "string" ? String(useRoute().query.account) : ""),
  editingId = ref(""),
  search = ref(""),
  categoryFilter = ref("ALL"),
  statusFilter = ref("ALL");
const toast = useToast();
const accountsQuery = useQuery({
  queryKey: ['accountant-v2', api.companyId, 'chart-directory'],
  queryFn: () => api.get<{ data: Account[]; baseCurrency: string }>('/accounting-accounts', { query: { view: 'directory' } }),
  enabled: computed(() => Boolean(api.companyId.value)), staleTime: 60_000, gcTime: 300_000,
});
const accounts = computed(() => addDepth(accountsQuery.data.value?.data || []));
const baseCurrency = computed(() => accountsQuery.data.value?.baseCurrency || 'INR');
const loading = accountsQuery.isFetching;
const ledgerParams = computed(() => ({
  page: ledgerPage.value, pageSize: Number(ledgerPageSize.value), order: ledgerOrder.value,
  ...(ledgerFrom.value ? { from: ledgerFrom.value } : {}), ...(ledgerTo.value ? { to: ledgerTo.value } : {}),
  ...(debouncedLedgerSearch.value ? { search: debouncedLedgerSearch.value } : {}),
  ...(ledgerType.value ? { sourceType: ledgerType.value } : {}), ...(ledgerSide.value ? { side: ledgerSide.value } : {}),
  ...(ledgerMin.value !== '' ? { minAmount: Number(ledgerMin.value) } : {}),
  ...(ledgerMax.value !== '' ? { maxAmount: Number(ledgerMax.value) } : {}),
}));
const ledgerQuery = useQuery({
  queryKey: ['accountant-v2', api.companyId, 'chart-ledger', selectedId, ledgerParams],
  queryFn: () => api.get(`/accounting-accounts/${selectedId.value}/ledger`, { query: ledgerParams.value }),
  enabled: computed(() => Boolean(api.companyId.value && selectedId.value) &&
    (!ledgerFrom.value || !ledgerTo.value || ledgerFrom.value <= ledgerTo.value)),
  staleTime: 60_000, gcTime: 300_000,
});
const ledger = ledgerQuery.data, ledgerLoading = ledgerQuery.isFetching;
const sourceTypeOptions = computed(() => [{ label: 'All transaction types', value: '' }, ...(ledger.value?.sourceTypes || [])]);
const accountActions = computed(() => [[
  { label: selected.value?.isActive ? 'Mark inactive' : 'Mark active', disabled: selected.value?.isSystem && selected.value?.isActive, click: toggleStatus },
  ...(!selected.value?.isSystem ? [{ label: 'Delete account', icon: 'i-heroicons-trash', click: removeAccount }] : []),
]]);
const emptyForm = () => ({
  accountType: "OTHER_CURRENT_ASSET",
  name: "",
  code: "",
  currency: "INR",
  description: "",
  showOnDashboard: false,
  isSubAccount: false,
  parentId: "",
  bankName: "",
  accountNumber: "",
  routingNumber: "",
  isPrimary: false,
  openingBalance: "" as string | number,
  openingBalanceDate: today(),
});
const form = reactive(emptyForm());
const byId = computed(() => new Map(accounts.value.map((a) => [a.id, a])));
const selected = computed(() => {
  const account = byId.value.get(selectedId.value);
  return account && ledger.value?.account.id === selectedId.value
    ? { ...account, ...ledger.value.account, currency: account.currency }
    : account;
});
const editingSystem = computed(() =>
  Boolean(editingId.value && byId.value.get(editingId.value)?.isSystem),
);
const visibleAccounts = computed(() =>
  accounts.value.filter(
    (a) =>
      (!search.value ||
        `${a.name} ${a.code || ""}`
          .toLowerCase()
          .includes(search.value.toLowerCase())) &&
      (categoryFilter.value === "ALL" || a.category === categoryFilter.value) &&
      (statusFilter.value === "ALL" ||
        a.isActive === (statusFilter.value === "ACTIVE")),
  ),
);
const visibleCategories = computed(() =>
  ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"].filter(
    (c) => accountsFor(c).length,
  ),
);
const openingBalanceHelp = computed(() =>
  normalSide(categoryOf(form.accountType)) === "DR"
    ? "Positive posts a debit (DR). Use a negative amount for a credit balance."
    : "Positive posts a credit (CR). Use a negative amount for a debit balance.",
);
const parentOptions = computed(() =>
  accounts.value
    .filter(
      (a) =>
        a.id !== editingId.value &&
        a.accountType === form.accountType &&
        a.isActive &&
        a.depth < 4,
    )
    .map((a) => ({ value: a.id, label: `${"— ".repeat(a.depth)}${a.name}` })),
);
function typeLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}
function title(value: string) {
  return value[0] + value.slice(1).toLowerCase();
}
function supportsSubAccounts(value: string) {
  return subTypes.has(value);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function categoryOf(accountType: string) {
  return (
    Object.entries(typeGroups)
      .find(([, values]) => values.includes(accountType))?.[0]
      .toUpperCase() ?? ""
  );
}
function supportsOpeningBalance(accountType: string) {
  return ["ASSET", "LIABILITY", "EQUITY"].includes(categoryOf(accountType));
}
function isBankType(value: string) {
  return value === "BANK" || value === "CREDIT_CARD";
}
function accountIcon(a: Account) {
  return isBankType(a.accountType)
    ? "i-lucide-landmark"
    : a.category === "EXPENSE"
      ? "i-lucide-receipt"
      : "i-lucide-folder";
}
function accountsFor(category: string) {
  return visibleAccounts.value.filter((a) => a.category === category);
}
function parentName(id: string | null) {
  return id ? byId.value.get(id)?.name || "—" : "Top-level account";
}
function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: baseCurrency.value,
  }).format(Number(value || 0));
}
function ledgerMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: ledger.value?.account.currency || "INR",
  }).format(Number(value || 0));
}
function ledgerLineMoney(value: number, line: any) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: line.currency || "INR",
  }).format(Number(value || 0));
}
function normalSide(category: string) {
  return ["ASSET", "EXPENSE"].includes(category) ? "DR" : "CR";
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN");
}
function addDepth(rows: Account[]) {
  const map = new Map(rows.map((a) => [a.id, a]));
  return rows
    .map((a) => {
      let depth = 0,
        p = a.parentId;
      const seen = new Set<string>();
      while (p && map.has(p) && !seen.has(p)) {
        seen.add(p);
        depth++;
        p = map.get(p)!.parentId;
      }
      return { ...a, depth };
    })
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        (a.parentId || a.id).localeCompare(b.parentId || b.id) ||
        a.name.localeCompare(b.name),
    );
}
async function load() {
  await queryClient.invalidateQueries({ queryKey: ['accountant-v2', api.companyId.value] });
}function openCreate() {
  Object.assign(form, emptyForm());
  editingId.value = "";
  formOpen.value = true;
}
function openEdit(a: Account) {
  editingId.value = a.id;
  Object.assign(form, {
    accountType: a.accountType,
    name: a.name,
    code: a.code || "",
    currency: a.currency,
    description: a.description || "",
    showOnDashboard: a.showOnDashboard,
    isSubAccount: Boolean(a.parentId),
    parentId: a.parentId || "",
    bankName: a.bankName || "",
    accountNumber: a.accountNumber || "",
    routingNumber: a.routingNumber || "",
    isPrimary: a.isPrimary,
    openingBalance: a.openingBalance ?? "",
    openingBalanceDate: a.openingBalanceDate
      ? a.openingBalanceDate.slice(0, 10)
      : today(),
  });
  formOpen.value = true;
}
async function saveAccount() {
  if (!form.name.trim())
    return toast.add({ title: "Account name is required", color: "red" });
  if (form.isSubAccount && !form.parentId)
    return toast.add({ title: "Select a parent account", color: "red" });
  const opening =
    supportsOpeningBalance(form.accountType) && form.openingBalance !== ""
      ? Number(form.openingBalance)
      : null;
  if (opening !== null && !Number.isFinite(opening))
    return toast.add({
      title: "Opening balance must be a number",
      color: "red",
    });
  saving.value = true;
  try {
    const payload = {
      ...form,
      parentId: form.isSubAccount ? form.parentId : null,
      openingBalance: opening,
      openingBalanceDate: form.openingBalanceDate || null,
    };
    const saved = editingId.value
      ? await api.patch<Account>(
          `/accounting-accounts/${editingId.value}`,
          payload,
        )
      : await api.post<Account>("/accounting-accounts", payload);
    formOpen.value = false;
    selectedId.value = saved.id;
    toast.add({
      title: editingId.value ? "Account updated" : "Account created",
      color: "green",
    });
  } catch (e: any) {
    toast.add({
      title: "Could not save account",
      description: e.message,
      color: "red",
    });
  } finally {
    saving.value = false;
  }
}
async function toggleStatus() {
  if (!selected.value) return;
  try {
    await api.post(`/accounting-accounts/${selected.value.id}/status`, {
      isActive: !selected.value.isActive,
    });
  } catch (e: any) {
    toast.add({
      title: "Could not update status",
      description: e.message,
      color: "red",
    });
  }
}
async function removeAccount() {
  if (!selected.value || !confirm(`Delete ${selected.value.name}?`)) return;
  try {
    await api.delete(`/accounting-accounts/${selected.value.id}`);
    selectedId.value = "";
    toast.add({ title: "Account deleted", color: "green" });
  } catch (e: any) {
    toast.add({
      title: "Could not delete account",
      description: e.message,
      color: "red",
    });
  }
}
watch(
  () => form.accountType,
  () => {
    if (!supportsSubAccounts(form.accountType)) {
      form.isSubAccount = false;
      form.parentId = "";
    }
  },
);
watch([selectedId, ledgerFrom, ledgerTo, debouncedLedgerSearch, ledgerType, ledgerSide, ledgerMin, ledgerMax, ledgerPageSize, ledgerOrder], () => {
  ledgerPage.value = 1;
}, { flush: 'sync' });
watch(api.companyId, () => { selectedId.value = ''; resetLedgerFilters(); });
watch(accounts, rows => {
  if (accountsQuery.isSuccess.value && selectedId.value && !rows.some(row => row.id === selectedId.value)) selectedId.value = '';
});
</script>
