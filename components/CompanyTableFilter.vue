<script setup lang="ts">
import CompanyControlPlacement from './CompanyControlPlacement.vue';
defineOptions({ inheritAttrs: false });
const scope = useCompanyScope();
const options = computed(() => [{ label: 'All companies', value: '' },
  ...scope.companies.value.map(c => ({ label: c.name, value: c.id }))]);
</script>
<template>
  <CompanyControlPlacement v-if="scope.enabled.value" toolbar kind="table">
  <UFormGroup size="xs">
    <USelect aria-label="Company / branch" :model-value="scope.selected.value" :options="options" class="min-w-40" @update:model-value="scope.filter" />
  </UFormGroup>
  </CompanyControlPlacement>
</template>
