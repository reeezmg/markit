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
    <UCard :ui="{ body: { padding: 'p-0 sm:p-0' } }">
      <div class="border-b border-gray-200 dark:border-gray-700 p-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search transfers..."
          class="w-full"
        />
      </div>
      <div class="grid min-h-[520px] lg:grid-cols-[390px_1fr]">
        <div class="border-r border-gray-200 dark:border-gray-700">
          <button
            v-for="row in filtered"
            :key="row.id"
            class="w-full border-b border-gray-200 dark:border-gray-700 p-4 text-left hover:bg-gray-50 dark:bg-gray-800"
            :class="{
              'bg-primary-50 dark:bg-primary-950/20': selected?.id === row.id,
            }"
            @click="selectedId = row.id"
          >
            <div class="flex justify-between">
              <div class="font-medium text-primary">
                {{ row.transferNumber }}
              </div>
              <div class="font-semibold">
                {{ money(row.amount, row.currency) }}
              </div>
            </div>
            <div class="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
              {{ row.fromAccount?.name }} → {{ row.toAccount?.name }} ·
              {{ date(row.transferDate) }}
            </div>
          </button>
          <div
            v-if="!filtered.length"
            class="p-8 text-center text-sm text-gray-500 dark:text-gray-400"
          >
            No transfers found.
          </div>
        </div>
        <div v-if="selected" class="p-6">
          <div
            class="flex items-start justify-between border-b border-gray-200 dark:border-gray-700 pb-5"
          >
            <div>
              <h3 class="text-xl font-semibold">
                {{ selected.transferNumber }}
              </h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ date(selected.transferDate)
                }}<span v-if="selected.referenceNumber">
                  · Ref: {{ selected.referenceNumber }}</span
                >
              </p>
            </div>
            <div v-if="!selected.imported" class="flex gap-2">
              <UButton
                color="gray"
                variant="soft"
                icon="i-lucide-pencil"
                @click="openEdit(selected)"
                >Edit</UButton
              ><UButton
                color="red"
                variant="soft"
                icon="i-lucide-trash-2"
                @click="remove"
                >Delete</UButton
              >
            </div>
          </div>
          <div class="my-8 grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <div class="text-xs uppercase text-gray-500 dark:text-gray-400">From Account</div>
              <div class="mt-2 text-lg font-semibold">
                {{ selected.fromAccount?.name }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ selected.fromAccount?.accountType.replaceAll("_", " ") }}
              </div>
            </div>
            <UIcon
              name="i-lucide-arrow-right"
              class="mx-auto size-6 text-primary"
            />
            <div class="rounded-lg border border-success-200 bg-success-50 p-5">
              <div class="text-xs uppercase text-success-700">To Account</div>
              <div class="mt-2 text-lg font-semibold text-success-700">
                {{ selected.toAccount?.name }}
              </div>
              <div class="text-xs text-success-600">
                {{ selected.toAccount?.accountType.replaceAll("_", " ") }}
              </div>
            </div>
          </div>
          <div class="rounded-lg bg-gray-50 dark:bg-gray-800 p-5 text-center">
            <div class="text-xs uppercase text-gray-500 dark:text-gray-400">Amount Transferred</div>
            <div class="mt-1 text-3xl font-bold">
              {{ money(selected.amount, selected.currency) }}
            </div>
          </div>
          <p
            v-if="selected.description"
            class="mt-5 whitespace-pre-wrap text-sm"
          >
            {{ selected.description }}
          </p>
          <SalesJournalEntries
            resource="account-transfer"
            :resource-id="selected.id"
            class="mt-6"
          />
        </div>
        <div v-else class="flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          Select a transfer to view details.
        </div>
      </div>
    </UCard>

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
import { computed, onMounted, reactive, ref } from "vue";
const api = useAccountantApi();
const baseCurrency = ref("INR");
const toast = useToast(),
  rows = ref<any[]>([]),
  accounts = ref<any[]>([]),
  selectedId = ref(""),
  search = ref(""),
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
      `${r.transferNumber} ${r.referenceNumber || ""} ${r.fromAccount?.name} ${r.toAccount?.name}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
  ),
);
const selected = computed(() =>
    rows.value.find((r) => r.id === selectedId.value),
  ),
  editing = computed(() => rows.value.find((r) => r.id === editingId.value));
async function load() {
  const [t, a, n] = await Promise.all([
    api.get<{ data: any[] }>("/account-transfers"),
    api.get<{ data: any[]; baseCurrency: string }>("/accounting-accounts"),
    api.get<{ transferNumber: string }>("/account-transfers/next-number"),
  ]);
  rows.value = t.data;
  baseCurrency.value = a.baseCurrency;
  accounts.value = a.data;
  nextNumber.value = n.transferNumber;
  if (!selectedId.value) selectedId.value = rows.value[0]?.id || "";
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
  const settings = await api.get('/account-settings/defaults');
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
async function remove() {
  if (!selected.value || !confirm(`Delete ${selected.value.transferNumber}?`))
    return;
  try {
    await api.delete(`/account-transfers/${selected.value.id}`);
    selectedId.value = "";
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
