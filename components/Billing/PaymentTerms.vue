<script setup lang="ts">
import { customPaymentTerm, invoicePaymentTerms, newPaymentTerm, paymentTermDueDate, type SavedPaymentTerm } from '~/utils/invoice-payment-terms'
import { billingErrorMessage } from '~/utils/billing-error'

const terms = defineModel<string>('terms', { default: '' })
const dueDate = defineModel<string>('dueDate', { default: '' })
const props = withDefaults(defineProps<{ invoiceDate: string; disabled?: boolean; id?: string }>(), { disabled: false })
const scope = useCompanyScope()
const customTerms = ref<SavedPaymentTerm[]>([])
const menuOpen = ref(false), createOpen = ref(false), loading = ref(false), saving = ref(false), canCreate = ref(false)
const search = ref(''), termName = ref(''), dueAfter = ref<number | string>(0)
const loadError = ref(''), saveError = ref('')
const list = ref<HTMLElement | null>(null)
const lastInvoiceDate = ref(props.invoiceDate)
let active = true
onBeforeUnmount(() => { active = false })
const options = computed(() => [...invoicePaymentTerms, ...customTerms.value, customPaymentTerm])
const selectedTerm = computed(() => options.value.find(term => term.name.toLowerCase() === terms.value.trim().toLowerCase()) || customPaymentTerm)
const filteredOptions = computed(() => options.value.filter(term => term.name.toLowerCase().includes(search.value.trim().toLowerCase())))
watch(menuOpen, open => { if (open) search.value = '' })

async function load() {
  loading.value = true; loadError.value = ''
  try {
    const result = await scope.fetch<{ terms: SavedPaymentTerm[]; canCreate: boolean }>('/api/settings/payment-terms')
    if (active) { customTerms.value = result.terms; canCreate.value = result.canCreate }
  } catch (error) { if (active) loadError.value = billingErrorMessage(error, 'Could not load saved payment terms.') }
  finally { if (active) loading.value = false }
}
onMounted(load)

function selectTerm(id: string) {
  if (props.disabled || saving.value) return
  const term = options.value.find(option => option.id === id)
  if (!term) return
  terms.value = term.name
  const nextDue = paymentTermDueDate(term, props.invoiceDate)
  if (nextDue) dueDate.value = nextDue
  menuOpen.value = false
}

function syncInvoiceDate(nextDate: string) {
  // Native date inputs briefly become empty while typing. Keep the last valid day.
  if (!paymentTermDueDate(invoicePaymentTerms[2], nextDate)) return
  const previousDue = paymentTermDueDate(selectedTerm.value, lastInvoiceDate.value)
  const nextDue = paymentTermDueDate(selectedTerm.value, nextDate)
  if (nextDue && previousDue && dueDate.value === previousDue) dueDate.value = nextDue
  lastInvoiceDate.value = nextDate
}
watch(() => props.invoiceDate, syncInvoiceDate)

function openNewTerm() {
  if (props.disabled || saving.value || !canCreate.value) return
  termName.value = ''; dueAfter.value = 0; saveError.value = ''
  menuOpen.value = false; createOpen.value = true
}

async function saveTerm() {
  if (props.disabled || saving.value || !canCreate.value) return
  saveError.value = ''; saving.value = true
  try {
    const input = newPaymentTerm({ name: termName.value, days: dueAfter.value })
    const result = await scope.fetch<{ term: SavedPaymentTerm; terms: SavedPaymentTerm[] }>('/api/settings/payment-terms', { method: 'POST', body: input })
    if (!active) return
    customTerms.value = result.terms
    saving.value = false
    selectTerm(result.term.id)
    createOpen.value = false
  } catch (error) { if (active) saveError.value = billingErrorMessage(error, 'Could not save this payment term.') }
  finally { if (active) saving.value = false }
}

function focusOption(index: number) {
  const buttons = list.value?.querySelectorAll<HTMLButtonElement>('[role="option"]')
  if (buttons?.length) buttons[(index + buttons.length) % buttons.length].focus()
}
</script>

<template>
  <div class="min-w-0">
    <UPopover v-model:open="menuOpen" class="w-full" :disabled="disabled || saving" :popper="{ placement: 'bottom-start' }">
      <UButton :id="id" color="gray" variant="outline" class="w-full justify-between" :label="selectedTerm.name" truncate :trailing-icon="menuOpen ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" :disabled="disabled || saving" :loading="loading" aria-label="Invoice payment terms" aria-haspopup="listbox" :aria-expanded="menuOpen" />
      <template #panel>
        <div class="w-64 rounded-md bg-white p-1 dark:bg-gray-900">
          <UInput v-model="search" autofocus icon="i-heroicons-magnifying-glass" placeholder="Search" aria-label="Search payment terms" class="m-1" @keydown.down.prevent="focusOption(0)" />
          <ul ref="list" role="listbox" aria-label="Payment terms" class="max-h-56 overflow-y-auto py-1">
            <li v-for="(term, index) in filteredOptions" :key="term.id">
              <button type="button" role="option" :aria-selected="selectedTerm.id === term.id" class="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-xs hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:hover:bg-gray-800 dark:focus:bg-gray-800" :class="{ 'bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400': selectedTerm.id === term.id }" @click="selectTerm(term.id)" @keydown.down.prevent="focusOption(index + 1)" @keydown.up.prevent="focusOption(index - 1)" @keydown.home.prevent="focusOption(0)" @keydown.end.prevent="focusOption(filteredOptions.length - 1)">
                <span>{{ term.name }}</span><UIcon v-if="selectedTerm.id === term.id" name="i-heroicons-check" class="shrink-0" />
              </button>
            </li>
            <li v-if="!filteredOptions.length" class="px-3 py-2 text-xs text-gray-500">No matching terms</li>
          </ul>
          <div v-if="canCreate" class="border-t border-gray-200 p-1 dark:border-gray-800"><UButton color="primary" variant="ghost" icon="i-heroicons-plus-circle" size="xs" block :disabled="disabled || saving" @click="openNewTerm">New Payment Term</UButton></div>
        </div>
      </template>
    </UPopover>
    <UInput v-if="selectedTerm.kind === 'custom'" v-model="terms" class="mt-2" placeholder="Enter payment terms" aria-label="Custom invoice payment terms" maxlength="2000" :disabled="disabled || saving" />
    <div v-if="loadError" class="mt-1 text-xs text-red-500"><p>{{ loadError }}</p><UButton variant="link" size="xs" :loading="loading" @click="load">Retry</UButton></div>

    <UModal v-model="createOpen" :prevent-close="saving" :ui="{ width: 'sm:max-w-lg' }">
      <form aria-label="New Payment Term" @submit.prevent="saveTerm">
        <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-200 dark:divide-gray-800' }">
          <template #header><div class="flex items-center justify-between"><h2 class="text-base font-semibold">New Payment Term</h2><UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" aria-label="Close new payment term" :disabled="saving" @click="createOpen = false" /></div></template>
          <div class="space-y-4">
            <UFormGroup label="Term Name" required><UInput v-model="termName" autofocus maxlength="100" aria-label="Term Name" :disabled="saving" required /></UFormGroup>
            <UFormGroup label="Due After" required><UInput v-model.number="dueAfter" type="number" min="0" max="3650" step="1" aria-label="Due After" :disabled="saving" required :ui="{ padding: { sm: 'pe-14' } }"><template #trailing><span class="text-xs text-gray-500">Days</span></template></UInput></UFormGroup>
            <UAlert v-if="saveError" color="red" title="Could not save payment term" :description="saveError" />
          </div>
          <template #footer><div class="flex gap-2"><UButton type="submit" :loading="saving" :disabled="disabled">Save</UButton><UButton color="gray" :disabled="saving" @click="createOpen = false">Cancel</UButton></div></template>
        </UCard>
      </form>
    </UModal>
  </div>
</template>
