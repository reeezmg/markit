<script setup lang="ts">
defineProps<{ modelValue: boolean; title?: string; ui?: any }>();
const emit = defineEmits(['update:modelValue']);
</script>
<template>
  <UModal :model-value="modelValue" :ui="{ width: 'sm:max-w-3xl' }" @update:model-value="emit('update:modelValue', $event)">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-lg font-semibold">{{ title }}</h2>
          <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" aria-label="Close dialog" @click="emit('update:modelValue', false)" />
        </div>
      </template>
      <div class="max-h-[75vh] overflow-y-auto"><slot name="body" /><slot /></div>
      <template v-if="$slots.footer" #footer><slot name="footer" /></template>
    </UCard>
  </UModal>
</template>
