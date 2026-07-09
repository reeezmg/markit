<script setup lang="ts">
import { format } from 'date-fns';

definePageMeta({ auth: true });

const toast = useToast();

// Dimension presets: packaging "box" and "product" dimension presets. Backed by
// raw /api/dimensions endpoints (shipping_boxes table) so the `type` field works
// without a ZenStack regen. Sorted newest-first by the API.
const rows = ref<any[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const res: any = await $fetch('/api/dimensions');
    rows.value = res.dimensions || [];
  } catch (e: any) {
    toast.add({ title: 'Could not load dimensions', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'weight', label: 'Weight (kg)' },
  { key: 'dimensions', label: 'Dimensions (cm)' },
  { key: 'createdAt', label: 'Added' },
  { key: 'actions', label: '' },
];

const dimsText = (r: any) => [r.length, r.width, r.height].every((v: any) => v != null)
  ? `${r.length} × ${r.width} × ${r.height}`
  : '—';

// ─── Add / edit modal ────────────────────────────────────────────────────────
const blank = () => ({ id: '', type: 'box', name: '', weight: null, length: null, width: null, height: null });
const modalOpen = ref(false);
const saving = ref(false);
const form = ref<any>(blank());
const editing = computed(() => Boolean(form.value.id));

const typeOptions = [
  { label: 'Box', value: 'box' },
  { label: 'Product', value: 'product' },
];

const dimFields: Array<{ key: 'weight' | 'length' | 'width' | 'height'; label: string }> = [
  { key: 'weight', label: 'Weight (kg)' },
  { key: 'length', label: 'Length (cm)' },
  { key: 'width', label: 'Width (cm)' },
  { key: 'height', label: 'Height (cm)' },
];

const isValid = computed(() => String(form.value.name || '').trim() !== '' && ['box', 'product'].includes(form.value.type));

function openCreate() { form.value = blank(); modalOpen.value = true; }
function openEdit(row: any) { form.value = { ...blank(), ...row }; modalOpen.value = true; }

async function save() {
  if (!isValid.value) return;
  saving.value = true;
  const body = {
    name: String(form.value.name).trim(),
    type: form.value.type,
    weight: form.value.weight, length: form.value.length, width: form.value.width, height: form.value.height,
  };
  try {
    if (form.value.id) {
      await $fetch(`/api/dimensions/${form.value.id}`, { method: 'PUT', body });
      toast.add({ title: 'Dimension updated', color: 'green' });
    } else {
      await $fetch('/api/dimensions', { method: 'POST', body });
      toast.add({ title: 'Dimension added', color: 'green' });
    }
    modalOpen.value = false;
    await load();
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e.data?.statusMessage || e.message, color: 'red' });
  } finally {
    saving.value = false;
  }
}

async function remove(row: any) {
  try {
    await $fetch(`/api/dimensions/${row.id}`, { method: 'DELETE' });
    toast.add({ title: `${row.name} removed`, color: 'green' });
    await load();
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e.data?.statusMessage || e.message, color: 'red' });
  }
}
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div class="p-6 space-y-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Dimensions</h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Packaging boxes and product dimension presets (weight + L/W/H). Used later by the shipping flow.
          </p>
        </div>
        <UButton icon="i-heroicons-plus" color="primary" @click="openCreate">Add Dimension</UButton>
      </div>

      <UCard :ui="{ body: { padding: '' } }">
        <UTable :rows="rows" :columns="columns" :loading="loading">
          <template #type-data="{ row }">
            <UBadge :color="row.type === 'product' ? 'blue' : 'gray'" variant="subtle" class="capitalize">
              {{ row.type }}
            </UBadge>
          </template>

          <template #weight-data="{ row }">
            {{ row.weight != null ? row.weight : '—' }}
          </template>

          <template #dimensions-data="{ row }">
            {{ dimsText(row) }}
          </template>

          <template #createdAt-data="{ row }">
            <span class="text-gray-500">{{ row.createdAt ? format(new Date(row.createdAt), 'dd MMM yyyy') : '—' }}</span>
          </template>

          <template #actions-data="{ row }">
            <div class="flex justify-end gap-1">
              <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-pencil-square" @click="openEdit(row)" />
              <UButton size="xs" color="red" variant="ghost" icon="i-heroicons-trash" @click="remove(row)" />
            </div>
          </template>

          <template #empty-state>
            <div class="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <UIcon name="i-heroicons-cube" class="h-10 w-10 text-gray-400" />
              <p class="text-sm text-gray-500">No dimensions yet. Add a box or product dimension.</p>
            </div>
          </template>
        </UTable>
      </UCard>

      <!-- Add / edit modal (with Box | Product selector) -->
      <UModal v-model="modalOpen" :ui="{ width: 'sm:max-w-md' }">
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">{{ editing ? 'Edit' : 'Add' }} Dimension</h2>
          </template>
          <div class="space-y-4">
            <UFormGroup label="Type" required>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="opt in typeOptions"
                  :key="opt.value"
                  type="button"
                  class="rounded-md border-2 py-2 text-sm font-medium transition"
                  :class="form.type === opt.value
                    ? 'border-primary-500 text-primary-600 bg-primary-50 dark:bg-primary-950'
                    : 'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300'"
                  @click="form.type = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </UFormGroup>

            <UFormGroup :label="`${form.type === 'product' ? 'Product dimension' : 'Box'} name`" required>
              <UInput v-model="form.name" :placeholder="form.type === 'product' ? 'e.g. Standard hijab pack' : 'e.g. Small carton'" />
            </UFormGroup>

            <div class="grid grid-cols-2 gap-3">
              <UFormGroup v-for="f in dimFields" :key="f.key" :label="f.label">
                <UInput v-model.number="form[f.key]" type="number" step="0.01" min="0" />
              </UFormGroup>
            </div>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" color="gray" @click="modalOpen = false">Cancel</UButton>
              <UButton :loading="saving" :disabled="!isValid" @click="save">{{ editing ? 'Save' : 'Add' }}</UButton>
            </div>
          </template>
        </UCard>
      </UModal>
    </div>
  </UDashboardPanelContent>
</template>
