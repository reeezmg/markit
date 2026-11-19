<script setup lang="ts">
import { investmentToday } from '~/utils/investments';
const props = defineProps<{ investor?: any }>(),
    emit = defineEmits(['close', 'saved']);
const api = useAccountantApi()
,
    busy = ref(false),
    users = ref<any[]>([]),
    accounts = ref<any[]>([]),
    capitalAccountId = ref(''),
    profitAccountId = ref(''),
    companyDefaults = ref<Record<string, string>>({}),
    mode = ref('existing'),
    userId = ref(props.investor?.legacy_user_id || ''),
    loadingUsers = ref(false),
    userError = ref('');
const needsUser = !props.investor?.legacy_user_id;
const auth = useAuth();
const canManage = computed(() => ['admin', 'manager'].includes(auth.session.value?.role || ''));
const includeShares = ref(false);
const ownership = reactive({effectiveDate:investmentToday(),ownershipPercent:props.investor?.terms?.ownershipPercent || 0,profitPercent:props.investor?.terms?.profitPercent || 0});
const requestId = crypto.randomUUID();
const accountFields = [
    { key: 'capital', label: 'Equity account', category: 'EQUITY', type: 'EQUITY', setting: 'capitalAccountId' },
    { key: 'profit', label: 'Profit payable account', category: 'LIABILITY', type: 'OTHER_CURRENT_LIABILITY', setting: 'profitAccountId' },
];
const selectedAccounts = reactive({ capital: '', profit: '' });
onMounted(async () => {
    loadingUsers.value = true;
    try {
        users.value = await api.get('/investors/users');
        {
            const settings = await api.post('/account-settings/investment-defaults', {});
            const [options, shares] = await Promise.all([api.get('/investors/options'), api.get('/investors/share-settings')]);
            includeShares.value = shares.includeShares;
            accounts.value = options;
            const saved = settings.defaults.investments || {};
            companyDefaults.value = saved;
            capitalAccountId.value = props.investor?.accounts?.capital || '';
            profitAccountId.value = props.investor?.accounts?.profit || '';
            Object.assign(selectedAccounts, { capital: capitalAccountId.value, profit: profitAccountId.value });
        }
    } catch (e: any) {
        userError.value = e.message;
    } finally {
        loadingUsers.value = false;
    }
});
const form = reactive({
    name: '',
    email: '',
    phone: '',
    status: 'ACTIVE',
    note: '',
    documents: [] as { name: string; url: string }[],
    ...JSON.parse(JSON.stringify(props.investor?.profile || {})),
    ...(props.investor ? { name: props.investor.name } : {}),
});
watch(userId, (id) => {
    const user = users.value.find((u) => u.id === id);
    if (user)
        Object.assign(form, {
            name: user.name || '',
            email: user.email || '',
            phone: user.phone || '',
        });
});
watch(mode, () => {
    userId.value = '';
    Object.assign(form, { name: '', email: '', phone: '' });
});
async function save() {
    if (busy.value || loadingUsers.value || !accounts.value.length) return;
    busy.value = true;
    userError.value = '';
    try {
        const payload = {
            ...form,
            ...(!includeShares.value && !props.investor?.terms?.shares ? ownership : {effectiveDate:ownership.effectiveDate}),
            ...{
                capitalAccountId: selectedAccounts.capital,
                profitAccountId: selectedAccounts.profit,
            },
            ...(needsUser
                ? mode.value === 'existing'
                    ? { userId: userId.value }
                    : {
                          newUser: {
                              name: form.name,
                              email: form.email,
                              phone: form.phone,
                          },
                      }
                : { userId: userId.value }),
        };
        if (props.investor)
            await api.put(`/investors/${props.investor.id}`, payload);
        else await api.post('/investors', { ...payload, requestId });
        emit('saved');
    } catch (e: any) {
        userError.value = e.message || 'Could not save investor';
    } finally {
        busy.value = false;
    }
}
</script>
<template>
    <UModal :model-value="true" fullscreen :prevent-close="busy" aria-labelledby="investor-profile-title" @update:model-value="(value: boolean) => { if (!value) emit('close') }">
        <UCard class="h-[100dvh] flex flex-col rounded-none" :ui="{ body: { base: 'flex-1 min-h-0 overflow-y-auto' }, header: { base: 'shrink-0' }, footer: { base: 'shrink-0' } }">
            <template #header><div class="flex items-center justify-between gap-3 max-w-6xl mx-auto"><div><h2 id="investor-profile-title" class="text-xl font-semibold">{{ investor ? 'Edit investor' : 'Add investor' }}</h2><p class="text-sm text-gray-500">{{ investor ? 'Update investor details, accounts and participation.' : 'Add investor details, accounts and participation.' }}</p></div><UButton variant="ghost" icon="i-heroicons-x-mark" aria-label="Close investor form" :disabled="busy" @click="emit('close')" /></div></template>
            <form id="investor-profile-form" class="max-w-6xl mx-auto space-y-6" @submit.prevent="save">
                <UAlert v-if="userError" color="red" :title="userError" />
                <p v-if="loadingUsers" class="text-sm text-gray-500">Loading users and account options...</p>
                <fieldset :disabled="busy || loadingUsers" class="space-y-6">
                    <div class="grid gap-6 lg:grid-cols-2">
                        <section class="space-y-4"><h3 class="font-semibold">Investor details</h3>
                            <template v-if="needsUser">
                                <UFormGroup label="Investor user"><USelect v-model="mode" :options="[{label: 'Select existing user', value: 'existing'}, {label: 'Create new user', value: 'new'}]" /></UFormGroup>
                                <UFormGroup v-if="mode === 'existing'" label="Company user" required><USelectMenu v-model="userId" :options="users.filter(u => !u.investor_id).map(u => ({ ...u, label: `${u.name || u.email} (${u.role})` }))" value-attribute="id" option-attribute="label" searchable placeholder="Select a user" :loading="loadingUsers" /><p class="text-xs text-gray-500 mt-1">Their existing role stays unchanged.</p></UFormGroup>
                                <p v-else class="text-xs text-gray-500">A new company user will be created with the investor role. They can set a password through Forgot password.</p>
                            </template>
                            <UFormGroup label="Name" required><UInput v-model="form.name" maxlength="150" required /></UFormGroup>
                            <div class="grid gap-3 sm:grid-cols-2"><UFormGroup label="Email" :required="needsUser && mode === 'new'"><UInput v-model="form.email" type="email" :required="needsUser && mode === 'new'" /></UFormGroup><UFormGroup label="Phone"><UInput v-model="form.phone" maxlength="50" /></UFormGroup></div>
                            <UFormGroup label="Status"><USelect v-model="form.status" :options="['ACTIVE', 'EXITED']" /></UFormGroup>
                            <UFormGroup label="Notes"><UTextarea v-model="form.note" maxlength="4000" /></UFormGroup>
                        </section>
                        <section class="space-y-4"><h3 class="font-semibold">Accounts</h3><p class="text-sm text-gray-500">Use company defaults or select existing accounts for this investor. Record capital received separately on the Capital page.</p>
                            <UFormGroup v-for="field in accountFields" :key="field.key" :label="field.label" :required="field.key === 'capital'">
                                <USelectMenu v-model="(selectedAccounts as any)[field.key]" :options="[{id: '', name: `Company default: ${accounts.find(a => a.id === companyDefaults[field.setting])?.name || 'not configured'}`}, ...accounts.filter(a => a.category === field.category && a.accountType === field.type)]" value-attribute="id" option-attribute="name" searchable placeholder="Use company default" />
                            </UFormGroup>
                            <p v-if="!selectedAccounts.profit && !companyDefaults.profitAccountId" class="text-xs text-orange-600">Select a profit payable account before allocating or paying profit.</p>
                        </section>
                    </div>
                    <section class="border-t pt-6 space-y-4">
                        <h3 class="font-semibold">{{ includeShares ? 'Shares' : 'Ownership & profit share' }}</h3>
                        <UFormGroup v-if="!investor || !includeShares" label="Effective date" required><UInput v-model="ownership.effectiveDate" type="date" required /></UFormGroup>
                        <p v-if="includeShares" class="text-sm text-gray-500">Save the investor, then use Buy shares or Redeem shares on their profile. Enter the price on each transaction.</p>
                        <p v-else-if="investor?.terms?.shares" class="text-sm text-gray-500">This investor still holds shares. Enable shares and redeem them before switching this investor to percentages.</p>
                        <div v-else class="grid gap-3 sm:grid-cols-2">
                            <UFormGroup label="Ownership %" required><UInput v-model.number="ownership.ownershipPercent" :disabled="!canManage" type="number" min="0" max="100" step="0.00000001" required /></UFormGroup>
                            <UFormGroup label="Profit share %" required><UInput v-model.number="ownership.profitPercent" :disabled="!canManage" type="number" min="0" max="100" step="0.00000001" required /></UFormGroup>
                        </div>
                        <p v-if="!includeShares" class="text-xs text-gray-500">Capital receipts and returns do not automatically change these percentages. Changes apply from the selected date and preserve posted profit allocations.</p>
                    </section>
                    <section class="border-t pt-6 space-y-3"><h3 class="font-semibold">Document links</h3>
                        <div v-for="(doc, index) in form.documents" :key="index" class="grid gap-3 sm:grid-cols-[1fr_2fr_auto] items-start"><UInput v-model="doc.name" placeholder="Document name" aria-label="Document name" required /><UInput v-model="doc.url" type="url" placeholder="https://..." aria-label="Document URL" required /><UButton type="button" variant="ghost" color="red" @click="form.documents.splice(index, 1)">Remove</UButton></div>
                        <UButton type="button" variant="outline" :disabled="form.documents.length >= 30" @click="form.documents.push({name: '', url: ''})">Add document link</UButton>
                    </section>
                </fieldset>
            </form>
            <template #footer><div class="flex items-center justify-end gap-3 max-w-6xl mx-auto"><UButton variant="ghost" :disabled="busy" @click="emit('close')">Cancel</UButton><UButton form="investor-profile-form" type="submit" :loading="busy" :disabled="loadingUsers || !accounts.length || (needsUser && mode === 'existing' && !userId) || (!selectedAccounts.capital && !companyDefaults.capitalAccountId)">Save investor</UButton></div></template>
        </UCard>
    </UModal>
</template>
