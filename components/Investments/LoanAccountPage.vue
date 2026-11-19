<script setup lang="ts">
import { investmentMoney, investmentToday } from '~/utils/investments';
const props = defineProps<{ loanId: string }>();
const api = useAccountantApi(), route = useRoute(), auth = useAuth();
const detail = ref<any>(null), loading = ref(true), busy = ref(false), error = ref(''), showForm = ref(false), payment = ref<'pay' | 'settle' | null>(null);
const reversing = ref(''), reason = ref(''); let reverseRequest = '';
const currency = computed(() => detail.value?.currency || 'INR');
const canManage = computed(() => ['admin', 'manager'].includes(auth.session.value?.role || ''));
const scheduleColumns = [{ key: 'date', label: 'Due date' }, { key: 'principal', label: 'Principal' }, { key: 'interest', label: 'Interest' }, { key: 'total', label: 'Instalment' }, { key: 'principalPaid', label: 'Principal paid' }, { key: 'interestPaid', label: 'Interest paid' }, { key: 'totalDue', label: 'Unpaid' }, { key: 'status', label: 'Status' }];
const eventColumns = [{ key: 'event_date', label: 'Date' }, { key: 'kind', label: 'Entry' }, { key: 'principal', label: 'Principal' }, { key: 'interest', label: 'Interest' }, { key: 'fees', label: 'Fees' }, { key: 'journal', label: 'Journal' }, { key: 'actions', label: '' }];
const analysis = computed(() => {
    const years = new Map<string, { year: string; principal: number; interest: number; total: number }>();
    for (const row of detail.value?.schedule || []) {
        const year = row.date.slice(0, 4), item = years.get(year) || { year, principal: 0, interest: 0, total: 0 };
        item.principal += Math.round(row.principal * 100); item.interest += Math.round(row.interest * 100); item.total = item.principal + item.interest; years.set(year, item);
    }
    return [...years.values()].map(y => ({ ...y, principal: y.principal / 100, interest: y.interest / 100, total: y.total / 100 }));
});
async function load() {
    loading.value = true; error.value = '';
    try { detail.value = await api.get(`/loans/${props.loanId}`); }
    catch (e: any) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(async () => { await load(); if (route.query.repay === '1' && detail.value?.status === 'OPEN') payment.value = 'pay'; });
async function saved() { showForm.value = false; payment.value = null; await load(); }
async function postDue() {
    if (busy.value) return;
    busy.value = true; error.value = '';
    try { await api.post(`/loans/${props.loanId}/post-due`, {}); await load(); }
    catch (e: any) { error.value = e.message; } finally { busy.value = false; }
}
function startReversal(id: string) { reversing.value = id; reason.value = ''; reverseRequest = crypto.randomUUID(); }
async function reversePayment() {
    if (busy.value) return;
    busy.value = true; error.value = '';
    try { await api.post(`/loans/${props.loanId}/reverse-payment`, { requestId: reverseRequest, eventId: reversing.value, date: investmentToday(), reason: reason.value }); reversing.value = ''; await load(); }
    catch (e: any) { error.value = e.message; } finally { busy.value = false; }
}
function isReversed(id: string) { return detail.value.events.some((e: any) => e.kind === 'PAYMENT_REVERSAL' && e.details.originalId === id); }
function downloadSchedule() {
    const rows = [['date', 'principal', 'interest'], ...detail.value.schedule.map((r: any) => [r.date, r.principal, r.interest])];
    const url = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'loan-schedule.csv'; a.click(); URL.revokeObjectURL(url);
}
</script>
<template><div class="space-y-5">
    <UButton :to="{path: '/loans', query: {...route.query, entryCompany: api.companyId.value, loan: undefined, repay: undefined}}" variant="ghost" icon="i-heroicons-arrow-left">Loans</UButton>
    <UAlert v-if="error" color="red" :title="error" /><p v-if="loading" class="text-sm text-gray-500">Loading loan...</p>
        <template v-if="detail">
            <UCard><div class="flex flex-wrap justify-between gap-3"><div><h1 class="text-xl font-semibold">{{ detail.name }}</h1><p class="text-sm text-gray-500">{{ detail.investor_name }} · {{ detail.status }} · {{ detail.terms.annualRate }}% annual rate · {{ detail.currency }}</p><p class="text-sm text-gray-500">Borrowed {{ investmentMoney(detail.terms.amount, currency) }} on {{ detail.terms.startDate }}</p></div><div class="flex flex-wrap gap-2 items-start">
                <UButton v-if="detail.status === 'DRAFT'" :disabled="busy" @click="showForm = true">Complete loan</UButton>
                <template v-if="detail.status === 'OPEN'"><UButton variant="outline" :loading="busy" @click="postDue">Post due entries</UButton><UButton :disabled="busy" @click="payment = 'pay'">Repay loan</UButton><UButton v-if="canManage" variant="outline" :disabled="busy" @click="payment = 'settle'">Early settlement</UButton></template>
            </div></div><p v-if="detail.terms.note" class="text-sm mt-3 whitespace-pre-wrap">{{ detail.terms.note }}</p></UCard>
            <div v-if="!['DRAFT', 'CANCELLED'].includes(detail.status)" class="grid gap-3 sm:grid-cols-3"><UCard v-for="[key, label] in [['principal', 'Outstanding principal'], ['interestDue', 'Interest due'], ['overdue', 'Overdue instalments']]" :key="key"><p class="text-sm text-gray-500">{{ label }}</p><p class="text-2xl font-semibold">{{ investmentMoney(detail.position[key], currency) }}</p></UCard></div>
            <UCard><div class="flex flex-wrap justify-between gap-3 mb-4"><h2 class="font-semibold">Repayment schedule</h2><UButton variant="outline" size="xs" @click="downloadSchedule">Export schedule CSV</UButton></div>
                <p class="text-xs text-gray-500 mb-3">Scheduled interest is recognized on each due date. Paid amounts reflect recorded bank payments. A late payment does not add extra interest automatically.</p>
                <UTable :rows="detail.position.rows" :columns="scheduleColumns"><template v-for="key in ['principal', 'interest', 'principalPaid', 'interestPaid', 'totalDue']" :key="key" #[`${key}-data`]="{ row }">{{ investmentMoney(row[key], currency) }}</template><template #total-data="{ row }">{{ investmentMoney((Math.round(row.principal * 100) + Math.round(row.interest * 100)) / 100, currency) }}</template><template #status-data="{ row }">{{ detail.status === 'DRAFT' ? 'PLANNED' : detail.status === 'CANCELLED' ? 'CANCELLED' : detail.status === 'CLOSED' && row.date > (detail.events.find((e: any) => e.kind === 'SETTLEMENT')?.event_date || '9999') ? 'SETTLED EARLY' : row.status }}</template></UTable>
            </UCard>
            <UCard><h2 class="font-semibold mb-3">Scheduled payments by year</h2><p class="text-xs text-gray-500 mb-3">Original contractual schedule, including future interest waived by an early settlement.</p><UTable :rows="analysis" :columns="[{key: 'year', label: 'Year'}, {key: 'principal', label: 'Principal'}, {key: 'interest', label: 'Interest'}, {key: 'total', label: 'Total'}]"><template v-for="key in ['principal', 'interest', 'total']" :key="key" #[`${key}-data`]="{ row }">{{ investmentMoney(row[key], currency) }}</template></UTable></UCard>
            <UCard><h2 class="font-semibold mb-3">Accounting and payment history</h2><UTable :rows="detail.events" :columns="eventColumns"><template v-for="key in ['principal', 'interest', 'fees']" :key="key" #[`${key}-data`]="{ row }">{{ investmentMoney(row[key], currency) }}</template><template #journal-data="{ row }"><NuxtLink class="text-primary-500" :to="`/accountant/manual-journals/${row.journal_id}/edit`">View journal</NuxtLink></template><template #actions-data="{ row }"><span v-if="isReversed(row.id)" class="text-xs">Reversed</span><UButton v-else-if="canManage && row.kind === 'PAYMENT'" variant="ghost" size="xs" :disabled="busy" @click="startReversal(row.id)">Reverse payment</UButton></template></UTable></UCard>
        </template>

    <InvestmentsLoanForm v-if="showForm" :loan="detail" @close="showForm = false" @saved="saved" />
    <InvestmentsLoanPaymentModal v-if="payment && detail" :loan="detail" :settle="payment === 'settle'" @close="payment = null" @saved="saved" />
    <UModal :model-value="!!reversing" :prevent-close="busy" @update:model-value="(v: boolean) => { if (!v) reversing = '' }"><UCard><template #header>Reverse loan payment</template><form class="space-y-4" @submit.prevent="reversePayment"><UAlert v-if="error" color="red" :title="error" /><UFormGroup label="Reason" required><UTextarea v-model="reason" required :disabled="busy" /></UFormGroup><div class="flex justify-end gap-2"><UButton variant="ghost" :disabled="busy" @click="reversing = ''">Cancel</UButton><UButton type="submit" color="red" :loading="busy">Reverse payment</UButton></div></form></UCard></UModal>
</div></template>
