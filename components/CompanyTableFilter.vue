<script setup lang="ts">
const scope = useCompanyScope();
const options = computed(() => [{ label: 'All companies', value: '' },
  ...scope.companies.value.map(c => ({ label: c.name, value: c.id }))]);
</script>
<template>
  <UFormGroup v-if="scope.enabled.value" label="Company / branch" size="xs">
    <USelect :model-value="scope.selected.value" :options="options" class="min-w-40" @update:model-value="scope.filter" />
  </UFormGroup>
</template>
