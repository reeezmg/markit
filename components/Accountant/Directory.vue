<script setup lang="ts">
const props = defineProps<{ kind: string }>();
const api = useAccountantApi();
const rows = ref<any[]>([]);
const busy = ref(false);
const form = reactive({ name: '', type: 'CLIENT', email: '', phone: '', description: '' });
const endpoint = computed(() => props.kind === 'contacts' ? '/parties' : '/projects');
async function load() { rows.value = (await api.get(endpoint.value)).data; }
async function save() {
  busy.value = true;
  try { await api.post(endpoint.value, form); Object.assign(form, { name: '', email: '', phone: '', description: '' }); await load(); }
  finally { busy.value = false; }
}
onMounted(load);
</script>
<template>
  <div class="space-y-5">
    <h2 class="text-lg font-semibold">{{ kind === 'contacts' ? 'Accounting contacts' : 'Accounting projects' }}</h2>
    <p class="text-sm text-gray-500">These records belong to the new accounting books for the selected company.</p>
    <UCard><form class="grid gap-4 sm:grid-cols-2" @submit.prevent="save">
      <UFormGroup label="Name" required><UInput v-model="form.name" required maxlength="150" /></UFormGroup>
      <template v-if="kind === 'contacts'">
        <UFormGroup label="Type"><USelect v-model="form.type" :options="['CLIENT', 'VENDOR', 'OTHER']" /></UFormGroup>
        <UFormGroup label="Email"><UInput v-model="form.email" type="email" /></UFormGroup>
        <UFormGroup label="Phone"><UInput v-model="form.phone" maxlength="40" /></UFormGroup>
      </template>
      <UFormGroup v-else label="Description"><UInput v-model="form.description" /></UFormGroup>
      <div><UButton type="submit" :loading="busy">Add {{ kind === 'contacts' ? 'contact' : 'project' }}</UButton></div>
    </form></UCard>
    <UTable :rows="rows" :columns="kind === 'contacts' ? [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }] : [{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }]" />
  </div>
</template>
