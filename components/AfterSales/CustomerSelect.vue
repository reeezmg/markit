<script setup lang="ts">
import { billingErrorMessage } from '~/utils/billing-error'
type Customer = { id: string; name: string; phone: string | null }
const props = defineProps<{ modelValue: string; companyId: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const scope = useCompanyScope()
const selected = ref<Customer>()
const error = ref('')
const loading = ref(false)
const retry = ref(0)
let request = 0

async function search(query: string) {
  const current = ++request
  const companyId = props.companyId
  error.value = ''
  if (!companyId) return []
  loading.value = true
  try {
    const customers = await scope.fetch<Customer[]>('/api/bill/findManyClient', {
      headers: { 'x-company-id': companyId }, query: { q: query.trim() }
    })
    return current === request && companyId === props.companyId ? customers : []
  } catch (e) {
    if (current === request && companyId === props.companyId) error.value = billingErrorMessage(e)
    return []
  } finally {
    if (current === request) loading.value = false
  }
}

watch(() => props.companyId, () => {
  request++
  selected.value = undefined
  error.value = ''
  loading.value = false
  if (props.modelValue) emit('update:modelValue', '')
})
watch(() => props.modelValue, value => {
  if (selected.value?.id !== value) selected.value = undefined
})
onBeforeUnmount(() => { request++ })

function choose(value: Customer | null) {
  selected.value = value ?? undefined
  emit('update:modelValue', value?.id || '')
}
</script>
<template>
  <UFormGroup label="Client" required :error="error || undefined" help="Choose a client or search by name or phone.">
    <USelectMenu
      :key="`${companyId}:${retry}`"
      :model-value="selected"
      :searchable="search"
      :loading="loading"
      :disabled="disabled || !companyId"
      by="id"
      option-attribute="name"
      searchable-placeholder="Search clients"
      placeholder="Select a client"
      @update:model-value="choose"
    >
      <template #label>{{ selected ? [selected.name, selected.phone].filter(Boolean).join(' - ') : 'Select a client' }}</template>
      <template #option="{ option }">
        <span>{{ option.name }}</span>
        <span v-if="option.phone" class="ml-2 text-xs text-gray-500 dark:text-gray-400">{{ option.phone }}</span>
      </template>
      <template #empty>{{ loading ? 'Loading clients…' : error ? 'Unable to load clients.' : 'No clients found for this company.' }}</template>
      <template #option-empty>{{ loading ? 'Searching clients…' : error ? 'Unable to load clients.' : 'No matching client found.' }}</template>
    </USelectMenu>
    <UButton v-if="error" class="mt-2" variant="link" size="xs" :disabled="disabled" @click="retry++">Retry loading clients</UButton>
  </UFormGroup>
</template>
