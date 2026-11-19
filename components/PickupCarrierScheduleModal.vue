<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; pickup?: any }>();
const emit = defineEmits(['update:modelValue', 'saved']);
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) });
const form = ref({ date: '', startTime: '', endTime: '' });
const busy = ref(false);
const error = ref('');
watch(open, value => {
  if (!value) return;
  const schedule = props.pickup?.carrierSchedule;
  form.value = { date: schedule?.date || '', startTime: schedule?.startTime || '', endTime: schedule?.endTime || '' };
  error.value = '';
});
async function save() {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try {
    await $fetch('/api/ecommerce-cms/pickup/schedule', { method: 'POST', body: { requestId: props.pickup?.id, ...form.value } });
    emit('saved'); open.value = false;
  } catch (e: any) { error.value = carrierError(e); }
  finally { busy.value = false; }
}
</script>
<template>
  <UModal v-model="open" :prevent-close="busy">
    <UCard>
      <template #header><h2 class="text-lg font-semibold">Record carrier pickup slot</h2></template>
      <div class="space-y-4">
        <p class="text-sm text-gray-500">Copy the allocated date and slot for pickup {{ pickup?.carrierPickupId }} from Delhivery One. Saving records it in Markit; it does not reschedule the carrier booking. Times are in India Standard Time.</p>
        <UFormGroup label="Carrier pickup date"><UInput v-model="form.date" type="date" :disabled="busy" /></UFormGroup>
        <div class="grid grid-cols-2 gap-3">
          <UFormGroup label="Slot starts"><UInput v-model="form.startTime" type="time" :disabled="busy" /></UFormGroup>
          <UFormGroup label="Slot ends"><UInput v-model="form.endTime" type="time" :disabled="busy" /></UFormGroup>
        </div>
        <UAlert v-if="error" color="red" :title="error" />
      </div>
      <template #footer><div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" :disabled="busy" @click="open = false">Cancel</UButton>
        <UButton :loading="busy" :disabled="!form.date || !form.startTime || !form.endTime" @click="save">Save carrier slot</UButton>
      </div></template>
    </UCard>
  </UModal>
</template>
