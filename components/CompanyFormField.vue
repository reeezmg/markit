<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query';
const emit = defineEmits(['transferred']);
defineProps<{ locked?: boolean }>();
const scope = useCompanyScope();
const queryClient = useQueryClient();
const toast = useToast();
const router = useRouter();
const route = useRoute();
const transfer = ref<any>(null);
const destination = ref('');
const mappings = reactive<Record<string, string>>({});
const confirmed = ref(false);
const saving = ref(false);
const options = computed(() => scope.companies.value.map(c => ({ label: c.name, value: c.id })));
async function select(id: string) {
  if (scope.pageForm) {
    await router.replace({ path: route.path, query: { ...route.query, entryCompany: id } });
  } else if (scope.mode === 'table') await scope.selectOwner(id);
  else await scope.selectCompany(id);
}
async function change(id: string) {
  try {
    if (scope.record.value && scope.record.value.companyId !== id) {
      destination.value = id;
      confirmed.value = false;
      for (const key of Object.keys(mappings)) delete mappings[key];
      transfer.value = await scope.fetch('/api/organization/transfer', { method: 'POST', body: {
        ...scope.record.value, sourceCompanyId: scope.record.value.companyId, companyId: id, preview: true,
      } });
    } else await select(id);
  }
  catch (error: any) { toast.add({ title: 'Could not select company', description: error?.data?.statusMessage || error.message, color: 'red' }); }
}
async function move() {
  saving.value = true;
  try {
    await scope.fetch('/api/organization/transfer', { method: 'POST', body: {
      ...scope.record.value, sourceCompanyId: scope.record.value!.companyId, companyId: destination.value,
      fingerprint: transfer.value.fingerprint, includeLinked: confirmed.value, mappings,
    } });
    scope.record.value = { ...scope.record.value!, companyId: destination.value };
    transfer.value = null;
    await select(destination.value);
    await queryClient.invalidateQueries();
    await refreshNuxtData();
    emit('transferred');
    toast.add({ title: 'Company transfer completed', color: 'green' });
  } catch (error: any) { toast.add({ title: 'Transfer not saved', description: error?.data?.statusMessage || error.message, color: 'red' }); }
  finally { saving.value = false; }
}
</script>
<template>
  <UFormGroup v-if="scope.enabled.value" label="Company / branch" required class="mb-4">
    <USelect :model-value="scope.companyId.value" :options="options" :disabled="locked || scope.busy.value" class="min-w-40" @update:model-value="change" />
  </UFormGroup>
  <UModal :model-value="!!transfer" @update:model-value="value => { if (!value && !saving) transfer = null; }">
    <UCard v-if="transfer">
      <template #header><h3 class="font-semibold">Move to {{ options.find(o => o.value === destination)?.label }}</h3></template>
      <p class="mb-3 text-sm">These records and their stock and payment effects will move together. Select the matching destination records below.</p>
      <p class="mb-3 text-sm">Confirming moves the saved record immediately and reloads its details. Save any other edits before starting a transfer.</p>
      <div class="max-h-64 overflow-auto mb-4">
        <div v-for="record in transfer.records" :key="record.model + record.id" class="text-sm py-1">
          {{ record.model }} — {{ record.label }}
          <span v-if="record.quantity !== null"> · Quantity: {{ record.quantity }}</span>
          <span v-if="record.amount !== null"> · Amount: {{ record.amount }}</span>
        </div>
      </div>
      <UFormGroup v-for="requirement in transfer.requirements" :key="requirement.key" :label="requirement.label" required class="mb-3">
        <USelect v-model="mappings[requirement.key]" :options="requirement.options" placeholder="Select destination record" />
        <p v-if="!requirement.options.length" class="text-sm text-red-500">Create the matching record in the destination company first.</p>
      </UFormGroup>
      <UCheckbox v-model="confirmed" label="Include all linked records shown above" />
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="gray" :disabled="saving" @click="transfer = null">Cancel</UButton>
          <UButton :loading="saving" :disabled="!confirmed || transfer.requirements.some((r: any) => !mappings[r.key])" @click="move">Confirm transfer</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
