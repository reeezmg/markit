<script setup lang="ts">
import {
  useFindManyClientCredit,
  useFindManyClient,
  useCreateClientCredit,
} from '~/lib/hooks';

const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const companyId = computed(() => useAuth().session.value?.companyId || '');

const enabled = computed(() => Boolean(companyId.value));

// Ledger entries (newest first) with the client they belong to.
const { data: credits, refetch: refetchCredits } = useFindManyClientCredit(
  computed(() => ({
    where: { companyId: companyId.value },
    include: { client: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: 'desc' as const },
    take: 200,
  })),
  { enabled },
);

// Clients of this company — for the "add credit" picker.
const { data: clients } = useFindManyClient(
  computed(() => ({
    where: { companies: { some: { companyId: companyId.value } }, deleted: false },
    select: { id: true, name: true, phone: true },
    orderBy: { name: 'asc' as const },
    take: 500,
  })),
  { enabled },
);

const clientOptions = computed(() =>
  (clients.value || []).map((c: any) => ({
    label: c.phone ? `${c.name} · ${c.phone}` : c.name,
    value: c.id,
  })),
);

// Current balance per client = balanceAfter of their most-recent entry.
const balances = computed(() => {
  const map: Record<string, { name: string; phone: string; balance: number; updatedAt: any }> = {};
  for (const entry of credits.value || []) {
    const cid = entry.clientId;
    if (!map[cid]) {
      map[cid] = {
        name: entry.client?.name || 'Client',
        phone: entry.client?.phone || '',
        balance: Number(entry.balanceAfter) || 0,
        updatedAt: entry.createdAt,
      };
    }
  }
  return map;
});

const balanceRows = computed(() =>
  Object.entries(balances.value)
    .map(([clientId, v]) => ({ clientId, ...v }))
    .sort((a, b) => b.balance - a.balance),
);

function currency(n: number) {
  return `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: any) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const typeOptions = [
  { label: 'Issue credit', value: 'ISSUE' },
  { label: 'Redeem / deduct', value: 'REDEEM' },
  { label: 'Refund to credit', value: 'REFUND' },
  { label: 'Manual adjustment', value: 'ADJUST' },
];
const typeColor: Record<string, string> = {
  ISSUE: 'green', REFUND: 'blue', REDEEM: 'red', ADJUST: 'amber', EXPIRE: 'gray',
};

// ─── Add / adjust modal ────────────────────────────────────────────────────────
const isOpen = ref(false);
const form = reactive({ clientId: '', amount: 0, type: 'ISSUE', reason: '' });
const saving = ref(false);

function openAdd(clientId = '') {
  form.clientId = clientId;
  form.amount = 0;
  form.type = 'ISSUE';
  form.reason = '';
  isOpen.value = true;
}

const currentBalance = computed(() => (form.clientId ? (balances.value[form.clientId]?.balance || 0) : 0));

// The signed delta applied to the balance, derived from type + amount.
const signedAmount = computed(() => {
  const amt = Math.abs(Number(form.amount) || 0);
  if (form.type === 'REDEEM' || form.type === 'EXPIRE') return -amt;
  if (form.type === 'ADJUST') return Number(form.amount) || 0; // allow signed input
  return amt; // ISSUE / REFUND
});
const projectedBalance = computed(() => currentBalance.value + signedAmount.value);

const canSave = computed(() =>
  Boolean(form.clientId) && Number(form.amount) !== 0 && projectedBalance.value >= 0 && !saving.value,
);

const CreateCredit = useCreateClientCredit();

async function save() {
  if (!canSave.value || !companyId.value) return;
  saving.value = true;
  try {
    await CreateCredit.mutateAsync({
      data: {
        amount: signedAmount.value,
        balanceAfter: projectedBalance.value,
        type: form.type as any,
        reason: form.reason || null,
        sourceType: 'manual',
        company: { connect: { id: companyId.value } },
        client: { connect: { id: form.clientId } },
      },
    } as any);
    await refetchCredits();
    isOpen.value = false;
    toast.add({ title: 'Credit updated', icon: 'i-heroicons-check-circle' });
  } catch (error: any) {
    toast.add({
      title: 'Could not update credit',
      description: error?.info?.message || error?.message,
      color: 'red',
      icon: 'i-heroicons-x-circle',
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UCard>
    <div class="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-gray-800 md:flex-row md:items-start md:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Store credit</h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage client credit balances used when a request settlement mode is set to <strong>Store credit</strong>.
        </p>
      </div>
      <UButton icon="i-heroicons-plus" @click="openAdd()">Add / adjust credit</UButton>
    </div>

    <!-- Balances -->
    <div v-if="balanceRows.length" class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <th class="px-3 py-2">Client</th>
            <th class="px-3 py-2 text-right">Balance</th>
            <th class="px-3 py-2 text-right">Last updated</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in balanceRows" :key="row.clientId" class="border-t border-gray-100 dark:border-gray-800">
            <td class="px-3 py-2.5">
              <div class="font-medium text-gray-900 dark:text-white">{{ row.name }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">{{ row.phone }}</div>
            </td>
            <td class="px-3 py-2.5 text-right font-semibold"
                :class="row.balance > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-500'">
              {{ currency(row.balance) }}
            </td>
            <td class="px-3 py-2.5 text-right text-gray-500 dark:text-gray-400">{{ fmtDate(row.updatedAt) }}</td>
            <td class="px-3 py-2.5 text-right">
              <UButton size="xs" color="gray" variant="ghost" @click="openAdd(row.clientId)">Adjust</UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="rounded-md border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
      No store credit issued yet. Use “Add / adjust credit” to start.
    </div>

    <!-- Ledger -->
    <div v-if="(credits || []).length" class="mt-6">
      <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Recent activity</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th class="px-3 py-2">Date</th>
              <th class="px-3 py-2">Client</th>
              <th class="px-3 py-2">Type</th>
              <th class="px-3 py-2">Reason</th>
              <th class="px-3 py-2 text-right">Amount</th>
              <th class="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in credits" :key="e.id" class="border-t border-gray-100 dark:border-gray-800">
              <td class="px-3 py-2 text-gray-500 dark:text-gray-400">{{ fmtDate(e.createdAt) }}</td>
              <td class="px-3 py-2 text-gray-900 dark:text-white">{{ e.client?.name }}</td>
              <td class="px-3 py-2"><UBadge size="xs" :color="typeColor[e.type] || 'gray'">{{ e.type }}</UBadge></td>
              <td class="px-3 py-2 text-gray-500 dark:text-gray-400">{{ e.reason || '—' }}</td>
              <td class="px-3 py-2 text-right font-medium"
                  :class="Number(e.amount) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                {{ Number(e.amount) >= 0 ? '+' : '' }}{{ currency(e.amount) }}
              </td>
              <td class="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{{ currency(e.balanceAfter) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add / adjust modal -->
    <UModal v-model="isOpen">
      <UCard>
        <template #header>
          <div class="font-semibold">Add / adjust store credit</div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Client">
            <USelectMenu
              v-model="form.clientId"
              :options="clientOptions"
              option-attribute="label"
              value-attribute="value"
              searchable
              placeholder="Select a client"
            />
          </UFormGroup>

          <div class="grid grid-cols-2 gap-3">
            <UFormGroup label="Type">
              <USelectMenu
                v-model="form.type"
                :options="typeOptions"
                option-attribute="label"
                value-attribute="value"
              />
            </UFormGroup>
            <UFormGroup label="Amount (₹)">
              <UInput v-model.number="form.amount" type="number" min="0" step="0.01" />
            </UFormGroup>
          </div>

          <UFormGroup label="Reason (optional)">
            <UInput v-model="form.reason" placeholder="e.g. Refund for order #1234" />
          </UFormGroup>

          <div v-if="form.clientId" class="rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
            <div class="flex justify-between text-gray-500 dark:text-gray-400">
              <span>Current balance</span><span>{{ currency(currentBalance) }}</span>
            </div>
            <div class="mt-1 flex justify-between font-semibold text-gray-900 dark:text-white">
              <span>New balance</span><span>{{ currency(projectedBalance) }}</span>
            </div>
            <p v-if="projectedBalance < 0" class="mt-1 text-xs text-red-500">Balance cannot go below zero.</p>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="isOpen = false">Cancel</UButton>
            <UButton :loading="saving" :disabled="!canSave" @click="save">Save</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </UCard>
</template>
