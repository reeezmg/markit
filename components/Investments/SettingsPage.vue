<script setup lang="ts">
const api = useAccountantApi(),
    toast = useToast(),
    totalShares = ref(0),
    sharesReady = ref(false),
    sharesBusy = ref(false),
    error = ref('');
onMounted(async () => {
    try {
        totalShares.value = (
            await api.get('/investors/share-settings')
        ).totalShares;
        sharesReady.value = true;
    } catch (e: any) {
        error.value = e.message;
    }
});
async function saveShares() {
    sharesBusy.value = true;
    try {
        const saved = await api.put('/investors/share-settings', {
            totalShares: totalShares.value,
        });
        totalShares.value = saved.totalShares;
        toast.add({ title: 'Company shares saved', color: 'green' });
    } catch {
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
                >Set the total once for all investors. New agreements use this
                total to calculate ownership from shares held.</p
            >
            <form class="space-y-4" @submit.prevent="saveShares">
                <UFormGroup label="Total company shares" required>
                    <UInput
                        v-model="totalShares"
                        type="number"
                        min="0"
                        max="1000000000000"
                        step="any"
                        required
                        :disabled="sharesBusy || !sharesReady"
                    />
                </UFormGroup>
                <p class="text-xs text-gray-500"
                    >Use zero if you only track ownership percentages. Changes
                    apply to new agreements; existing agreements keep their
                    recorded shares and ownership. Add new agreements for
                    affected investors when the total changes.</p
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
