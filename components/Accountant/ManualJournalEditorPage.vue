<template>
  <div class="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
    <div
      class="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ editing ? "Edit Manual Journal" : "New Manual Journal" }}
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Record a balanced debit and credit entry directly in your accounts.
        </p>
      </div>
      <UButton
        icon="i-lucide-x"
        color="gray"
        variant="ghost"
        @click="router.push('/accountant/manual-journals')"
      />
    </div>

    <form @submit.prevent class="space-y-6 p-6">
      <div v-if="!editing" class="flex flex-wrap gap-3 items-end">
        <UFormGroup label="Journal template"><USelect v-model="templateId" :options="templateOptions" /></UFormGroup>
        <UFormGroup v-if="selectedTemplate?.templateMode === 'PERCENTAGE'" label="Journal total"><UInput v-model.number="templateTotal" type="number" step="0.01" min="0.01" /></UFormGroup>
        <UButton color="gray" :disabled="!selectedTemplate" @click="applyTemplate">Use template</UButton>
      </div>
      <section class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <UFormGroup label="Journal Number"
          ><UInput :model-value="entryNumber" disabled class="w-full"
        /></UFormGroup>
        <UFormGroup label="Journal Date" required
          ><UInput v-model="form.journalDate" type="date" class="w-full"
        /></UFormGroup>
        <UFormGroup label="Reference #"
          ><UInput v-model="form.referenceNumber" class="w-full"
        /></UFormGroup>
        <UFormGroup label="Reporting Method">
          <USelect
            v-model="form.journalType"
            :options="reportingMethods"
            class="w-full"
          />
        </UFormGroup>
        <UFormGroup label="Currency"
          ><USelect
            v-model="form.currency"
            :options="['INR', 'USD', 'EUR', 'GBP', 'AED']"
            class="w-full"
        /></UFormGroup>
        <UFormGroup
          v-if="form.currency !== 'INR'"
          label="Exchange Rate"
          required
          ><UInput
            v-model.number="form.exchangeRate"
            type="number"
            min="0.000001"
            step="0.000001"
            class="w-full"
        /></UFormGroup>
        <UFormGroup
          label="Reverse Journal Date"
          help="Optional future reversal date."
          ><UInput v-model="form.reversalDate" type="date" class="w-full"
        /></UFormGroup>
      </section>

      <UFormGroup label="Notes / Reason" required>
        <UTextarea
          v-model="form.notes"
          :rows="2"
          placeholder="Why is this journal entry required?"
          class="w-full"
        />
      </UFormGroup>

      <section class="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
        <table class="w-full min-w-[1000px] text-sm">
          <thead class="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th class="px-3 py-3 text-left">Account</th>
              <th class="px-3 py-3 text-left">Description</th>
              <th class="px-3 py-3 text-left">Contact</th>
              <th class="px-3 py-3 text-left">Project</th>
              <th class="px-3 py-3 text-right">Debit</th>
              <th class="px-3 py-3 text-right">Credit</th>
              <th class="w-10"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(line, index) in form.lines"
              :key="index"
              class="border-t border-gray-200 dark:border-gray-700"
            >
              <td class="p-2">
                <USelectMenu
                  v-model="line.accountId"
                  :options="accountOptions"
                  value-attribute="value"
                  option-attribute="label"
                  searchable
                  placeholder="Select account"
                  class="w-56"
                />
              </td>
              <td class="p-2">
                <UInput
                  v-model="line.description"
                  placeholder="Line description"
                  class="w-52"
                />
              </td>
              <td class="p-2">
                <USelectMenu
                  v-model="line.partyId"
                  :options="partyOptions"
                  value-attribute="value"
                  option-attribute="label"
                  searchable
                  placeholder="Optional"
                  class="w-44"
                />
              </td>
              <td class="p-2">
                <USelectMenu
                  v-model="line.projectId"
                  :options="projectOptions"
                  value-attribute="value"
                  option-attribute="label"
                  searchable
                  placeholder="Optional"
                  class="w-44"
                />
              </td>
              <td class="p-2">
                <UInput
                  :model-value="line.side === 'DEBIT' ? line.amount : null"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-32 text-right"
                  @update:model-value="setAmount(line, 'DEBIT', $event)"
                />
              </td>
              <td class="p-2">
                <UInput
                  :model-value="line.side === 'CREDIT' ? line.amount : null"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-32 text-right"
                  @update:model-value="setAmount(line, 'CREDIT', $event)"
                />
              </td>
              <td class="p-2">
                <UButton
                  color="red"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-trash-2"
                  :disabled="form.lines.length <= 2"
                  @click="form.lines.splice(index, 1)"
                />
              </td>
            </tr>
          </tbody>
          <tfoot class="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-semibold">
            <tr>
              <td colspan="4" class="px-3 py-3 text-right">Total</td>
              <td class="px-3 py-3 text-right">{{ money(debitTotal) }}</td>
              <td class="px-3 py-3 text-right">{{ money(creditTotal) }}</td>
              <td></td>
            </tr>
            <tr v-if="!balanced" class="text-error">
              <td colspan="6" class="px-3 pb-3 text-right">
                Difference: {{ money(Math.abs(debitTotal - creditTotal)) }}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </section>
      <UButton
        color="gray"
        variant="soft"
        icon="i-lucide-plus"
        @click="form.lines.push(newLine())"
        >Add another line</UButton
      >

      <div class="flex gap-2 border-t border-gray-200 dark:border-gray-700 pt-5">
        <UButton
          :loading="saving"
          color="gray"
          variant="soft"
          @click="save('DRAFT')"
          >Save as Draft</UButton
        >
        <UButton
          :loading="saving"
          icon="i-lucide-send"
          :disabled="!balanced"
          @click="save('PUBLISHED')"
          >Save and Publish</UButton
        >
        <UButton
          color="gray"
          variant="ghost"
          @click="router.push('/accountant/manual-journals')"
          >Cancel</UButton
        >
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { useRoute, useRouter } from "vue-router";
const api = useAccountantApi();

const route = useRoute(),
  router = useRouter(),
  toast = useToast();
const editing = computed(() => Boolean(route.params.id)),
  saving = ref(false);
const today = new Date().toISOString().slice(0, 10);
const newLine = () => ({
  accountId: "",
  side: "DEBIT" as "DEBIT" | "CREDIT",
  amount: 0,
  description: "",
  partyId: "",
  projectId: "",
});
const form = reactive({
  journalDate: today,
  referenceNumber: "",
  notes: "",
  currency: "INR",
  exchangeRate: 1,
  journalType: "BOTH",
  reversalDate: "",
  lines: [newLine(), { ...newLine(), side: "CREDIT" as const }],
});
const { data: numberData } = useQuery({
  queryKey: ["accountant-v2", api.companyId, "manual-journal-next"],
  queryFn: () =>
    api.get<{ entryNumber: string }>("/manual-journals/next-number"),
  enabled: computed(() => !editing.value),
});
const { data: accountsData } = useQuery({
  queryKey: ["accountant-v2", api.companyId, "accounting-accounts"],
  queryFn: () => api.get<{ data: any[] }>("/accounting-accounts"),
});
const templateId = ref(''), templateTotal = ref(0);
const { data: templatesData } = useQuery({
  queryKey: ['accountant-v2', api.companyId, 'journal-templates'],
  queryFn: () => api.get<{ data: any[] }>('/accountant-management/journal-templates'),
});
const templateOptions = computed(() => [{ label: 'No template', value: '' }, ...(templatesData.value?.data || []).map(t => ({ label: t.name, value: t.id }))]);
const selectedTemplate = computed(() => templatesData.value?.data.find(t => t.id === templateId.value));
function applyTemplate() {
  const template = selectedTemplate.value;
  if (!template) return;
  Object.assign(form, { notes: template.notes || '', referenceNumber: template.referenceNumber || '',
    journalType: template.journalType, currency: template.currency, exchangeRate: Number(template.exchangeRate),
    lines: template.lines.map((line: any) => ({ ...newLine(), ...line,
      amount: template.templateMode === 'PERCENTAGE' ? Math.round(templateTotal.value * Number(line.amount)) / 100 : Number(line.amount) })) });
}
const { data: partiesData } = useQuery({
  queryKey: ["accountant-v2", api.companyId, "parties-journal"],
  queryFn: () =>
    api.get<{ data: any[] }>("/parties", { query: { pageSize: 100 } }),
});
const { data: projectsData } = useQuery({
  queryKey: ["accountant-v2", api.companyId, "projects-journal"],
  queryFn: () =>
    api.get<{ data: any[] }>("/projects", { query: { pageSize: 100 } }),
});
const journalQuery = useQuery({
  queryKey: computed(() => ["accountant-v2", api.companyId.value, "manual-journal", route.params.id]),
  queryFn: () => api.get<any>(`/manual-journals/${route.params.id}`),
  enabled: editing,
});
const entryNumber = computed(
  () =>
    journalQuery.data.value?.entryNumber ||
    numberData.value?.entryNumber ||
    "Auto-generated",
);
const accountOptions = computed(() =>
  (accountsData.value?.data || [])
    .filter((a) => a.isActive)
    .map((a) => ({
      value: a.id,
      label: `${a.code ? a.code + " · " : ""}${a.name}`,
    })),
);
const partyOptions = computed(() => [
  { value: "", label: "No contact" },
  ...(partiesData.value?.data || []).map((p) => ({
    value: p.id,
    label: p.name,
  })),
]);
const projectOptions = computed(() => [
  { value: "", label: "No project" },
  ...(projectsData.value?.data || []).map((p) => ({
    value: p.id,
    label: p.name,
  })),
]);
const reportingMethods = [
  { label: "Accrual and Cash", value: "BOTH" },
  { label: "Cash Only", value: "CASH" },
  { label: "Accrual Only", value: "ACCRUAL" },
];
const debitTotal = computed(() =>
  form.lines
    .filter((l) => l.side === "DEBIT")
    .reduce((s, l) => s + Number(l.amount || 0), 0),
);
const creditTotal = computed(() =>
  form.lines
    .filter((l) => l.side === "CREDIT")
    .reduce((s, l) => s + Number(l.amount || 0), 0),
);
const balanced = computed(
  () =>
    debitTotal.value > 0 &&
    Math.abs(debitTotal.value - creditTotal.value) < 0.005,
);
function money(v: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: form.currency,
  }).format(v || 0);
}
function setAmount(line: any, side: "DEBIT" | "CREDIT", value: any) {
  line.side = side;
  line.amount = Number(value || 0);
}
watch(journalQuery.data, (j: any) => {
  if (!j) return;
  Object.assign(form, {
    journalDate: j.journalDate.slice(0, 10),
    referenceNumber: j.referenceNumber || "",
    notes: j.notes,
    currency: j.currency,
    exchangeRate: Number(j.exchangeRate),
    journalType: j.journalType,
    reversalDate: j.reversalDate?.slice(0, 10) || "",
    lines: j.lines.map((l: any) => ({
      accountId: l.accountId,
      side: l.side,
      amount: Number(l.amount),
      description: l.description || "",
      partyId: l.partyId || "",
      projectId: l.projectId || "",
    })),
  });
}, { immediate: true });
async function save(status: "DRAFT" | "PUBLISHED") {
  if (!form.notes.trim())
    return toast.add({ title: "Notes are required", color: "red" });
  if (form.lines.some((l) => !l.accountId || Number(l.amount) <= 0))
    return toast.add({
      title: "Select an account and amount for every line",
      color: "red",
    });
  if (!balanced.value)
    return toast.add({
      title: "Debits and credits must be equal",
      color: "red",
    });
  saving.value = true;
  try {
    const payload = {
      ...form,
      status,
      reversalDate: form.reversalDate || null,
      lines: form.lines.map((l) => ({
        ...l,
        partyId: l.partyId || null,
        projectId: l.projectId || null,
      })),
    };
    if (editing.value)
      await api.patch(`/manual-journals/${route.params.id}`, payload);
    else await api.post("/manual-journals", payload);
    toast.add({
      title: status === "PUBLISHED" ? "Journal published" : "Draft saved",
      color: "green",
    });
    router.push("/accountant/manual-journals");
  } catch (e: any) {
    toast.add({
      title: "Could not save journal",
      description: e.message,
      color: "red",
    });
  } finally {
    saving.value = false;
  }
}
</script>
