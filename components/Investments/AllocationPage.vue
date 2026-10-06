<script setup lang="ts">
import { investmentMoney, investmentToday } from '~/utils/investments';
const api = useAccountantApi(),
    toast = useToast();
const today = investmentToday(),
    form = reactive({
        periodFrom: today.slice(0, 7) + '-01',
        periodTo: today,
        distributable: '',
        date: today,
        note: '',
    });
const profit = ref<any>(null),
    preview = ref<any>(null),
    history = ref<any[]>([]),
    selected = ref<any>(null),
    busy = ref(false),
    error = ref(''),
    requestId = ref('');
const currency = computed(
    () => profit.value?.currency || preview.value?.currency || 'INR'
);
const money = (n: any) => investmentMoney(n, currency.value);
const columns = [
    { key: 'name', label: 'Investor' },
    { key: 'profitPercent', label: 'Profit share' },
    { key: 'amount', label: 'Allocation' },
];
const historyColumns = [
    { key: 'period', label: 'Profit period' },
    { key: 'date', label: 'Approved date' },
    { key: 'total', label: 'Allocated' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: '' },
];
watch(
    () => [form.periodFrom, form.periodTo],
    () => {
        profit.value = null;
        preview.value = null;
    }
);
watch(
    () => form.distributable,
    () => {
        preview.value = null;
    }
);
async function loadHistory() {
    try {
        history.value = await api.get('/investor-profits/history');
    } catch (e: any) {
        error.value = e.message;
    }
}
onMounted(loadHistory);
async function calculate() {
    busy.value = true;
    error.value = '';
    preview.value = null;
    try {
        profit.value = await api.get('/investor-profits/profit', {
            query: { periodFrom: form.periodFrom, periodTo: form.periodTo },
        });
        form.distributable = String(Math.max(0, profit.value.profit));
    } catch (e: any) {
        error.value = e.message;
    } finally {
        busy.value = false;
    }
}
async function review() {
    busy.value = true;
    error.value = '';
    try {
        preview.value = await api.post('/investor-profits/preview', {
            periodFrom: form.periodFrom,
            periodTo: form.periodTo,
            distributable: Number(form.distributable),
        });
        requestId.value = crypto.randomUUID();
    } catch (e: any) {
        error.value = e.message;
    } finally {
        busy.value = false;
    }
}
async function approve() {
    if (!preview.value || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
        const result = await api.post('/investor-profits/approve', {
            periodFrom: form.periodFrom,
            periodTo: form.periodTo,
            distributable: Number(form.distributable),
            date: form.date,
            note: form.note,
            previewHash: preview.value.previewHash,
            requestId: requestId.value,
        });
        toast.add({
            title: `${money(result.total)} allocated to ${
                result.entries.length
            } investors`,
            color: 'green',
        });
        preview.value = null;
        profit.value = null;
        await loadHistory();
    } catch (e: any) {
        error.value = e.message;
    } finally {
        busy.value = false;
    }
}
</script>
<template
    ><div class="space-y-6 max-w-6xl">
        <div
            ><h1 class="text-xl font-semibold">Allocate company profit</h1
            ><p class="text-sm text-gray-500"
                >Calculate profit for a period, choose how much to share, and
                approve all investor allocations together.</p
            ></div
        >
        <UAlert v-if="error" color="red" :title="error" />
        <UCard
            ><form @submit.prevent="calculate"
                ><fieldset
                    :disabled="busy"
                    class="flex flex-wrap items-end gap-4"
                    ><UFormGroup label="Period from" required
                        ><UInput
                            v-model="form.periodFrom"
                            type="date"
                            required /></UFormGroup
                    ><UFormGroup label="Period to" required
                        ><UInput
                            v-model="form.periodTo"
                            type="date"
                            required /></UFormGroup
                    ><UButton type="submit" :loading="busy"
                        >Calculate profit</UButton
                    ></fieldset
                ></form
            ><p class="text-xs text-gray-500 mt-3"
                >Calculated from posted income minus expenses in the new
                accounts, including exchange rates. Drafts are excluded.
                Complete your accounting entries before distributing profit.</p
            ></UCard
        >
        <template v-if="profit">
            <div class="grid gap-4 sm:grid-cols-3"
                ><UCard
                    v-for="[key, title] in [
                        ['income', 'Income'],
                        ['expenses', 'Expenses'],
                        ['profit', 'Company profit'],
                    ]"
                    :key="key"
                    ><p class="text-sm text-gray-500">{{ title }}</p
                    ><p class="text-xl font-semibold mt-2">{{
                        money(profit[key])
                    }}</p></UCard
                ></div
            >
            <UAlert
                v-if="profit.profit <= 0"
                color="orange"
                title="No positive profit to distribute for this period."
            />
            <UCard v-else
                ><form class="space-y-4" @submit.prevent="review"
                    ><fieldset
                        :disabled="busy"
                        class="flex flex-wrap items-end gap-4"
                        ><UFormGroup
                            :label="`Amount to share (${currency})`"
                            help="Enter the whole company amount, not one investor's share."
                            required
                            ><UInput
                                v-model="form.distributable"
                                type="number"
                                min="0.01"
                                :max="profit.profit"
                                step="0.01"
                                required /></UFormGroup
                        ><UButton type="submit" :loading="busy"
                            >Preview all shares</UButton
                        ></fieldset
                    ></form
                ></UCard
            >
        </template>
        <UCard v-if="preview"
            ><template #header
                ><h2 class="font-semibold"
                    >Review everyone's allocation</h2
                ></template
            >
            <div v-if="preview.issues.length" class="space-y-2 mb-4"
                ><UAlert
                    v-for="issue in preview.issues"
                    :key="issue"
                    color="orange"
                    :title="issue"
                /><UButton to="/investments/investors" variant="outline"
                    >Review investor agreements</UButton
                ></div
            >
            <UTable :rows="preview.rows" :columns="columns"
                ><template #profitPercent-data="{ row }"
                    >{{ row.profitPercent }}%</template
                ><template #amount-data="{ row }">{{
                    money(row.amount)
                }}</template></UTable
            >
            <div class="grid gap-4 sm:grid-cols-3 border-t pt-4 mt-4"
                ><div
                    ><p class="text-xs text-gray-500"
                        >Total going to investors</p
                    ><p class="font-semibold">{{
                        money(preview.total)
                    }}</p></div
                ><div
                    ><p class="text-xs text-gray-500"
                        >Unassigned shares / rounding</p
                    ><p class="font-semibold">{{
                        money(preview.unassigned)
                    }}</p></div
                ><div
                    ><p class="text-xs text-gray-500"
                        >Profit retained in the business</p
                    ><p class="font-semibold">{{
                        money(preview.retained)
                    }}</p></div
                ></div
            >
            <p class="text-xs text-gray-500 mt-3"
                >Allocations use each active investor's agreed percentage.
                Unassigned shares and rounding stay in the business. Approval
                records the amount owed; payments are recorded separately.</p
            >
            <form class="mt-5 border-t pt-4 space-y-4" @submit.prevent="approve"
                ><fieldset :disabled="busy" class="grid gap-4 sm:grid-cols-2"
                    ><UFormGroup label="Allocation date"
                        ><UInput
                            v-model="form.date"
                            type="date"
                            :min="form.periodTo"
                            required /></UFormGroup
                    ><UFormGroup label="Note (optional)"
                        ><UInput
                            v-model="form.note"
                            maxlength="2000" /></UFormGroup></fieldset
                ><UButton
                    type="submit"
                    :disabled="!!preview.issues.length"
                    :loading="busy"
                    >Approve allocations for all investors</UButton
                ></form
            >
        </UCard>
        <UCard
            ><template #header
                ><h2 class="font-semibold">Allocation history</h2></template
            ><UTable :rows="history" :columns="historyColumns"
                ><template #period-data="{ row }"
                    >{{ row.periodFrom }} – {{ row.periodTo }}</template
                ><template #total-data="{ row }">{{
                    investmentMoney(row.total, row.currency)
                }}</template
                ><template #status-data="{ row }">{{
                    row.reversed
                        ? `${row.reversed} of ${row.entries.length} reversed`
                        : 'Approved'
                }}</template
                ><template #actions-data="{ row }"
                    ><UButton variant="ghost" @click="selected = row"
                        >View breakdown</UButton
                    ></template
                ></UTable
            ></UCard
        >
        <UModal
            :model-value="!!selected"
            @update:model-value="(v:boolean)=>{if(!v)selected=null}"
            ><UCard v-if="selected"
                ><template #header
                    >Allocation · {{ selected.periodFrom }} –
                    {{ selected.periodTo }}</template
                ><p class="text-sm mb-3"
                    >Company profit
                    {{ investmentMoney(selected.profit, selected.currency) }} ·
                    Amount to share
                    {{
                        investmentMoney(
                            selected.distributable,
                            selected.currency
                        )
                    }}</p
                ><UTable :rows="selected.rows" :columns="columns"
                    ><template #name-data="{ row }"
                        ><NuxtLink
                            :to="`/investments/investors/${row.investorId}`"
                            class="text-primary-500"
                            >{{ row.name }}</NuxtLink
                        ></template
                    ><template #profitPercent-data="{ row }"
                        >{{ row.profitPercent }}%</template
                    ><template #amount-data="{ row }">{{
                        investmentMoney(row.amount, selected.currency)
                    }}</template></UTable
                ><p class="text-sm mt-3">{{ selected.note }}</p
                ><template #footer
                    ><UButton @click="selected = null">Close</UButton></template
                ></UCard
            ></UModal
        >
    </div></template
>
