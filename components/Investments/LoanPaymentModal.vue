<script setup lang="ts">
import { investmentToday, investmentMoney } from '~/utils/investments';
const props = defineProps<{ loan: any; settle?: boolean }>(), emit = defineEmits(['close', 'saved']);
const api = useAccountantApi(), accounts = ref<any[]>([]), busy = ref(false), error = ref('');
const form = reactive({ date: investmentToday(), bankAccountId: props.loan.accounts.bank, extraInterest: 0, fees: 0, note: '' });
const allocations = ref(props.loan.position.rows.filter((r: any) => r.date <= form.date && r.totalDue > 0).map((r: any) => ({ number: r.number, date: r.date, principal: r.principalDue, interest: r.interestDue })));
const total = computed(() => {
    const amount = props.settle ? Number(props.loan.position.principal) + Number(props.loan.position.interestDue) + Number(form.extraInterest)
        : allocations.value.reduce((s: number, r: any) => s + Number(r.principal) + Number(r.interest), 0);
    return Math.round((amount + Number(form.fees)) * 100) / 100;
});
let requestId = '', submitted = '';
onMounted(async () => {
    try { accounts.value = (await api.get('/loans/options')).accounts.filter((a: any) => ['CASH', 'BANK'].includes(a.accountType) && a.currency === props.loan.currency); }
    catch (e: any) { error.value = e.message; }
});
async function save() {
    if (busy.value) return;
    busy.value = true; error.value = '';
    try {
        const body: any = { ...form, ...(props.settle ? {} : { allocations: allocations.value.map(({ number, principal, interest }: any) => ({ number, principal: Number(principal), interest: Number(interest) })) }) };
        const key = JSON.stringify(body); if (key !== submitted || !requestId) { submitted = key; requestId = crypto.randomUUID(); }
        await api.post(`/loans/${props.loan.id}/${props.settle ? 'settle' : 'pay'}`, { ...body, requestId }); emit('saved');
    } catch (e: any) { error.value = e.message; } finally { busy.value = false; }
}
</script>
<template>
    <UModal :model-value="true" :prevent-close="busy" :ui="{ width: 'sm:max-w-3xl' }" @update:model-value="(v: boolean) => { if (!v) emit('close') }"><UCard>
        <template #header>{{ settle ? 'Settle and close loan' : 'Record loan repayment' }} · {{ loan.name }}</template>
        <form class="space-y-4" @submit.prevent="save">
            <UAlert v-if="error" color="red" :title="error" />
            <fieldset :disabled="busy" class="space-y-4">
                <UFormGroup label="Payment date"><UInput v-model="form.date" type="date" :max="investmentToday()" :min="String(loan.events.at(-1)?.event_date || loan.terms.startDate).slice(0, 10)" required /></UFormGroup>
                <p class="text-xs text-gray-500">Payment dates must follow the latest loan entry. Outstanding amounts below are as of today; the server validates them on the selected date.</p>
                <UFormGroup label="Pay from cash / bank" required><USelect v-model="form.bankAccountId" :options="accounts.map((a: any) => ({value: a.id, label: a.name}))" required /></UFormGroup>
                <template v-if="settle">
                    <p class="text-sm">Outstanding principal: <strong>{{ investmentMoney(loan.position.principal, loan.currency) }}</strong> · Scheduled interest due: <strong>{{ investmentMoney(loan.position.interestDue, loan.currency) }}</strong></p>
                    <UFormGroup label="Additional settlement interest"><UInput v-model.number="form.extraInterest" type="number" min="0" step="0.01" /></UFormGroup>
                    <p class="text-sm text-gray-500">Enter any further interest in the lender's payoff quote. Future unposted scheduled interest is waived; future instalments stop after settlement.</p>
                </template>
                <div v-else class="overflow-x-auto"><table class="w-full text-sm text-left"><thead><tr><th class="p-2">Due date</th><th class="p-2">Principal payment</th><th class="p-2">Interest payment</th></tr></thead><tbody>
                    <tr v-for="row in allocations" :key="row.number"><td class="p-2">{{ row.date }}</td><td class="p-2"><UInput v-model.number="row.principal" type="number" min="0" step="0.01" :max="loan.position.rows.find((r: any) => r.number === row.number)?.principalDue" /></td><td class="p-2"><UInput v-model.number="row.interest" type="number" min="0" step="0.01" :max="loan.position.rows.find((r: any) => r.number === row.number)?.interestDue" /></td></tr>
                </tbody></table><p v-if="!allocations.length" class="text-sm">No instalments are due. Use early settlement to pay off the loan.</p></div>
                <UFormGroup label="Fees paid"><UInput v-model.number="form.fees" type="number" min="0" step="0.01" /></UFormGroup>
                <UFormGroup :label="settle ? 'Settlement reason / lender reference' : 'Reference / note'" :required="settle"><UTextarea v-model="form.note" :required="settle" maxlength="2000" /></UFormGroup>
                <p class="font-semibold">Total bank payment: {{ investmentMoney(total, loan.currency) }}</p>
            </fieldset>
            <div class="flex justify-end gap-2"><UButton variant="ghost" :disabled="busy" @click="emit('close')">Cancel</UButton><UButton type="submit" :loading="busy" :disabled="total <= 0">{{ settle ? 'Pay and close loan' : 'Record repayment' }}</UButton></div>
        </form>
    </UCard></UModal>
</template>
