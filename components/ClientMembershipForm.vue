<script setup lang="ts">
const props = defineProps<{ record: any }>();
const emit = defineEmits(['saved', 'close']);
const scope = useCompanyScope('form');
const toast = useToast();
const saving = ref(false);
const form = reactive({ name: '', phone: '', email: '' });
watch(() => props.record, row => {
  if (!row) return;
  Object.assign(form, { name: row.name || '', phone: row.phone || '', email: row.email || '' });
  void scope.beginForm({ model: 'CompanyClient', id: row.clientId, companyId: row.companyId });
}, { immediate: true });
async function save() {
  saving.value = true;
  try {
    await scope.fetch('/api/clients/membership', { method: 'PUT', body: { ...form, clientId: props.record.clientId, companyId: scope.companyId.value } });
    emit('saved');
  } catch (error: any) { toast.add({ title: 'Could not save client', description: error?.data?.statusMessage || error.message, color: 'red' }); }
  finally { saving.value = false; }
}
</script>
<template>
  <UCard>
    <template #header>Edit client</template>
    <CompanyFormField @transferred="emit('saved')" />
    <p class="mb-4 text-sm text-gray-500">Contact details are shared wherever this customer is linked.</p>
    <UFormGroup label="Name" required class="mb-4"><UInput v-model="form.name" /></UFormGroup>
    <UFormGroup label="Phone" required class="mb-4"><UInput v-model="form.phone" /></UFormGroup>
    <UFormGroup label="Email" class="mb-4"><UInput v-model="form.email" type="email" /></UFormGroup>
    <template #footer><div class="flex justify-end gap-2"><UButton color="gray" @click="emit('close')">Cancel</UButton><UButton :loading="saving" :disabled="!form.name || !form.phone || scope.busy.value" @click="save">Save</UButton></div></template>
  </UCard>
</template>
