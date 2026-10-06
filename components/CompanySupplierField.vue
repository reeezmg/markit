<script setup lang="ts">
import { useFindManyDistributorCompany } from '~/lib/company-hooks/distributor-company';
const props = defineProps<{ modelValue?: string | null; disabled?: boolean }>();
const emit = defineEmits(['update:modelValue']);
const scope = useCompanyScope();
const { data } = useFindManyDistributorCompany(computed(() => ({
  where: { companyId: scope.companyId.value }, include: { distributor: true },
})), { companyScope: 'form' } as any);
const options = computed(() => (data.value ?? []).map((row: any) => ({ label: row.distributor.name, value: row.distributorId })));
watch([data, scope.companyId], () => {
  if (!props.disabled && data.value && props.modelValue && !options.value.some(o => o.value === props.modelValue)) emit('update:modelValue', '');
});
</script>
<template>
  <UFormGroup label="Supplier" required>
    <USelect :model-value="modelValue || ''" :options="options" :disabled="disabled" placeholder="Select supplier" @update:model-value="emit('update:modelValue', $event)" />
  </UFormGroup>
</template>
