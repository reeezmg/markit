<script setup lang="ts">
import { investmentMoney, investmentToday } from '~/utils/investments';
const api = useAccountantApi(),
    route = useRoute(),
    asOf = ref(investmentToday()),
    rows = ref<any[]>([]),
    loading = ref(false),
    busy = ref(false),
    error = ref(''),
    selected = ref<any>(null),
    history = ref<any[]>([]),
    showForm = ref(false),
    companyShares = ref(0),
    editing = ref<any>(null),
    formError = ref(''),
    deleting = ref<any>(null),
    showDelete = ref(false),
    deleteError = ref(''),
    search = ref(''),
    currency = ref('INR'),
    profile = ref<any>(null),
    showProfile = ref(false);
const filtered = computed(() =>
    rows.value.filter((p) =>
        [p.name, p.profile.email, p.profile.phone].some((v) =>
            String(v || '')
                .toLowerCase()
                .includes(search.value.toLowerCase())
        )
    )
);
async function profileSaved() {
    showProfile.value = false;
    await load();
    if (selected.value) {
        const current = rows.value.find((p) => p.id === selected.value.id);
        if (current) await inspect(current);
    }
}
const columns = [
    { key: 'name', label: 'Investor' },
    { key: 'ownership', label: 'Company ownership' },
    { key: 'shares', label: 'Shares held' },
    { key: 'profit', label: 'Profit share' },
    { key: 'capital', label: 'Net capital' },
    { key: 'payable', label: 'Profit due' },
    { key: 'actions', label: '' },
];
const form = reactive({
    date: investmentToday(),
    ownershipPercent: 0,
    profitPercent: 0,
    shares: 0,
    totalShares: 0,
    shareClass: 'Ordinary',
    note: '',
});
const totals = computed(() =>
    rows.value.reduce(
        (s, p) => ({
            ownership: s.ownership + Number(p.terms?.ownershipPercent || 0),
            profit: s.profit + Number(p.terms?.profitPercent || 0),
        }),
        { ownership: 0, profit: 0 }
    )
);
async function load() {
    loading.value = true;
    error.value = '';
    try {
        companyShares.value = (
            await api.get('/investors/share-settings')
        ).totalShares;
        const data = await api.get('/investors', {
            query: { asOf: asOf.value },
        });
        rows.value = data.data;
        currency.value = data.currency;
    } catch (e: any) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
}
async function inspect(p: any) {
    try {
        const r = await api.get(`/investors/${p.id}`);
        selected.value = p;
        const allocatedThrough = r.events
            .filter((e: any) => e.kind === 'PROFIT_ALLOCATE')
            .map((e: any) => e.details.periodTo)
            .sort()
            .at(-1);
        history.value = r.terms.map((t: any) => ({
            ...t,
            locked:
                !!allocatedThrough &&
                String(t.effective_date).slice(0, 10) <= allocatedThrough,
        }));
        await nextTick();
        document
            .getElementById('investor-agreements')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e: any) {
        error.value = e.message;
    }
}
onMounted(async () => {
    await load();
    const p = rows.value.find((p) => p.id === route.query.investor);
    if (p) await inspect(p);
});
async function add(p: any) {
    editing.value = null;
    formError.value = '';
    try {
        companyShares.value = (
            await api.get('/investors/share-settings')
        ).totalShares;
    } catch {
        return;
    }
    await inspect(p);
    if (selected.value?.id !== p.id) return;
    Object.assign(
        form,
        {
            date: investmentToday(),
            ownershipPercent: 0,
            profitPercent: 0,
            shares: 0,
            totalShares: 0,
            shareClass: 'Ordinary',
            note: '',
        },
        p.terms || {},
        { date: investmentToday(), note: '', totalShares: companyShares.value }
    );
    showForm.value = true;
}
function edit(term: any) {
    editing.value = term;
    formError.value = '';
    Object.assign(form, term.terms, {
        date: String(term.effective_date).slice(0, 10),
    });
    showForm.value = true;
}
function confirmDelete(term: any) {
    deleting.value = {
        ...term,
        investorId: selected.value.id,
        investorName: selected.value.name,
    };
    deleteError.value = '';
    showDelete.value = true;
}
async function removeAgreement() {
    busy.value = true;
    deleteError.value = '';
    try {
        await api.delete(
            `/investors/${deleting.value.investorId}/terms/${deleting.value.id}`
        );
        showDelete.value = false;
        await load();
        const investor = rows.value.find(
            (p) => p.id === deleting.value.investorId
        );
        if (investor) await inspect(investor);
    } catch (e: any) {
        deleteError.value = e.message;
    } finally {
        busy.value = false;
    }
}
const agreementTotal = computed(
    () => editing.value?.terms.totalShares || companyShares.value
);
const ownershipFromShares = computed(
    () => agreementTotal.value > 0 && Number(form.shares) > 0
);
watch([() => form.shares, agreementTotal, showForm], () => {
    if (showForm.value && ownershipFromShares.value)
        form.ownershipPercent =
            Math.round((Number(form.shares) / agreementTotal.value) * 1000000) /
            10000;
});
async function save() {
    busy.value = true;
    formError.value = '';
    try {
        const path = `/investors/${selected.value.id}/terms`;
        const payload = {
            ...form,
            totalShares: ownershipFromShares.value ? agreementTotal.value : 0,
        };
        if (editing.value)
            await api.put(`${path}/${editing.value.id}`, payload);
        else await api.post(path, payload);
        showForm.value = false;
        await load();
        await inspect(rows.value.find((p) => p.id === selected.value.id));
    } catch (e: any) {
        formError.value = e.message;
    } finally {
        busy.value = false;
    }
}
</script>
<template
    ><div class="space-y-5"
        ><div class="flex flex-wrap justify-between items-end gap-3"
            ><div
                ><h1 class="text-xl font-semibold">Investors & ownership</h1
                ><p class="text-sm text-gray-500"
                    >Manage profiles, ownership, profit shares and investor
                    accounts in one place.</p
                ></div
            ><UButton
                icon="i-heroicons-plus"
                @click="
                    profile = null;
                    showProfile = true;
                "
                >Add investor</UButton
            >
            <UFormGroup label="Balances & ownership as of"
                ><UInput
                    v-model="asOf"
                    type="date"
                    @change="load" /></UFormGroup></div
        ><UAlert v-if="error" color="red" :title="error" /><div
            class="grid sm:grid-cols-2 gap-4"
            ><UCard
                ><p class="text-sm text-gray-500">Recorded ownership</p
                ><p class="text-2xl font-semibold"
                    >{{ totals.ownership }}%</p
                ></UCard
            ><UCard
                ><p class="text-sm text-gray-500">Recorded profit shares</p
                ><p class="text-2xl font-semibold"
                    >{{ totals.profit }}%</p
                ></UCard
            ></div
        ><UCard
            ><UInput
                v-model="search"
                placeholder="Search name, email or phone"
                icon="i-heroicons-magnifying-glass"
                class="mb-4 max-w-sm"
            />
            <UTable :rows="filtered" :columns="columns" :loading="loading"
                ><template #name-data="{ row }">
                    <NuxtLink
                        :to="`/investments/investors/${row.id}`"
                        class="font-medium text-primary-500"
                        >{{ row.name }}</NuxtLink
                    >
                    <p class="text-xs text-gray-500"
                        >{{ row.profile.status
                        }}<span v-if="row.profile.email">
                            | {{ row.profile.email }}</span
                        ></p
                    >
                </template>
                <template #capital-data="{ row }">{{
                    investmentMoney(row.capital, currency)
                }}</template>
                <template #payable-data="{ row }">{{
                    investmentMoney(row.payable, currency)
                }}</template>
                <template #ownership-data="{ row }">{{
                    row.terms
                        ? `${row.terms.ownershipPercent}%`
                        : 'Not recorded'
                }}</template
                ><template #shares-data="{ row }">{{
                    row.terms?.totalShares
                        ? `${row.terms.shares} / ${row.terms.totalShares}`
                        : '—'
                }}</template
                ><template #profit-data="{ row }">{{
                    row.terms ? `${row.terms.profitPercent}%` : 'Not recorded'
                }}</template
                ><template #actions-data="{ row }"
                    ><div class="flex gap-2"
                        ><UButton variant="outline" @click="inspect(row)"
                            >Agreements</UButton
                        >
                        <UButton
                            variant="ghost"
                            :to="`/investments/investors/${row.id}`"
                            >Account</UButton
                        >
                        <UButton
                            variant="ghost"
                            @click="
                                profile = row;
                                showProfile = true;
                            "
                            >Edit profile</UButton
                        ></div
                    ></template
                ></UTable
            ></UCard
        ><UCard v-if="selected" id="investor-agreements" class="scroll-mt-4"
            ><template #header>
                <div class="flex flex-wrap justify-between items-center gap-3">
                    <h2 class="font-semibold"
                        >{{ selected.name }} - Ownership & agreements</h2
                    >
                    <div class="flex gap-2">
                        <UButton @click="add(selected)">Add agreement</UButton>
                        <UButton variant="ghost" @click="selected = null"
                            >Close</UButton
                        >
                    </div>
                </div>
            </template>
            <p v-if="!history.length" class="text-sm text-gray-500"
                >No agreements recorded. Add an agreement to set ownership and
                profit share.</p
            >
            <div
                v-for="term in history"
                :key="term.id"
                class="py-3 border-b last:border-0"
            >
                <p class="font-medium"
                    >{{ String(term.effective_date).slice(0, 10) }} -
                    {{ term.terms.ownershipPercent }}% ownership -
                    {{ term.terms.profitPercent }}% profit share</p
                >
                <p class="text-sm"
                    >{{ term.terms.shares }} /
                    {{ term.terms.totalShares }} shares -
                    {{ term.terms.shareClass }}</p
                >
                <p class="text-sm text-gray-500">{{ term.terms.note }}</p>
                <div class="flex gap-2 mt-2">
                    <UButton
                        variant="outline"
                        :disabled="term.locked"
                        @click="edit(term)"
                        >Edit agreement</UButton
                    >
                    <UButton
                        color="red"
                        variant="outline"
                        :disabled="term.locked"
                        @click="confirmDelete(term)"
                        >Delete agreement</UButton
                    >
                </div>
                <p v-if="term.locked" class="text-xs text-gray-500 mt-1"
                    >Protected by posted profit allocations. Add a later
                    agreement for future changes.</p
                >
            </div>
        </UCard>
        <InvestmentsProfileModal
            v-if="showProfile"
            :investor="profile"
            @close="showProfile = false"
            @saved="profileSaved"
        />
        <UModal v-model="showDelete" :prevent-close="busy">
            <UCard>
                <template #header>Delete agreement?</template>

                <div class="space-y-4">
                    <UAlert
                        v-if="deleteError"
                        color="red"
                        :title="deleteError"
                    />
                    <p
                        >Delete {{ deleting?.investorName }}'s agreement dated
                        {{
                            String(deleting?.effective_date || '').slice(0, 10)
                        }}?</p
                    >
                    <p class="text-sm text-gray-500"
                        >The previous agreement will apply until the next one.
                        If no previous agreement exists, this investor will have
                        no agreement for that period. A copy will remain in the
                        audit log.</p
                    >
                    <div class="flex justify-end gap-2">
                        <UButton
                            variant="ghost"
                            :disabled="busy"
                            @click="showDelete = false"
                            >Cancel</UButton
                        >
                        <UButton
                            color="red"
                            :loading="busy"
                            @click="removeAgreement"
                            >Delete agreement</UButton
                        >
                    </div>
                </div>
            </UCard>
        </UModal>
        <UModal v-model="showForm" :prevent-close="busy"
            ><UCard
                ><template #header
                    >{{ editing ? 'Edit agreement' : 'Agreement' }} ·
                    {{ selected?.name }}</template
                ><UAlert
                    v-if="formError"
                    color="red"
                    :title="formError"
                    class="mb-4"
                /><form class="space-y-4" @submit.prevent="save"
                    ><fieldset :disabled="busy" class="space-y-4"
                        ><UFormGroup label="Effective date" required
                            ><UInput
                                v-model="form.date"
                                type="date"
                                required /></UFormGroup
                        ><div class="grid grid-cols-2 gap-3"
                            ><UFormGroup label="Ownership %"
                                ><UInput
                                    v-model="form.ownershipPercent"
                                    :disabled="ownershipFromShares"
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.0001"
                                    required /></UFormGroup
                            ><UFormGroup label="Profit share %"
                                ><UInput
                                    v-model="form.profitPercent"
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.0001"
                                    required /></UFormGroup
                            ><UFormGroup label="Shares held"
                                ><UInput
                                    v-model="form.shares"
                                    type="number"
                                    min="0"
                                    step="any" /></UFormGroup
                            ><div class="text-sm text-gray-500 pt-1">
                                <p
                                    >Total company shares:
                                    {{ agreementTotal || 'Not set' }}</p
                                >
                                <p
                                    v-if="editing?.terms.totalShares"
                                    class="text-xs"
                                    >Total recorded with this agreement.</p
                                >
                                <NuxtLink
                                    v-else
                                    to="/investments/settings"
                                    class="text-primary-500 underline"
                                    >Manage in Settings</NuxtLink
                                >
                            </div></div
                        ><UFormGroup label="Share class"
                            ><UInput v-model="form.shareClass" /></UFormGroup
                        ><UFormGroup label="Agreement / reason" required
                            ><UTextarea
                                v-model="form.note"
                                required /></UFormGroup
                        ><p class="text-xs text-gray-500"
                            >Leave shares held at zero to enter ownership as a
                            percentage. Otherwise, ownership is calculated using
                            the company total shown above. Corrections are
                            recorded in the audit history.</p
                        ></fieldset
                    ><div class="flex justify-end gap-2"
                        ><UButton
                            variant="ghost"
                            :disabled="busy"
                            @click="showForm = false"
                            >Cancel</UButton
                        ><UButton type="submit" :loading="busy"
                            >Save agreement</UButton
                        ></div
                    ></form
                ></UCard
            ></UModal
        >
    </div></template
>
