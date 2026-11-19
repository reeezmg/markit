<script setup lang="ts">
const api = useAccountantApi(),
    toast = useToast(),
    totalShares = ref(0),
    includeShares = ref(false),
    sharesReady = ref(false),
    sharesBusy = ref(false),
    error = ref('');
onMounted(async () => {
    try {
        const settings = await api.get('/investors/share-settings');
        totalShares.value = settings.totalShares; includeShares.value = settings.includeShares;
        sharesReady.value = true;
    } catch (e: any) {
        error.value = e.message;
    }
});
async function saveShares() {
    sharesBusy.value = true; error.value = '';
    try {
        const saved = await api.put('/investors/share-settings', {
            totalShares: totalShares.value, includeShares: includeShares.value,
        });
        totalShares.value = saved.totalShares;
        toast.add({ title: 'Company shares saved', color: 'green' });
    } catch (e: any) { error.value = e.message;
    } finally {
        sharesBusy.value = false;
    }
}
</script>
<template
    ><div class="space-y-5 max-w-2xl"
        ><h1 class="text-xl font-semibold">Investment settings</h1
        ><UAlert v-if="error" color="red" :title="error" />
        <UCard>
            <h2 class="font-semibold">Company shares</h2>
            <p class="text-sm text-gray-500 mt-2 mb-5"
                >Set the total once for all investors. Purchases and redemptions calculate ownership from shares held.</p
            >
            <form class="space-y-4" @submit.prevent="saveShares">
                <UCheckbox v-model="includeShares" label="Include shares" :disabled="sharesBusy || !sharesReady" /><p class="text-sm text-gray-500">When enabled, ownership and profit share follow shares held. When disabled, enter percentages directly. Each share transaction has its own price.</p>
                <UFormGroup v-if="includeShares" label="Total company shares" required>
                    <UInput
                        v-model="totalShares"
                        type="number"
                        min="0.00000001"
                        max="1000000000000"
                        step="any"
                        required
                        :disabled="sharesBusy || !sharesReady"
                    />
                </UFormGroup>
                <p class="text-xs text-gray-500"
                    >The company share total is fixed while investor holdings depend on it. Switching this option changes the available controls and preserves historical holdings and allocations.</p
                >
                <UButton
                    type="submit"
                    :loading="sharesBusy"
                    :disabled="!sharesReady"
                    >Save company shares</UButton
                >
            </form> </UCard
        ><p class="text-sm text-gray-500">Account choices are configured in Settings → Account → Investments.</p></div
    ></template
>
