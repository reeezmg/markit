<script setup lang="ts">
const props = defineProps<{ cash?: any }>()
const emit = defineEmits(['save', 'cancel'])

const form = ref({
  name: props.cash?.name ?? 'Cash',
})

const submit = () => emit('save', form.value)
</script>

<template>
  <UCard>
    <div class="text-lg font-semibold mb-4">
      {{ props.cash ? 'Edit Cash Account' : 'Create Cash Account' }}
    </div>

    <UInput v-model="form.name" placeholder="Account Name" />

    <div class="flex justify-end gap-2 mt-4">
      <UButton color="gray" @click="$emit('cancel')">Cancel</UButton>
      <UButton color="primary" @click="submit">Save</UButton>
    </div>
  </UCard>
</template>
