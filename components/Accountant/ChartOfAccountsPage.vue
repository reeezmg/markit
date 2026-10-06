<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          Chart of Accounts
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Organize the accounts used to classify your business transactions. Balances are shown in {{ baseCurrency }}.
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="openCreate">New Account</UButton>
    </div>

    <UCard :ui="{ body: { padding: 'p-0 sm:p-0' } }">
      <div class="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 p-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search accounts..."
          class="min-w-64 flex-1"
        />
        <USelect
          v-model="categoryFilter"
          :options="categoryFilters"
          class="w-44"
        />
        <USelect v-model="statusFilter" :options="statusFilters" class="w-36" />
      </div>

      <div class="grid min-h-[560px] lg:grid-cols-[minmax(360px,42%)_1fr]">
        <div class="border-r border-gray-200 dark:border-gray-700">
          <div v-if="loading" class="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading accounts…
          </div>
          <div
            v-else-if="!visibleAccounts.length"
            class="p-8 text-center text-sm text-gray-500 dark:text-gray-400"
          >
            No accounts found.
          </div>
          <template v-for="category in visibleCategories" :key="category">
            <div
              class="bg-gray-50 dark:bg-gray-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
            >
              {{ title(category) }}
            </div>
            <button
              v-for="account in accountsFor(category)"
              :key="account.id"
              type="button"
              class="flex w-full items-center gap-3 border-b border-gray-200 dark:border-gray-700 px-4 py-3 text-left hover:bg-gray-50 dark:bg-gray-800"
              :class="{
                'bg-primary-50 dark:bg-primary-950/20':
                  selected?.id === account.id,
              }"
              :style="{ paddingLeft: `${16 + account.depth * 22}px` }"
              @click="selectedId = account.id"
            >
              <UIcon
                :name="
                  account.depth
                    ? 'i-lucide-corner-down-right'
                    : accountIcon(account)
                "
                class="size-4 text-gray-500 dark:text-gray-400"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {{ account.name }}
                </div>
                <div class="truncate text-xs text-gray-500 dark:text-gray-400">
                  {{ account.code || "No code" }} ·
                  {{ typeLabel(account.accountType) }}
                </div>
              </div>
              <span class="text-sm font-medium">{{
                money(account.balance)
              }}</span>
              <UBadge
                v-if="!account.isActive"
                color="gray"
                variant="subtle"
                size="xs"
                >Inactive</UBadge
              >
            </button>
          </template>
        </div>

        <div v-if="selected" class="p-5 sm:p-7">
          <div
            class="flex items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-700 pb-5"
          >
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
                  {{ selected.name }}
                </h3>
                <UBadge v-if="selected.isSystem" color="blue" variant="subtle"
                  >System Account</UBadge
                >
                <UBadge
                  :color="selected.isActive ? 'green' : 'gray'"
                  variant="subtle"
                >
                  {{ selected.isActive ? "Active" : "Inactive" }}
                </UBadge>
              </div>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ typeLabel(selected.accountType) }}
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                color="gray"
                variant="soft"
                icon="i-lucide-pencil"
                @click="openEdit(selected)"
                >Edit</UButton
              >
              <UButton
                color="gray"
                variant="soft"
                :icon="
                  selected.isActive
                    ? 'i-lucide-circle-pause'
                    : 'i-lucide-circle-play'
                "
                :disabled="selected.isSystem && selected.isActive"
                @click="toggleStatus"
              >
                {{ selected.isActive ? "Mark Inactive" : "Mark Active" }}
              </UButton>
              <UButton
                v-if="!selected.isSystem"
                color="red"
                variant="soft"
                icon="i-lucide-trash-2"
                @click="removeAccount"
                >Delete</UButton
              >
            </div>
          </div>

          <dl class="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">Account Code</dt>
              <dd class="mt-1 text-sm">{{ selected.code || "—" }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">Currency</dt>
              <dd class="mt-1 text-sm">{{ selected.currency }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">Parent Account</dt>
              <dd class="mt-1 text-sm">{{ parentName(selected.parentId) }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">Dashboard Watchlist</dt>
              <dd class="mt-1 text-sm">
                {{ selected.showOnDashboard ? "Included" : "Not included" }}
              </dd>
            </div>
            <div>
              <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">Current Balance</dt>
              <dd class="mt-1 text-lg font-semibold">
                {{ money(selected.balance) }}
              </dd>
            </div>
            <div v-if="selected.openingBalance">
              <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">Opening Balance</dt>
              <dd class="mt-1 text-sm">
                {{ money(selected.openingBalance) }}
                <span class="text-xs text-gray-500 dark:text-gray-400"
                  >as of {{ formatDate(selected.openingBalanceDate!) }}</span
                >
              </dd>
            </div>
            <template v-if="isBankType(selected.accountType)">
              <div>
                <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">Bank Name</dt>
                <dd class="mt-1 text-sm">{{ selected.bankName || "—" }}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">Account Number</dt>
                <dd class="mt-1 text-sm">
                  {{ selected.accountNumber || "—" }}
                </dd>
              </div>
              <div>
                <dt class="text-xs uppercase text-gray-500 dark:text-gray-400">Routing / IFSC</dt>
                <dd class="mt-1 text-sm">
                  {{ selected.routingNumber || "—" }}
                </dd>
              </div>
            </template>
          </dl>
          <div class="mt-6">
            <div class="text-xs uppercase text-gray-500 dark:text-gray-400">Description</div>
            <p class="mt-1 whitespace-pre-wrap text-sm">
              {{ selected.description || "No description added." }}
            </p>
          </div>

          <div class="mt-7 border-t border-dashed border-primary-300 pt-6">
            <div class="rounded-md bg-gray-50 dark:bg-gray-800/60 p-4">
              <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Closing Balance
              </div>
              <div class="mt-1 text-2xl font-semibold text-primary">
                {{ ledgerMoney(ledger?.closingBalance ?? selected.balance) }}
                <span class="text-base"
                  >({{
                    ledger?.balanceSide ?? normalSide(selected.category)
                  }})</span
                >
              </div>
            </div>

            <div class="mt-6">
              <h4 class="text-lg font-semibold">Recent Transactions</h4>
              <div class="flex flex-wrap gap-2 mt-3">
                <UInput v-model="ledgerFrom" type="date" aria-label="Ledger from date" />
                <UInput v-model="ledgerTo" type="date" aria-label="Ledger to date" />
                <UButton color="gray" @click="ledgerPage = 1; loadLedger(selected.id)">Apply dates</UButton>
              </div>
            </div>
            <div class="mt-3 overflow-x-auto">
              <table class="w-full min-w-[760px] text-sm">
                <thead
                  class="border-y border-primary-200 text-xs uppercase text-gray-500 dark:text-gray-400"
                >
                  <tr>
                    <th class="px-3 py-3 text-left">Date</th>
                    <th class="px-3 py-3 text-left">Transaction Details</th>
                    <th class="px-3 py-3 text-left">Type</th>
                    <th class="px-3 py-3 text-right">Debit</th>
                    <th class="px-3 py-3 text-right">Credit</th>
                    <th class="px-3 py-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="line in ledger?.data ?? []"
                    :key="line.id"
                    class="border-b border-gray-200 dark:border-gray-700"
                  >
                    <td class="px-3 py-4">{{ formatDate(line.date) }}</td>
                    <td class="px-3 py-4">
                      <div>{{ line.transactionDetails }}</div>
                      <div v-if="line.sourceParties?.client" class="text-xs text-gray-500">Client: {{ line.sourceParties.client.name }}</div>
                      <div v-if="line.sourceParties?.user" class="text-xs text-gray-500">User: {{ line.sourceParties.user.name }}</div>
                      <div v-if="line.sourceParties?.creditUser" class="text-xs text-gray-500">Credit owed by: {{ line.sourceParties.creditUser.name }}</div>
                      <div v-if="line.sourceParties?.creditAccount" class="text-xs text-gray-500">Customer account: {{ line.sourceParties.creditAccount.name }}</div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {{ line.referenceNumber || line.journalNumber }}
                      </div>
                    </td>
                    <td class="px-3 py-4">{{ line.type }}</td>
                    <td class="px-3 py-4 text-right">
                      {{ line.debit ? ledgerLineMoney(line.debit, line) : "—" }}
                    </td>
                    <td class="px-3 py-4 text-right">
                      {{
                        line.credit ? ledgerLineMoney(line.credit, line) : "—"
                      }}
                    </td>
                    <td
                      class="whitespace-nowrap px-3 py-4 text-right font-medium"
                    >
                      {{ ledgerMoney(line.balance) }} {{ line.balanceSide }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="flex items-center justify-between gap-3 py-3">
                <UButton color="gray" :disabled="ledgerPage <= 1 || ledgerLoading" @click="ledgerPage--; loadLedger(selected.id)">Previous</UButton>
                <span class="text-sm text-gray-500">Page {{ ledgerPage }} · {{ ledger?.total || 0 }} entries</span>
                <UButton color="gray" :disabled="ledgerPage * 50 >= (ledger?.total || 0) || ledgerLoading" @click="ledgerPage++; loadLedger(selected.id)">Next</UButton>
              </div>
              <div
                v-if="ledgerLoading"
                class="py-10 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                Loading ledger…
              </div>
              <div
                v-else-if="!ledger?.data.length"
                class="py-10 text-center text-sm text-gray-500 dark:text-gray-400"
              >
                No published transactions for this account.
              </div>
            </div>
          </div>
        </div>
        <div
          v-else
          class="flex items-center justify-center p-8 text-sm text-gray-500 dark:text-gray-400"
        >
          Select an account to view its details.
        </div>
      </div>
    </UCard>

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
import { computed, onMounted, reactive, ref, watch } from "vue";
const api = useAccountantApi();
const baseCurrency = ref("INR");
const ledgerPage = ref(1), ledgerFrom = ref(''), ledgerTo = ref('');

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
const accounts = ref<Account[]>([]),
  loading = ref(false),
  saving = ref(false),
  formOpen = ref(false);
const ledger = ref<any>(null),
  ledgerLoading = ref(false);
const selectedId = ref(typeof useRoute().query.account === "string" ? String(useRoute().query.account) : ""),
  editingId = ref(""),
  search = ref(""),
  categoryFilter = ref("ALL"),
  statusFilter = ref("ALL");
const toast = useToast();
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
const selected = computed(() => byId.value.get(selectedId.value));
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
async function loadLedger(id: string) {
  if (!id) {
    ledger.value = null;
    return;
  }
  ledgerLoading.value = true;
  try {
    ledger.value = await api.get(`/accounting-accounts/${id}/ledger`, { query: { page: ledgerPage.value,
      ...(ledgerFrom.value ? { from: ledgerFrom.value } : {}), ...(ledgerTo.value ? { to: ledgerTo.value } : {}) } });
  } catch (e: any) {
    ledger.value = null;
    toast.add({
      title: "Could not load account ledger",
      description: e.message,
      color: "red",
    });
  } finally {
    ledgerLoading.value = false;
  }
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
  loading.value = true;
  try {
    const result = await api.get<{ data: Account[]; baseCurrency: string }>("/accounting-accounts");
    baseCurrency.value = result.baseCurrency;
    accounts.value = addDepth(result.data);
    if (
      !selectedId.value ||
      !accounts.value.some((a) => a.id === selectedId.value)
    )
      selectedId.value = accounts.value[0]?.id || "";
  } catch (e: any) {
    toast.add({
      title: "Could not load accounts",
      description: e.message,
      color: "red",
    });
  } finally {
    loading.value = false;
  }
}
function openCreate() {
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
    await load();
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
    await load();
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
    await load();
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
watch(selectedId, (id) => { ledgerPage.value = 1; loadLedger(id); }, { immediate: true });
onMounted(load);
</script>
