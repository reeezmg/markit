<script setup lang="ts">
import { computeLoanSchedule, validateLoanSchedule, importLoanSchedule, loanMonth, type LoanScheduleRow, type LoanTerms } from '~/utils/loan-schedule';
import { investmentToday, investmentMoney } from '~/utils/investments';
const props = defineProps<{ loan?: any; investorId?: string }>();
const emit = defineEmits(['close', 'saved']);
const api = useAccountantApi(), options = ref<any>({ investors: [], accounts: [], currency: 'INR' }), busy = ref(false), loading = ref(true), error = ref('');
const form = reactive({
    requestId: crypto.randomUUID(), name: '', investorId: props.investorId || '', note: '',
    terms: { amount: 0, annualRate: 0, periods: 12, frequencyMonths: 1, startDate: investmentToday(), firstDueDate: loanMonth(investmentToday(), 1), method: 'ANNUITY' } as LoanTerms,
    accounts: { bank: '', longTerm: '', shortTerm: '', interestExpense: '', feesExpense: '' },
});
const schedule = ref<LoanScheduleRow[]>([]), computedFor = ref('');
const methods = [{ value: 'ANNUITY', label: 'Equal instalments (reducing balance)' }, { value: 'EQUAL_PRINCIPAL', label: 'Equal principal' }, { value: 'INTEREST_ONLY', label: 'Interest only; principal at the end' }, { value: 'MANUAL', label: 'Manual / lender schedule' }];
const frequencies = [{ value: 1, label: 'Monthly' }, { value: 3, label: 'Quarterly' }, { value: 12, label: 'Yearly' }];
const accountFields = [
    { key: 'longTerm', label: 'Long-term loan liability', category: 'LIABILITY', types: ['OTHER_LIABILITY'] },
    { key: 'bank', label: 'Receiving cash / bank', category: 'ASSET', types: ['CASH', 'BANK'] },
    { key: 'shortTerm', label: 'Current loan liability', category: 'LIABILITY', types: ['OTHER_CURRENT_LIABILITY'] },
    { key: 'interestExpense', label: 'Interest expense', category: 'EXPENSE' },
    { key: 'feesExpense', label: 'Loan fees expense', category: 'EXPENSE' },
];
function accountsFor(field: any) {
    return options.value.accounts.filter((a: any) => a.currency === options.value.currency && a.category === field.category && (!field.types || field.types.includes(a.accountType)))
        .map((a: any) => ({ value: a.id, label: `${a.code || ''} ${a.name}`.trim() }));
}
onMounted(async () => {
    try {
        const settings = await api.post('/account-settings/investment-defaults', {});
        options.value = await api.get('/loans/options');
        options.value.defaults = settings.defaults.loans;
        if (props.loan) {
            form.name = props.loan.name; form.investorId = props.loan.investor_id; form.note = props.loan.terms.note || '';
            Object.assign(form.terms, props.loan.terms); Object.assign(form.accounts, props.loan.accounts);
            schedule.value = props.loan.schedule.map((row: LoanScheduleRow) => ({ ...row })); computedFor.value = JSON.stringify(form.terms);
        } else {
            Object.assign(form.accounts, options.value.defaults);
        }
    } catch (e: any) { error.value = e.message; } finally { loading.value = false; }
});
function compute() {
    error.value = '';
    try {
        schedule.value = form.terms.method === 'MANUAL' ? validateLoanSchedule(form.terms, schedule.value) : computeLoanSchedule(form.terms);
        computedFor.value = JSON.stringify(form.terms);
    } catch (e: any) { error.value = e.message; }
}
async function importCsv(event: Event) {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    error.value = '';
    try {
        const rows = importLoanSchedule(await file.text());
        form.terms.method = 'MANUAL'; form.terms.periods = rows.length;
        form.terms.firstDueDate = rows[0]?.date || '';
        schedule.value = validateLoanSchedule(form.terms, rows); computedFor.value = JSON.stringify(form.terms);
    } catch (e: any) { error.value = e.message; } finally { input.value = ''; }
}
function addRow() {
    schedule.value.push({ number: schedule.value.length + 1, date: schedule.value.length ? loanMonth(schedule.value.at(-1)!.date, form.terms.frequencyMonths) : form.terms.firstDueDate, principal: 0, interest: 0 });
}
const totals = computed(() => schedule.value.reduce((s, r) => ({ principal: s.principal + Math.round(r.principal * 100), interest: s.interest + Math.round(r.interest * 100) }), { principal: 0, interest: 0 }));
async function save() {
    if (busy.value) return;
    error.value = '';
    try {
        if (form.terms.method !== 'MANUAL') schedule.value = computeLoanSchedule(form.terms);
        const rows = validateLoanSchedule(form.terms, schedule.value);
        busy.value = true;
        const body = { ...form, schedule: rows };
        const result = props.loan ? await api.put(`/loans/${props.loan.id}`, body) : await api.post('/loans', body);
        emit('saved', result.id);
    } catch (e: any) { error.value = e.message; } finally { busy.value = false; }
}
</script>
<template>
    <UModal :model-value="true" :prevent-close="busy" :ui="{ width: 'sm:max-w-5xl' }" @update:model-value="(v: boolean) => { if (!v) emit('close') }">
        <UCard>
            <template #header><h2 class="font-semibold">{{ loan ? 'Complete loan' : 'New loan agreement' }}</h2></template>
            <form class="space-y-5" @submit.prevent="save">
                <UAlert v-if="error" color="red" :title="error" />
                <fieldset :disabled="busy || loading" class="space-y-5">
                    <div class="grid gap-4 sm:grid-cols-2">
                        <UFormGroup label="Loan name / reference" required><UInput v-model="form.name" required maxlength="150" /></UFormGroup>
                        <UFormGroup label="Investor / lender" required><USelect v-model="form.investorId" :options="options.investors.map((p: any) => ({value: p.id, label: p.name}))" placeholder="Select investor" required /></UFormGroup>
                        <UFormGroup :label="`Amount borrowed (${options.currency})`" required><UInput v-model.number="form.terms.amount" type="number" min="0.01" max="10000000000" step="0.01" required /></UFormGroup>
                        <UFormGroup label="Annual interest rate (%)" required><UInput v-model.number="form.terms.annualRate" type="number" min="0" max="100" step="0.0001" required /><p class="text-xs text-gray-500 mt-1">Use 0 for an interest-free loan.</p></UFormGroup>
                        <UFormGroup label="Borrowing / receipt date" required><UInput v-model="form.terms.startDate" type="date" :max="investmentToday()" required /></UFormGroup>
                        <UFormGroup label="First instalment date" required><UInput v-model="form.terms.firstDueDate" type="date" required /></UFormGroup>
                        <UFormGroup label="Repayment method"><USelect v-model="form.terms.method" :options="methods" /></UFormGroup>
                        <UFormGroup label="Frequency"><USelect v-model.number="form.terms.frequencyMonths" :options="frequencies" /></UFormGroup>
                        <UFormGroup label="Number of instalments"><UInput v-model.number="form.terms.periods" type="number" min="1" max="600" required /></UFormGroup>
                    </div>
                    <p class="text-sm text-gray-500">Calculated schedules use a fixed nominal annual rate divided into regular periods. For irregular dates, daily interest or lender-specific rounding, import the lender's schedule.</p>
                    <div class="grid gap-4 sm:grid-cols-2">
                        <UFormGroup v-for="field in accountFields" :key="field.key" :label="field.label" required><USelect v-model="(form.accounts as any)[field.key]" :options="accountsFor(field)" placeholder="Select account" required /></UFormGroup>
                    </div>
                    <UFormGroup label="Agreement notes"><UTextarea v-model="form.note" maxlength="2000" /></UFormGroup>
                    <div class="flex flex-wrap items-center gap-3">
                        <UButton type="button" variant="outline" @click="compute">{{ form.terms.method === 'MANUAL' ? 'Review schedule' : 'Preview schedule' }}</UButton>
                        <label class="text-sm underline cursor-pointer">Import CSV<input type="file" accept=".csv,text/csv" class="sr-only" @change="importCsv" /></label>
                        <UButton v-if="form.terms.method === 'MANUAL'" type="button" variant="ghost" @click="addRow">Add instalment</UButton>
                    </div>
                    <p class="text-xs text-gray-500">CSV columns: date,principal,interest. Dates: YYYY-MM-DD; amounts without currency symbols or thousands separators.</p>
                    <div v-if="schedule.length" class="max-h-80 overflow-auto">
                        <table class="w-full text-sm text-left"><thead><tr><th class="p-2">Date</th><th class="p-2">Principal</th><th class="p-2">Interest</th><th class="p-2">Total</th><th /></tr></thead>
                            <tbody><tr v-for="(row, index) in schedule" :key="index">
                                <td class="p-2"><UInput v-if="form.terms.method === 'MANUAL'" v-model="row.date" type="date" /><span v-else>{{ row.date }}</span></td>
                                <td class="p-2"><UInput v-if="form.terms.method === 'MANUAL'" v-model.number="row.principal" type="number" min="0" step="0.01" /><span v-else>{{ investmentMoney(row.principal, options.currency) }}</span></td>
                                <td class="p-2"><UInput v-if="form.terms.method === 'MANUAL'" v-model.number="row.interest" type="number" min="0" step="0.01" /><span v-else>{{ investmentMoney(row.interest, options.currency) }}</span></td>
                                <td class="p-2">{{ investmentMoney((Math.round(row.principal * 100) + Math.round(row.interest * 100)) / 100, options.currency) }}</td>
                                <td><UButton v-if="form.terms.method === 'MANUAL'" type="button" variant="ghost" color="red" @click="schedule.splice(index, 1)">Remove</UButton></td>
                            </tr></tbody>
                        </table>
                    </div>
                    <p v-if="schedule.length" class="text-sm font-medium">Principal {{ investmentMoney(totals.principal / 100, options.currency) }} · Interest {{ investmentMoney(totals.interest / 100, options.currency) }} · Total {{ investmentMoney((totals.principal + totals.interest) / 100, options.currency) }}</p>
                    <p class="text-sm text-gray-500">Saving records the loan and the money received in the selected account.</p>
                </fieldset>
                <div class="flex justify-end gap-2"><UButton variant="ghost" :disabled="busy" @click="emit('close')">Cancel</UButton><UButton type="submit" :loading="busy" :disabled="loading || !form.accounts.longTerm || (form.terms.method === 'MANUAL' && !schedule.length)">Save loan</UButton></div>
            </form>
        </UCard>
    </UModal>
</template>
