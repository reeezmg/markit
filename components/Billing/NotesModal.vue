<script setup lang="ts">
const open = defineModel<boolean>({ default: false })
const notes = defineModel<string>('notes', { default: '' })
const termsAndConditions = defineModel<string>('termsAndConditions', { default: '' })
defineProps<{ disabled?: boolean }>()
</script>

<template>
  <UModal v-model="open" :prevent-close="disabled" :ui="{ width: 'sm:max-w-3xl' }">
    <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-200 dark:divide-gray-800' }">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">Notes</h2>
          <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" aria-label="Close notes" :disabled="disabled" @click="open = false" />
        </div>
      </template>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormGroup label="Customer notes"><UTextarea v-model="notes" :rows="5" maxlength="5000" :disabled="disabled" aria-label="Customer notes" placeholder="Additional details for the customer" /></UFormGroup>
        <UFormGroup label="Terms and conditions"><UTextarea v-model="termsAndConditions" :rows="5" maxlength="10000" :disabled="disabled" aria-label="Terms and conditions" placeholder="Scope, exclusions or warranty terms" /></UFormGroup>
      </div>
      <template #footer><div class="flex justify-end"><UButton :disabled="disabled" @click="open = false">Done</UButton></div></template>
    </UCard>
  </UModal>
</template>
