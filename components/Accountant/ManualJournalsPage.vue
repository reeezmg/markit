<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold">Manual Journals</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Record balanced entries that do not belong in standard sales or
          purchase workflows.
        </p>
      </div>
      <UButton to="/accountant/manual-journals/add" icon="i-lucide-plus"
        >New Journal</UButton
      >
    </div>
    <UCard :ui="{ body: { padding: 'p-0 sm:p-0' } }">
      <div class="flex gap-2 border-b border-gray-200 dark:border-gray-700 p-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search journals..."
          class="flex-1"
        />
        <USelect
          v-model="status"
          :options="[
            { label: 'All Statuses', value: 'ALL' },
            { label: 'Draft', value: 'DRAFT' },
            { label: 'Published', value: 'PUBLISHED' },
          ]"
          class="w-40"
        />
      </div>
      <div class="grid min-h-[540px] lg:grid-cols-[370px_1fr]">
        <div class="border-r border-gray-200 dark:border-gray-700">
          <button
            v-for="j in filtered"
            :key="j.id"
            class="flex w-full items-center gap-3 border-b border-gray-200 dark:border-gray-700 p-4 text-left hover:bg-gray-50 dark:bg-gray-800"
            :class="{
              'bg-primary-50 dark:bg-primary-950/20': selected?.id === j.id,
            }"
            @click="selectedId = j.id"
          >
            <div class="min-w-0 flex-1">
              <div class="font-medium">{{ j.entryNumber }}</div>
              <div class="truncate text-xs text-gray-500 dark:text-gray-400">
                {{ date(j.journalDate) }} · {{ j.notes }}
              </div>
            </div>
            <div class="text-right">
              <div class="text-sm font-semibold">
                {{ money(j.total, j.currency) }}
              </div>
              <UBadge
                :color="j.status === 'PUBLISHED' ? 'green' : 'gray'"
                variant="subtle"
                size="xs"
                >{{ title(j.status) }}</UBadge
              >
            </div>
          </button>
          <div
            v-if="!filtered.length"
            class="p-8 text-center text-sm text-gray-500 dark:text-gray-400"
          >
            No manual journals found.
          </div>
        </div>
        <div v-if="selected" class="p-6">
          <div
            class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-700 pb-5"
          >
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-xl font-semibold">
                  {{ selected.entryNumber }}
                </h3>
                <UBadge
                  :color="
                    selected.status === 'PUBLISHED' ? 'green' : 'gray'
                  "
                  variant="subtle"
                  >{{ title(selected.status) }}</UBadge
                >
              </div>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ date(selected.journalDate)
                }}<span v-if="selected.referenceNumber">
                  · Ref: {{ selected.referenceNumber }}</span
                >
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                v-if="selected.status === 'DRAFT' && !selected.isSystemGenerated"
                color="gray"
                variant="soft"
                icon="i-lucide-pencil"
                :to="`/accountant/manual-journals/${selected.id}/edit`"
                >Edit</UButton
              >
              <UButton
                v-if="selected.status === 'DRAFT'"
                icon="i-lucide-send"
                @click="publish"
                >Publish</UButton
              >
              <UButton v-if="selected.status === 'DRAFT'" color="gray" @click="approve">Approve ({{ selected.approvals?.length || 0 }})</UButton>
              <UButton
                v-if="
                  selected.status === 'PUBLISHED' && !selected.isSystemGenerated &&
                  !selected.reversedFrom &&
                  !selected.reversals.length
                "
                color="gray"
                variant="soft"
                icon="i-lucide-undo-2"
                @click="reverseOpen = true"
                >Reverse</UButton
              >
              <UButton
                v-if="selected.status === 'DRAFT' && !selected.isSystemGenerated"
                color="red"
                variant="soft"
                icon="i-lucide-trash-2"
                @click="remove"
                >Delete</UButton
              >
            </div>
          </div>
          <div
            v-if="selected.reversedFrom"
            class="mt-4 rounded-md bg-warning-50 p-3 text-sm text-warning-700"
          >
            Reversal of {{ selected.reversedFrom.entryNumber }}
          </div>
          <div
            v-if="selected.reversals.length"
            class="mt-4 rounded-md bg-info-50 p-3 text-sm text-info-700"
          >
            Reversed by {{ selected.reversals[0].entryNumber }}
          </div>
          <p class="my-5 whitespace-pre-wrap text-sm">{{ selected.notes }}</p>
          <details v-if="selected.inventoryReconciliation" class="my-4 rounded border p-3 text-sm">
            <summary class="cursor-pointer font-medium">Stock sources at reconciliation</summary>
            <p class="my-2 text-gray-500">Remaining quantities valued at purchase price when this entry was posted. These values describe stock on hand, not separate purchase postings.</p>
            <div class="max-h-72 overflow-auto">
              <table class="w-full text-left">
                <thead><tr><th class="p-2">Product</th><th class="p-2">Purchase order</th><th class="p-2 text-right">Stock value</th></tr></thead>
                <tbody><tr v-for="product in selected.inventoryReconciliation.products" :key="product.product_id">
                  <td class="p-2"><NuxtLink :to="`/products/edit/${product.product_id}`" class="text-primary-500">{{ product.product_name }}</NuxtLink></td>
                  <td class="p-2"><NuxtLink v-if="product.purchase_order_id" :to="{ path: '/products/purchase', query: { poId: product.purchase_order_id, isEdit: 'true' } }" class="text-primary-500">View purchase order</NuxtLink><span v-else>No PO</span></td>
                  <td class="p-2 text-right">{{ money(product.value, selected.currency) }}</td>
                </tr></tbody>
              </table>
            </div>
          </details>
          <div class="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th class="p-3 text-left">Account</th>
                  <th class="p-3 text-left">Description</th>
                  <th class="p-3 text-right">Debit</th>
                  <th class="p-3 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="l in selected.lines"
                  :key="l.id"
                  class="border-t border-gray-200 dark:border-gray-700"
                >
                  <td class="p-3">
                    <div class="font-medium">{{ l.account.name }}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {{ l.account.code || "" }}
                    </div>
                  </td>
                  <td class="p-3 text-gray-500 dark:text-gray-400">
                    <div>{{ l.description || "—" }}</div>
                    <div v-if="l.sourceParties?.client" class="text-xs">Client: {{ l.sourceParties.client.name }}</div>
                    <div v-if="l.sourceParties?.user" class="text-xs">User: {{ l.sourceParties.user.name }}</div>
                    <div v-if="l.sourceParties?.creditUser" class="text-xs">Credit owed by: {{ l.sourceParties.creditUser.name }}</div>
                    <div v-if="l.sourceParties?.creditAccount" class="text-xs">Customer account: {{ l.sourceParties.creditAccount.name }}</div>
                  </td>
                  <td class="p-3 text-right">
                    {{
                      l.side === "DEBIT"
                        ? money(l.amount, selected.currency)
                        : "—"
                    }}
                  </td>
                  <td class="p-3 text-right">
                    {{
                      l.side === "CREDIT"
                        ? money(l.amount, selected.currency)
                        : "—"
                    }}
                  </td>
                </tr>
              </tbody>
              <tfoot class="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-semibold">
                <tr>
                  <td colspan="2" class="p-3 text-right">Total</td>
                  <td class="p-3 text-right">
                    {{ money(selected.total, selected.currency) }}
                  </td>
                  <td class="p-3 text-right">
                    {{ money(selected.total, selected.currency) }}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div v-else class="flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          Select a journal to view details.
        </div>
      </div>
    </UCard>
    <AccountantModal v-model="reverseOpen" title="Reverse Journal">
      <template #body
        ><div class="space-y-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            A published entry with debit and credit sides swapped will be
            created.
          </p>
          <UFormGroup label="Reversal Date" required
            ><UInput
              v-model="reverseDate"
              type="date"
              class="w-full" /></UFormGroup
          ><UFormGroup label="Notes"
            ><UTextarea v-model="reverseNotes" class="w-full"
          /></UFormGroup>
          <div class="flex justify-end gap-2">
            <UButton
              color="gray"
              variant="ghost"
              @click="reverseOpen = false"
              >Cancel</UButton
            ><UButton @click="reverseJournal">Create Reversal</UButton>
          </div>
        </div></template
      >
    </AccountantModal>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
const api = useAccountantApi();
const route = useRoute();
const toast = useToast(),
  rows = ref<any[]>([]),
  selectedId = ref(typeof route.query.journal === 'string' ? route.query.journal : ""),
  search = ref(""),
  status = ref("ALL"),
  reverseOpen = ref(false),
  reverseDate = ref(new Date().toISOString().slice(0, 10)),
  reverseNotes = ref("");
const filtered = computed(() =>
  rows.value.filter(
    (j) =>
      (status.value === "ALL" || j.status === status.value) &&
      (!search.value ||
        `${j.entryNumber} ${j.referenceNumber || ""} ${j.notes}`
          .toLowerCase()
          .includes(search.value.toLowerCase())),
  ),
);
const selected = computed(() =>
  rows.value.find((j) => j.id === selectedId.value),
);
async function load() {
  try {
    const r = await api.get<{ data: any[] }>("/manual-journals");
    rows.value = r.data;
    if (selectedId.value && !rows.value.some(j => j.id === selectedId.value)) {
      const journal = await api.get(`/manual-journals/${selectedId.value}`);
      rows.value.unshift(journal);
    }
    if (!selectedId.value || !rows.value.some((j) => j.id === selectedId.value))
      selectedId.value = rows.value[0]?.id || "";
  } catch (e: any) {
    toast.add({
      title: "Could not load journals",
      description: e.message,
      color: "red",
    });
  }
}
async function publish() {
  try {
    await api.post(`/manual-journals/${selected.value.id}/publish`);
    await load();
    toast.add({ title: "Journal published", color: "green" });
  } catch (e: any) {
    toast.add({
      title: "Could not publish",
      description: e.message,
      color: "red",
    });
  }
}
async function approve() {
  await api.post(`/manual-journals/${selected.value.id}/approve`);
  await load();
}
async function remove() {
  if (!confirm(`Delete ${selected.value.entryNumber}?`)) return;
  try {
    await api.delete(`/manual-journals/${selected.value.id}`);
    selectedId.value = "";
    await load();
  } catch (e: any) {
    toast.add({
      title: "Could not delete",
      description: e.message,
      color: "red",
    });
  }
}
async function reverseJournal() {
  try {
    const j: any = await api.post(
      `/manual-journals/${selected.value.id}/reverse`,
      { journalDate: reverseDate.value, notes: reverseNotes.value },
    );
    reverseOpen.value = false;
    await load();
    selectedId.value = j.id;
    toast.add({ title: "Reversal journal created", color: "green" });
  } catch (e: any) {
    toast.add({
      title: "Could not reverse journal",
      description: e.message,
      color: "red",
    });
  }
}
const date = (v: string) =>
  new Intl.DateTimeFormat("en-IN").format(new Date(v));
const money = (v: any, c = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: c }).format(
    Number(v),
  );
const title = (v: string) => v[0] + v.slice(1).toLowerCase();
onMounted(load);
</script>
