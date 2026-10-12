<script setup lang="ts">
import type { ExpenseParty } from '~/utils/expense-party';
const props = defineProps<{ modelValue?: ExpenseParty | null; options: ExpenseParty[]; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: ExpenseParty | null] }>();
const search = ref('');
const groups = computed(() => [
  { kind: 'user', label: 'Users' }, { kind: 'distributor', label: 'Distributors' }, { kind: 'client', label: 'Clients' },
].map(group => ({ ...group, items: props.options.filter(p => p.kind === group.kind && p.name?.toLowerCase().includes(search.value.toLowerCase())) })));
</script>
<template>
  <UPopover :popper="{ placement: 'bottom-start' }">
    <UButton :disabled="disabled" color="white" trailing-icon="i-heroicons-chevron-down" class="w-full justify-between" :label="modelValue?.name || 'Select party'" aria-label="Select party" />
    <template #panel="{ close }">
      <div class="w-72 p-2">
        <UInput v-model="search" placeholder="Search parties..." icon="i-heroicons-magnifying-glass" autofocus />
        <div class="max-h-64 overflow-y-auto mt-2">
          <UButton label="No party" color="gray" variant="ghost" block @click="emit('update:modelValue', null); close()" />
          <section v-for="group in groups" :key="group.kind" :aria-label="group.label">
            <h4 class="px-2 py-2 text-xs font-semibold text-gray-500 bg-gray-50 dark:bg-gray-800">{{ group.label }}</h4>
            <UButton v-for="party in group.items" :key="`${party.kind}:${party.id}`" :label="party.name" :color="modelValue?.kind === party.kind && modelValue?.id === party.id ? 'primary' : 'gray'" variant="ghost" block class="justify-start" @click="emit('update:modelValue', party); close()" />
            <p v-if="!group.items.length" class="px-2 py-1 text-xs text-gray-400">No matches</p>
          </section>
        </div>
      </div>
    </template>
  </UPopover>
</template>
