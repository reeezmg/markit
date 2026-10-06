<script setup lang="ts">
import { investmentToday, investmentMoney } from '~/utils/investments';
const props = defineProps<{
        mode: 'capital' | 'payouts';
        investorId?: string;
    }>(),
    emit = defineEmits(['close', 'saved']);
const api = useAccountantApi(),
    profiles = ref<any[]>([]),
    accounts = ref<any[]>([]),
    currency = ref('INR'),
    loading = ref(true),
    busy = ref(false),
    error = ref('');
const form = reactive({
    investorId: props.investorId || '',
    kind: props.mode === 'payouts' ? 'PROFIT_PAY' : 'CAPITAL_IN',
    date: investmentToday(),
    amount: '',
    counterAccountId: '',
    reference: '',
    note: '',
});
const kinds = [
    { value: 'CAPITAL_IN', label: 'Receive capital' },
    { value: 'CAPITAL_OUT', label: 'Return capital' },
    { value: 'LOAN_IN', label: 'Receive loan' },
    { value: 'LOAN_OUT', label: 'Repay loan' },
];
const selected = computed(() =>
    profiles.value.find((p) => p.id === form.investorId)
);
let requestId = '',
    submitted = '',
    loadVersion = 0;
async function loadProfiles() {
    const version = ++loadVersion;
    loading.value = true;
    try {
        const r = await api.get('/investors', { query: { asOf: form.date } });
        if (version === loadVersion) {
            profiles.value = r.data;
            currency.value = r.currency;
        }
    } catch (e: any) {
        error.value = e.message;
    } finally {
        if (version === loadVersion) loading.value = false;
    }
}
onMounted(async () => {
    try {
        accounts.value = (await api.get('/investors/options')).filter(
            (a: any) => ['CASH', 'BANK'].includes(a.accountType)
        );
        const settings = await api.get('/account-settings/defaults');
        const saved = settings.defaults.investments || {};
        const suggested = props.mode === 'payouts' ? saved.payoutAccountId : saved.counterAccountId;
        if (accounts.value.some(a => a.id === suggested)) form.counterAccountId = suggested;
        await loadProfiles();
    } catch (e: any) {
        error.value = e.message;
        loading.value = false;
    }
});
watch(() => form.date, loadProfiles);
async function save() {
    if (busy.value) return;
    busy.value = true;
    try {
        const { investorId, ...fields } = form;
        const body = { ...fields, amount: Number(form.amount) },
            key = JSON.stringify({ investorId, ...body });
        if (key !== submitted || !requestId) {
            requestId = crypto.randomUUID();
            submitted = key;
        }
        await api.post(`/investors/${investorId}/events`, {
            ...body,
            requestId,
        });
        emit('saved');
    } catch (e: any) {
        error.value = e.message;
    } finally {
        busy.value = false;
    }
}
</script>
<template
    ><UModal
        :model-value="true"
        :prevent-close="busy"
        @update:model-value="(v:boolean)=>{if(!v)emit('close')}"
        ><UCard
            ><template #header>{{
                mode === 'payouts'
                    ? 'Record profit payment'
                    : 'Record capital or loan'
            }}</template
            ><form class="space-y-4" @submit.prevent="save"
                ><UAlert v-if="error" color="red" :title="error" /><fieldset
                    :disabled="busy || loading"
                    class="space-y-4"
                    ><UFormGroup label="Investor" required
                        ><USelect
                            v-model="form.investorId"
                            :options="profiles.filter((p:any)=>p.profile.status==='ACTIVE').map((p:any)=>({label:p.name,value:p.id}))"
                            placeholder="Select investor"
                            required /></UFormGroup
                    ><UFormGroup v-if="mode === 'capital'" label="Movement"
                        ><USelect
                            v-model="form.kind"
                            :options="kinds" /></UFormGroup
                    ><UFormGroup label="Date"
                        ><UInput
                            v-model="form.date"
                            type="date"
                            required /></UFormGroup
                    ><p
                        v-if="mode === 'payouts' && selected"
                        class="rounded bg-primary-50 dark:bg-primary-950 p-3 text-sm"
                        >Profit awaiting payment on this date:
                        <strong>{{
                            investmentMoney(selected.payable, currency)
                        }}</strong></p
                    ><UFormGroup label="Cash / bank account" required
                        ><USelect
                            v-model="form.counterAccountId"
                            :options="accounts.map((a:any)=>({label:a.name,value:a.id}))"
                            placeholder="Select account"
                            required /></UFormGroup
                    ><UFormGroup :label="`Amount (${currency})`" required
                        ><UInput
                            v-model="form.amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            :max="
                                mode === 'payouts'
                                    ? selected?.payable
                                    : undefined
                            "
                            required /></UFormGroup
                    ><UFormGroup label="Reference"
                        ><UInput v-model="form.reference" /></UFormGroup
                    ><UFormGroup label="Note"
                        ><UInput v-model="form.note" /></UFormGroup></fieldset
                ><div class="flex justify-end gap-2"
                    ><UButton
                        variant="ghost"
                        :disabled="busy"
                        @click="emit('close')"
                        >Cancel</UButton
                    ><UButton
                        type="submit"
                        :loading="busy"
                        :disabled="loading || !form.investorId"
                        >Record
                        {{
                            mode === 'payouts' ? 'payment' : 'movement'
                        }}</UButton
                    ></div
                ></form
            ></UCard
        ></UModal
    ></template
>
