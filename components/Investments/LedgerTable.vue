<script setup lang="ts">
import {
    investmentLedger,
    investmentMoney,
    investmentToday,
    investmentMovementKinds,
    type InvestmentMovementMode,
} from '~/utils/investments';
const props = defineProps<{
        events: any[];
        currency: string;
        mode?: InvestmentMovementMode;
        investorId?: string;
    }>(),
    emit = defineEmits(['changed']);
const api = useAccountantApi(),
    from = ref(''),
    to = ref(investmentToday()),
    person = ref(props.investorId || ''),
    reversing = ref<any>(null),
    busy = ref(false),
    reverseDate = ref(investmentToday()),
    reason = ref(''), reverseError = ref('');
const people = computed(() => [
    { value: '', label: 'All investors' },
    ...Array.from(
        new Map(
            props.events.map((e) => [
                e.investor_id,
                {
                    value: e.investor_id,
                    label: e.investorName || e.investor_id,
                },
            ])
        ).values()
    ),
]);
const ledger = computed(() => investmentLedger(props.events));
const filtered = computed(() =>
    ledger.value.filter(
        (e) =>
            (!person.value || e.investor_id === person.value) &&
            (!from.value || e.date >= from.value) &&
            (!to.value || e.date <= to.value) &&
            (!props.mode ||
                investmentMovementKinds[props.mode].includes(e.movementKind))
    )
);
const opening = computed(
    () =>
        ledger.value
            .filter(
                (e) =>
                    e.investor_id === person.value &&
                    from.value &&
                    e.date < from.value
            )
            .at(-1) || { capital: 0, profit: 0, loan: 0 }
);
const closing = computed(
    () =>
        ledger.value
            .filter(
                (e) =>
                    e.investor_id === person.value &&
                    (!to.value || e.date <= to.value)
            )
            .at(-1) || { capital: 0, profit: 0, loan: 0 }
);
const balanceColumns = computed(() => {
    const all = [
        { key: 'capital', label: 'Net contributed capital' },
        { key: 'profit', label: 'Profit due' },
        { key: 'loan', label: 'Outstanding loan principal' },
    ];
    const key = props.mode === 'payouts' ? 'profit' : props.mode === 'loans' ? 'loan' : props.mode;
    return key ? all.filter(column => column.key === key) : all;
});
const columns = computed(() => [
    { key: 'date', label: 'Date' },
    ...(!props.investorId ? [{ key: 'investorName', label: 'Investor' }] : []),
    { key: 'label', label: 'Movement' },
    { key: 'amount', label: 'Amount' },
    ...balanceColumns.value,
    { key: 'reference', label: 'Reference' },
    { key: 'actions', label: '' },
]);
async function reverse() {
    if (!reversing.value) return;
    busy.value = true; reverseError.value = '';
    try {
        await api.post(
            `/investors/${reversing.value.investor_id}/reverse/${reversing.value.id}`,
            { date: reverseDate.value, reason: reason.value }
        );
        reversing.value = null;
        emit('changed');
    } catch (e: any) { reverseError.value = e.message;
    } finally {
        busy.value = false;
    }
}
function exportCsv() {
    const safe = (v: any) =>
        `"${String(v ?? '')
            .replace(/^[=+@-]/, "'$&")
            .replaceAll('"', '""')}"`;
    const records: any[][] = [
        ['Currency', props.currency],
        ['From', from.value || 'Beginning'],
        ['To', to.value || 'Latest'],
    ];
    if (person.value)
        for (const column of balanceColumns.value) records.push(
            [`Opening ${column.label}`, opening.value[column.key]],
            [`Closing ${column.label}`, closing.value[column.key]]
        );
    records.push(
        [],
        [
            'Date',
            'Investor',
            'Movement',
            'Amount',
            ...balanceColumns.value.map(column => column.label),
            'Shares',
            'Price per share',
            'Reference',
            'Note',
            'Status',
        ],
        ...filtered.value.map((e) => [
            e.date,
            e.investorName,
            e.label,
            e.amount,
            ...balanceColumns.value.map(column => e[column.key]),
            e.details.capitalPreview?.shareQuantity ?? '',
            e.details.pricePerShare ?? '',
            e.details.reference || e.legacy_id,
            e.details.note,
            e.recorded ? 'Shares recorded' : e.posted ? 'Posted' : 'Pending',
        ])
    );
    const url = URL.createObjectURL(
        new Blob(
            ['\uFEFF' + records.map((r) => r.map(safe).join(',')).join('\r\n')],
            { type: 'text/csv;charset=utf-8' }
        )
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.mode || 'investment'}-statement.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
</script>
<template
    ><UCard
        ><div class="flex flex-wrap items-end gap-3 mb-4"
            ><UFormGroup v-if="!investorId" label="Investor"
                ><USelect v-model="person" :options="people" /></UFormGroup
            ><UFormGroup label="From"
                ><UInput v-model="from" type="date" /></UFormGroup
            ><UFormGroup label="To"
                ><UInput
                    v-model="to"
                    type="date"
                    :min="from || undefined" /></UFormGroup
            ><UButton variant="outline" @click="exportCsv"
                >Export statement</UButton
            ></div
        ><div v-if="person" class="text-sm text-gray-500 mb-4 space-y-1"
            ><p v-for="column in balanceColumns" :key="column.key"
                >{{ column.label }}: Opening {{ investmentMoney(opening[column.key], currency) }} ·
                Closing {{ investmentMoney(closing[column.key], currency) }}</p></div
        ><p v-else class="text-xs text-gray-500 mb-3"
            >Running balances are shown separately for each investor.</p
        ><UTable :rows="filtered" :columns="columns"
            ><template #investorName-data="{ row }"
                ><NuxtLink
                    :to="`/investments/investors/${row.investor_id}`"
                    class="text-primary-500"
                    >{{ row.investorName }}</NuxtLink
                ></template
            ><template #label-data="{ row }"
                ><p>{{ row.label }}</p
                ><UBadge v-if="!row.posted && !row.recorded" color="orange" variant="subtle"
                    >Pending</UBadge
                ><p v-if="row.details.periodFrom" class="text-xs text-gray-500"
                    >{{ row.details.periodFrom }} – {{ row.details.periodTo }} ·
                    {{ row.details.terms?.profitPercent }}%</p
                ><p v-if="row.details.pricePerShare" class="text-xs text-gray-500">{{ row.details.capitalPreview?.shareQuantity }} shares at {{ row.details.pricePerShare }} each</p><p class="text-xs text-gray-500">{{
                    row.details.note
                }}</p></template
            ><template
                v-for="key in ['amount', 'capital', 'profit', 'loan']"
                :key="key"
                #[`${key}-data`]="{ row }"
                >{{ investmentMoney(row[key], currency) }}</template
            ><template #reference-data="{ row }"
                ><NuxtLink
                    v-if="row.journal_id"
                    :to="`/accountant/manual-journals/${row.journal_id}/edit`"
                    class="text-primary-500"
                    >{{ row.entry_number }}</NuxtLink
                ><p class="text-xs">{{
                    row.details.reference || row.legacy_id
                }}</p></template
            ><template #actions-data="{ row }"
                ><span v-if="row.reversed" class="text-xs text-gray-500"
                    >Reversed</span
                ><UButton
                    v-else-if="(row.posted || row.recorded) && row.kind !== 'REVERSAL' && !row.details.loanId"
                    variant="ghost"
                    size="xs"
                    @click="
                        reverseError = ''; reversing = row;
                        reverseDate = investmentToday();
                        reason = '';
                    "
                    >Reverse</UButton
                ><NuxtLink v-else-if="row.details.loanId" :to="{path: `/loans/${row.details.loanId}`, query: {entryCompany: api.companyId.value}}" class="text-primary-500 text-xs">Open loan</NuxtLink
                ></template
            ></UTable
        >
        <UModal
            :model-value="!!reversing"
            :prevent-close="busy"
            @update:model-value="(v:boolean)=>{if(!v)reversing=null}"
            ><UCard
                ><template #header>Reverse movement</template
                ><form class="space-y-4" @submit.prevent="reverse"
                    ><UAlert v-if="reverseError" color="red" :title="reverseError" /><p class="text-sm"
                        >This posts an opposite entry and preserves the original
                        history.</p
                    ><UFormGroup label="Date"
                        ><UInput
                            v-model="reverseDate"
                            type="date"
                            :disabled="busy"
                            required /></UFormGroup
                    ><UFormGroup label="Reason"
                        ><UTextarea
                            v-model="reason"
                            :disabled="busy"
                            required /></UFormGroup
                    ><div class="flex justify-end gap-2"
                        ><UButton
                            variant="ghost"
                            :disabled="busy"
                            @click="reversing = null"
                            >Cancel</UButton
                        ><UButton type="submit" color="red" :loading="busy"
                            >Reverse entry</UButton
                        ></div
                    ></form
                ></UCard
            ></UModal
        >
    </UCard></template
>
