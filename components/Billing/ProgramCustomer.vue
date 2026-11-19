<script setup lang="ts">
import { billingErrorMessage } from '~/utils/billing-error'
const props = defineProps<{ modelValue: string; name?: string; companyId: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; selected: [value: any] }>()
const scope = useCompanyScope()
const search = ref(props.name || ''), rows = ref<any[]>([]), error = ref(''), loading = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined, version = 0
watch(() => [props.modelValue, props.name], () => { if (props.modelValue) search.value = props.name || search.value })
function input(event: Event) {
  search.value = (event.target as HTMLInputElement).value
  emit('update:modelValue', ''); rows.value = []; error.value = ''; clearTimeout(timer)
  const token = ++version
  loading.value = !!search.value.trim()
  if (!loading.value) return
  timer = setTimeout(async () => {
    try {
      const result = await scope.fetch<any[]>('/api/bill/findManyClient', { headers: { 'x-company-id': props.companyId }, query: { q: search.value } })
      if (token === version) rows.value = result
    } catch (e) { if (token === version) error.value = billingErrorMessage(e) }
    finally { if (token === version) loading.value = false }
  }, 250)
}
function select(row: any) { ++version; clearTimeout(timer); search.value = row.name; rows.value = []; loading.value = false; emit('update:modelValue', row.id); emit('selected', row) }
onBeforeUnmount(() => { clearTimeout(timer); ++version })
</script>
<template>
  <div class="program-customer">
    <label>Customer <span aria-hidden="true">*</span><input :value="search" :disabled="disabled" autocomplete="off" placeholder="Search by customer name or phone" @input="input"></label>
    <p v-if="loading" class="program-muted">Searching customers…</p>
    <p v-if="error" role="alert" class="program-error">{{ error }}</p>
    <div v-if="rows.length" class="program-matches"><button v-for="row in rows" :key="row.id" type="button" @click="select(row)">{{ row.name }} <small>{{ row.phone }}</small></button></div>
    <p v-else-if="!loading && search && !modelValue && !error" class="program-muted">Select a matching customer linked to this company.</p>
  </div>
</template>

