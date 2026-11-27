<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import DesignEditor from '~/components/Quotes/DesignEditor.vue'
import { documentDesignDraftKey, useDocumentDesignDraft, type DocumentDesignKind } from '~/composables/useDocumentDesignDraft'
import { normalizeQuotePreferences, type QuotePreferences } from '~/utils/quote-preferences'
import { billingErrorMessage } from '~/utils/billing-error'

const props = defineProps<{ documentKind: DocumentDesignKind }>()
const scope = useCompanyScope('form', true)
const drafts = useDocumentDesignDraft(), toast = useToast()
const documentName = props.documentKind === 'sales-order' ? 'Sales order' : 'Quote'
const basePath = props.documentKind === 'sales-order' ? '/erp/sales-orders' : '/erp/quotes'
const preferencesPath = props.documentKind === 'sales-order' ? '/api/sales-orders/preferences' : '/api/quotes/preferences'
const key = computed(() => documentDesignDraftKey(scope.companyId.value, props.documentKind))
const preferences = ref<QuotePreferences | null>(null), company = ref<any>(null), savedDesign = ref('')
const loading = ref(true), saving = ref(false), error = ref(''), canManage = ref(false)
let version = 0
const defaultReturn = () => `${basePath}?entryCompany=${encodeURIComponent(scope.companyId.value)}`
function retainDraft() {
  if (!preferences.value) return
  drafts.value[key.value] = { preferences: preferences.value, savedDesign: savedDesign.value, returnTo: drafts.value[key.value]?.returnTo || defaultReturn() }
}
async function load() {
  const request = ++version; loading.value = true; error.value = ''; canManage.value = false
  try {
    await scope.ready
    const result = await scope.fetch<any>(preferencesPath)
    if (request !== version) return
    canManage.value = result.canManage === true
    if (!canManage.value) { error.value = 'Administrators, managers and accountants can edit print designs.'; return }
    const pending = drafts.value[key.value]
    preferences.value = normalizeQuotePreferences(pending?.preferences || result.preferences)
    savedDesign.value = JSON.stringify(normalizeQuotePreferences(result.preferences).documentDesign)
    company.value = result.company || scope.auth.session.value
    retainDraft()
  } catch (cause) { if (request === version) error.value = billingErrorMessage(cause) }
  finally { if (request === version) loading.value = false }
}
async function save() {
  if (loading.value || saving.value || !canManage.value || !preferences.value) return
  saving.value = true; error.value = ''
  try {
    const value = normalizeQuotePreferences(preferences.value)
    await scope.fetch(preferencesPath, { method: 'PUT', body: value })
    savedDesign.value = JSON.stringify(value.documentDesign)
    retainDraft()
    toast.add({ title: `${documentName} design saved`, color: 'green' })
  } catch (cause) { error.value = billingErrorMessage(cause) }
  finally { saving.value = false }
}
function back() {
  if (saving.value) return
  retainDraft()
  return navigateTo(drafts.value[key.value]?.returnTo || defaultReturn())
}
onMounted(load)
onBeforeUnmount(() => { version++; retainDraft() })
</script>
<template>
  <DesignEditor v-if="!loading && canManage && preferences" v-model="preferences.documentDesign" :company="company" :busy="saving" :error="error" :saved-design="savedDesign" :document-kind="documentKind" @save="save" @close="back" />
  <main v-else class="designer-page-state" :aria-label="`${documentName} designer`" :aria-busy="loading">
    <p v-if="loading" role="status">Loading {{ documentName.toLowerCase() }} design…</p>
    <template v-else><p role="alert">{{ error }}</p><div><button type="button" @click="back">Back</button><button type="button" @click="load">Retry</button></div></template>
  </main>
</template>
<style scoped>
.designer-page-state { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: #f8fafc; color: #475569; font-size: 14px; }
.designer-page-state div { display: flex; gap: 10px; }.designer-page-state button { border: 1px solid #cbd5e1; padding: 8px 14px; border-radius: 6px; background: white; }
</style>
