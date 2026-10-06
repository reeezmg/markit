<script setup lang="ts">
const props = defineProps<{ investor?: any }>(),
    emit = defineEmits(['close', 'saved']);
const api = useAccountantApi(),
    busy = ref(false),
    users = ref<any[]>([]),
    accounts = ref<any[]>([]),
    capitalAccountId = ref(''),
    profitAccountId = ref(''),
    loanAccountId = ref(''),
    companyDefaults = ref<Record<string, string>>({}),
    mode = ref('existing'),
    userId = ref(props.investor?.legacy_user_id || ''),
    loadingUsers = ref(false),
    userError = ref('');
const needsUser = !props.investor?.legacy_user_id;
onMounted(async () => {
    loadingUsers.value = true;
    try {
        users.value = await api.get('/investors/users');
        {
            const [options, settings] = await Promise.all([api.get('/investors/options'), api.get('/account-settings/defaults')]);
            accounts.value = options;
            const saved = settings.defaults.investments || {};
            companyDefaults.value = saved;
            capitalAccountId.value = props.investor?.accounts?.capital || '';
            profitAccountId.value = props.investor?.accounts?.profit || '';
            loanAccountId.value = props.investor?.accounts?.loan || '';
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
    try {
        const payload = {
            ...form,
            ...{
                capitalAccountId: capitalAccountId.value,
                profitAccountId: profitAccountId.value,
                loanAccountId: loanAccountId.value,
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
        else await api.post('/investors', payload);
        emit('saved');
    } catch (e: any) {
        userError.value = e.message || 'Could not save investor';
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
                investor ? 'Edit investor' : 'Add investor'
            }}</template
            ><form class="space-y-4" @submit.prevent="save"
                ><fieldset :disabled="busy || loadingUsers" class="space-y-4"
                    ><UAlert v-if="userError" color="red" :title="userError" />
                    <div v-if="needsUser" class="space-y-3">
                        <UFormGroup label="Investor user">
                            <USelect
                                v-model="mode"
                                :options="[
                                    {
                                        label: 'Select existing user',
                                        value: 'existing',
                                    },
                                    { label: 'Create new user', value: 'new' },
                                ]"
                            />
                        </UFormGroup>
                        <UFormGroup
                            v-if="mode === 'existing'"
                            label="Company user"
                            required
                        >
                            <USelectMenu
                                v-model="userId"
                                :options="
                                    users
                                        .filter((u) => !u.investor_id)
                                        .map((u) => ({
                                            ...u,
                                            label: `${u.name || u.email} (${
                                                u.role
                                            })`,
                                        }))
                                "
                                value-attribute="id"
                                option-attribute="label"
                                searchable
                                placeholder="Select a user"
                                :loading="loadingUsers"
                            />
                            <p class="text-xs text-gray-500 mt-1"
                                >Their existing role stays unchanged.</p
                            >
                        </UFormGroup>
                        <p v-else class="text-xs text-gray-500"
                            >A new company user will be created with the
                            investor role. They can set a password through
                            Forgot password.</p
                        >
                    </div>
                    <div class="space-y-3">
                        <p class="text-xs text-gray-500">Company investment defaults are shared across investors. Choose another account to override a default for this investor. Posted journal rows remain linked to their investor.</p>
                        <UFormGroup label="Equity account" required>
                            <USelectMenu v-model="capitalAccountId" :options="[{ id: '', name: `Company default: ${accounts.find(a => a.id === companyDefaults.capitalAccountId)?.name || 'not configured'}` }, ...accounts.filter(a => a.category === 'EQUITY' && a.accountType === 'EQUITY')]" value-attribute="id" option-attribute="name" searchable placeholder="Use company default" />
                            <p class="text-xs text-gray-500 mt-1">Investments credit this account. Money received goes to the Cash or Bank account selected when recording the investment.</p>
                        </UFormGroup>
                        <UFormGroup label="Profit payable account (optional)">
                            <USelectMenu v-model="profitAccountId" :options="[{ id: '', name: `Company default: ${accounts.find(a => a.id === companyDefaults.profitAccountId)?.name || 'not configured'}` }, ...accounts.filter(a => a.category === 'LIABILITY' && a.accountType === 'OTHER_CURRENT_LIABILITY')]" value-attribute="id" option-attribute="name" searchable placeholder="Use company default" />
                        </UFormGroup>
                        <UFormGroup label="Investor loan account (optional)">
                            <USelectMenu v-model="loanAccountId" :options="[{ id: '', name: `Company default: ${accounts.find(a => a.id === companyDefaults.loanAccountId)?.name || 'not configured'}` }, ...accounts.filter(a => a.category === 'LIABILITY' && a.accountType === 'OTHER_LIABILITY')]" value-attribute="id" option-attribute="name" searchable placeholder="Use company default" />
                        </UFormGroup>
                    </div>
                    <UFormGroup label="Name" required
                        ><UInput
                            v-model="form.name"
                            maxlength="150"
                            required /></UFormGroup
                    ><div class="grid grid-cols-2 gap-3"
                        ><UFormGroup
                            label="Email"
                            :required="needsUser && mode === 'new'"
                            ><UInput
                                v-model="form.email"
                                type="email"
                                :required="
                                    needsUser && mode === 'new'
                                " /></UFormGroup
                        ><UFormGroup label="Phone"
                            ><UInput v-model="form.phone" /></UFormGroup></div
                    ><UFormGroup label="Status"
                        ><USelect
                            v-model="form.status"
                            :options="['ACTIVE', 'EXITED']" /></UFormGroup
                    ><UFormGroup label="Notes"
                        ><UTextarea v-model="form.note" /></UFormGroup
                    ><div
                        ><p class="text-sm mb-2">Agreement & document links</p
                        ><div
                            v-for="(doc, i) in form.documents"
                            :key="i"
                            class="space-y-2 border-b pb-3 mb-3"
                            ><UInput
                                v-model="doc.name"
                                placeholder="Document name"
                                required
                            /><UInput
                                v-model="doc.url"
                                type="url"
                                placeholder="https://…"
                                required
                            /><UButton
                                variant="ghost"
                                color="red"
                                @click="form.documents.splice(i, 1)"
                                >Remove</UButton
                            ></div
                        ><UButton
                            variant="outline"
                            :disabled="form.documents.length >= 30"
                            @click="form.documents.push({ name: '', url: '' })"
                            >Add document link</UButton
                        ></div
                    ></fieldset
                ><div class="flex justify-end gap-2"
                    ><UButton
                        variant="ghost"
                        :disabled="busy"
                        @click="emit('close')"
                        >Cancel</UButton
                    ><UButton
                        type="submit"
                        :loading="busy"
                        :disabled="loadingUsers || !accounts.length || (needsUser && mode === 'existing' && !userId) || (!capitalAccountId && !companyDefaults.capitalAccountId)"
                        >Save investor</UButton
                    ></div
                ></form
            ></UCard
        ></UModal
    ></template
>
