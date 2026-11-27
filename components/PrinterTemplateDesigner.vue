<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { STANDARD_LABEL_ID, CLASSIC_RECEIPT_ID, NO_TAX_RECEIPT_ID, classicReceiptTemplate, noTaxReceiptTemplate, defaultTemplate, emptyPrintSettings, printSettingsSchema, type PrintSettings } from '~/utils/print-templates'
import { labelSampleData, type LabelVariable } from '~/utils/label-variables'
import { useDesignerHistory } from '~/utils/designer-history'
import { usePrintDesignDraft } from '~/composables/usePrintDesignDraft'
import { upgradeReceiptToolTemplate } from '~/utils/receipt-tool-template'
import { upgradeLabelToolTemplate } from '~/utils/label-tool-template'
import { cachePrintSettings } from '~/utils/load-print-template.client'
import { renderPrintTemplate, downloadTemplatePDF } from '~/utils/print-template-renderer.client'
import { usePrint } from '~/composables/usePrintBill'
import PrintEditor from './DocumentDesigner/PrintEditor.vue'
import PrinterDesignerWorkspace from './PrinterDesignerWorkspace.vue'
import ThermalReceipt from './ThermalReceipt.vue'
const props = defineProps<{ receiptData: any; labelData: any; hideOriginalReceipt?: boolean; workspace?: boolean; templateId?: string; templateKind?: string }>()
const scope = useCompanyScope('form'), $fetch = scope.fetch, route = useRoute(), drafts = usePrintDesignDraft(), printer = usePrint()
const entryPath = route.fullPath, ownerId = ref('')
const previewData = ref<any>(null)
const settings = ref<PrintSettings>(emptyPrintSettings()), saved = ref(''), selectedId = ref(''), loading = ref(true), busy = ref(false), error = ref(''), message = ref('')
const history = useDesignerHistory(settings), customVariables = ref<LabelVariable[]>([]), variableError = ref('')
const presetPreview = ref<'no-tax' | 'classic' | null>(null), choosingReceiptBase = ref(false), receiptBaseChooser = ref<HTMLElement | null>(null)
const companyId = computed(() => ownerId.value || scope.auth.session.value?.companyId || ''), canSave = computed(() => ['admin', 'manager'].includes(scope.auth.session.value?.role || ''))
const design = computed(() => settings.value.templates.find(t => t.id === selectedId.value)), libraryTemplates = computed(() => settings.value.templates)
const dirty = computed(() => saved.value !== JSON.stringify(settings.value)), needsReceiptChoice = computed(() => props.hideOriginalReceipt && settings.value.receiptId === null)
const sampleLabel = computed(() => labelSampleData(props.labelData, customVariables.value))
const classicSample = computed(() => ({ ...props.receiptData, isTaxIncluded: true, paymentMethod: 'UPI', upiId: props.receiptData.upiId || 'preview@upi',
  entries: [{ description: 'FOOTWEAR', hsn: '64039990', qty: 1, mrp: 250, value: 250, discount: 0, tax: 5, tvalue: 250 }, { description: 'LADIES PANT', hsn: '6101', qty: 1, mrp: 290, value: 290, discount: 0, tax: 12, tvalue: 290 }],
  subtotal: 540, tqty: 2, tvalue: 540, ttvalue: 540, grandTotal: 540, discount: 0, tdiscount: 0, thankYouNote: 'Thank you please visit us again' }))
const sampleReceipt = computed(() => { const data = design.value?.fontFamily === 'thermal' ? classicSample.value : props.receiptData; return { ...data, entries: (data.entries || []).map((e: any) => ({ ...labelSampleData(e, customVariables.value), ...e, labelVariablesLoaded: true })) } })
const presetData = computed(() => ({ ...classicSample.value, printTemplate: presetPreview.value === 'no-tax' ? noTaxReceiptTemplate() : classicReceiptTemplate() }))
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
let loadVersion = 0, receiptChooserTrigger: HTMLElement | null = null
function retain() {
  if (!saved.value || !companyId.value) return
  drafts.value[companyId.value] = { settings: clone(settings.value), saved: saved.value, selectedId: selectedId.value, returnTo: props.workspace ? drafts.value[companyId.value]?.returnTo || `/settings/printer?entryCompany=${encodeURIComponent(companyId.value)}` : entryPath }
}
async function load() {
  const version = ++loadVersion; loading.value = true; error.value = ''
  try {
    await scope.ready
    ownerId.value = scope.auth.session.value?.companyId || ''
    const fresh = printSettingsSchema.parse(await $fetch<PrintSettings>('/api/settings/print-templates'))
    if (version !== loadVersion) return
    const pending = drafts.value[companyId.value]
    const hasPendingChanges = pending && JSON.stringify(pending.settings) !== pending.saved
    settings.value = printSettingsSchema.parse(hasPendingChanges ? pending.settings : fresh); saved.value = hasPendingChanges ? pending.saved : JSON.stringify(fresh)
    selectedId.value = props.workspace ? props.templateId || '' : pending?.selectedId || settings.value.templates[0]?.id || ''
    history.reset(); previewData.value = null; cachePrintSettings(companyId.value, fresh)
    if (props.workspace && canSave.value && design.value) {
      const upgraded = design.value.kind === 'label' ? upgradeLabelToolTemplate(design.value) : upgradeReceiptToolTemplate(design.value)
      if (upgraded !== design.value) {
        history.begin(); settings.value.templates.splice(settings.value.templates.findIndex(t => t.id === upgraded.id), 1, upgraded); history.end()
        message.value = upgraded.kind === 'label' ? 'Updated this label with Arial and an editable barcode value. Save design to keep it, or use Undo to restore the previous layout.' : 'Updated this receipt to editable layers. Save design to keep it, or use Undo to restore the previous layout.'
      }
    }
    if (props.workspace && (!design.value || design.value.kind !== props.templateKind)) error.value = 'This design is unavailable. Return to Printer Settings to choose a design.'
  } catch (cause: any) { if (version === loadVersion) error.value = cause?.data?.statusMessage || cause.message || 'Could not load print designs.' }
  finally { if (version === loadVersion) loading.value = false }
}
async function loadCustomVariables() { variableError.value = ''; try { customVariables.value = await $fetch<LabelVariable[]>('/api/settings/label-variables') } catch { variableError.value = 'Custom fields could not be loaded.' } }
async function chooseReceiptBase(event: Event) { receiptChooserTrigger = event.currentTarget as HTMLElement; choosingReceiptBase.value = true; await nextTick(); receiptBaseChooser.value?.focus() }
async function cancelReceiptBase() { choosingReceiptBase.value = false; await nextTick(); receiptChooserTrigger?.focus() }
function openEditor() {
  if (!design.value) return
  retain()
  return navigateTo({ path: `/print-design/${design.value.kind}/${encodeURIComponent(design.value.id)}`, query: { entryCompany: companyId.value } })
}
function create(kind: 'receipt' | 'label', base: 'tax' | 'no-tax' = 'tax') {
  if (busy.value || settings.value.templates.length >= 12) return
  const template = kind === 'label' ? defaultTemplate(kind) : { ...(base === 'no-tax' ? noTaxReceiptTemplate() : classicReceiptTemplate()), id: crypto.randomUUID(), name: base === 'no-tax' ? 'My No Tax Receipt' : 'My Tax Receipt' }
  settings.value.templates.push(template); selectedId.value = template.id; choosingReceiptBase.value = false; return openEditor()
}
function edit(id: string) { selectedId.value = id; return openEditor() }
watch(selectedId, () => { previewData.value = null })
function selectDesign(id: string) { selectedId.value = id; return openEditor() }
function closeEditor() { if (busy.value) return; retain(); return navigateTo(drafts.value[companyId.value]?.returnTo || `/settings/printer?entryCompany=${encodeURIComponent(companyId.value)}`) }
async function save() {
  if (busy.value || !canSave.value) return
  error.value = ''; message.value = ''; busy.value = true
  try {
    const checked = printSettingsSchema.parse(settings.value)
    for (const t of checked.templates) await renderPrintTemplate(t, t.kind === 'label' ? sampleLabel.value : { ...sampleReceipt.value, entries: sampleReceipt.value.entries })
    settings.value = printSettingsSchema.parse(await $fetch<PrintSettings>('/api/settings/print-templates', { method: 'PUT', body: checked }))
    saved.value = JSON.stringify(settings.value); history.reset(); retain(); cachePrintSettings(companyId.value, settings.value); message.value = 'Designs saved for this company.'
  } catch (cause: any) { error.value = cause?.data?.statusMessage || cause.message || 'Could not save designs.' }
  finally { busy.value = false }
}
async function output(mode: 'pdf' | 'print', preset = false) {
  const t = preset ? presetData.value.printTemplate : design.value
  if (!t || busy.value) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    const data = preset ? presetData.value : previewData.value || (t.kind === 'receipt' ? sampleReceipt.value : sampleLabel.value)
    if (mode === 'pdf') await downloadTemplatePDF(t, data, `${t.kind}-sample.pdf`)
    else if (t.kind === 'receipt') await printer.printBill(data, t)
    else await printer.printLabel([data], `${t.width}x${t.height}mm`, t)
    if (mode === 'print') message.value = 'Sample print requested.'
  } catch (cause: any) { error.value = cause.message || 'Could not output the design.' } finally { busy.value = false }
}
const presetOutput = (mode: 'pdf' | 'print') => output(mode, true)
function discard() { if (busy.value) return; settings.value = JSON.parse(saved.value); history.reset(); selectedId.value = settings.value.templates[0]?.id || ''; error.value = ''; message.value = ''; retain() }
function restoreHistory(direction: 'undo' | 'redo') { if (!busy.value) { history[direction](); error.value = ''; message.value = '' } }
onMounted(() => { load(); loadCustomVariables() })
onBeforeUnmount(() => { loadVersion++; retain() })
</script>

<template>
  <PrintEditor v-if="workspace && !loading && canSave && design && design.kind === templateKind" :settings="settings" :selected-id="selectedId" :saved="saved" :busy="busy" :can-save="canSave" :error="error" :message="message" :sample-label="sampleLabel" :sample-receipt="sampleReceipt" :variables="customVariables" :variable-error="variableError" @close="closeEditor" @save="save" @output="output" @history="restoreHistory" @gesture="active => active ? history.begin() : history.end()" @select="selectDesign" @retry-variables="loadCustomVariables" @preview-data="previewData = $event" />
  <main v-else-if="workspace" class="print-page-state" :aria-busy="loading"><p v-if="loading" role="status">Loading print design...</p><p v-else role="alert">{{ !canSave ? 'Administrators and managers can edit print designs.' : error || 'This design is unavailable.' }}</p><div><button type="button" :disabled="busy" @click="closeEditor">Back</button><button v-if="!loading && canSave" type="button" @click="load">Retry</button></div></main>
  <section v-else class="mb-8 pb-8 border-b-2 border-gray-300 dark:border-gray-600 designer">
    <h2 class="text-lg font-semibold">Receipt &amp; Label Designer</h2>
    <p class="text-sm text-gray-500 mb-4">Create and customize receipts and product labels for your company.</p>
    <p v-if="loading" role="status">Loading print designs…</p>
    <p v-if="error" role="alert" class="text-red-600 mb-3">{{ error }}</p>
    <p v-if="message" role="status" class="text-green-700 mb-3">{{ message }}</p>
    <UButton v-if="!loading && !saved" label="Retry loading designs" @click="load" />
    <template v-if="!loading && saved">
      <div class="design-toolbar">
        <div class="design-toolbar-actions">
          <UButton label="New receipt" :disabled="busy || settings.templates.length >= 12" @click="chooseReceiptBase" />
          <UButton label="New label" variant="soft" :disabled="busy || settings.templates.length >= 12" @click="create('label')" />
        </div>
        <div class="design-toolbar-actions">
          <span class="save-status" role="status">{{ dirty ? 'Unsaved changes' : 'All changes saved' }}</span>
          <UButton v-if="dirty" label="Discard changes" variant="soft" :disabled="busy" @click="discard" />
          <UButton label="Save designs" :loading="busy" :disabled="!canSave || !dirty" @click="save" />
        </div>
      </div>
      <p v-if="!canSave" class="text-sm mb-3">An administrator or manager can save company designs.</p>
      <div v-if="choosingReceiptBase" ref="receiptBaseChooser" class="receipt-base-chooser" tabindex="-1" role="group" aria-labelledby="receipt-base-title" @keydown.esc.stop="cancelReceiptBase">
        <div class="section-heading"><div><h3 id="receipt-base-title">Choose a starting template</h3><p>You can change the layout, text and columns in the editor.</p></div><button type="button" @click="cancelReceiptBase">Cancel</button></div>
        <div class="receipt-base-grid">
          <button type="button" class="receipt-base-card" :disabled="busy || settings.templates.length >= 12" @click="create('receipt', 'tax')"><strong>Tax Receipt</strong><span>Item tax details, tax summary and payment QR.</span><span class="receipt-base-link">Start with Tax Receipt &rarr;</span></button>
          <button type="button" class="receipt-base-card" :disabled="busy || settings.templates.length >= 12" @click="create('receipt', 'no-tax')"><strong>No Tax Receipt</strong><span>Six-column item table with no tax summary.</span><span class="receipt-base-link">Start with No Tax Receipt &rarr;</span></button>
        </div>
      </div>
      <div class="design-defaults">
        <div class="section-heading"><div><h3>Print defaults</h3><p>Choose which design to use for each print. Save to apply your changes.</p></div></div>
        <div class="default-selectors">
          <label>Default receipt<select v-model="settings.receiptId" aria-label="Default receipt">
            <option v-if="settings.receiptId === null" :value="null" disabled>Choose a receipt design</option>
            <optgroup label="Base templates"><option :value="NO_TAX_RECEIPT_ID">No Tax Receipt</option><option :value="CLASSIC_RECEIPT_ID">Tax Receipt</option></optgroup>
            <optgroup v-if="settings.templates.some(t => t.kind === 'receipt')" label="Your receipt designs"><option v-for="t in settings.templates.filter(t => t.kind === 'receipt')" :key="t.id" :value="t.id">{{ t.name }}</option></optgroup>
          </select></label>
          <label>Default product label<select v-model="settings.labelId" aria-label="Default product label">
            <option v-if="settings.labelId === null" :value="null" disabled>Choose a label design</option>
            <optgroup label="Base templates"><option :value="STANDARD_LABEL_ID">Standard Label (50 x 38 mm)</option></optgroup>
            <optgroup v-if="settings.templates.some(t => t.kind === 'label')" label="Your label designs"><option v-for="t in settings.templates.filter(t => t.kind === 'label')" :key="t.id" :value="t.id">{{ t.name }}</option></optgroup>
          </select></label>
        </div>
        <p v-if="needsReceiptChoice" class="default-help">Your previous receipt is still active. Choose a base template or a saved receipt to replace it.</p>
        <details class="base-previews"><summary>Preview the base templates</summary><div class="design-toolbar-actions">
          <UButton label="Preview No Tax Receipt" variant="soft" @click="presetPreview = 'no-tax'" />
          <UButton label="Preview Tax Receipt" variant="soft" @click="presetPreview = 'classic'" />
        </div></details>
      </div>
      <PrinterDesignerWorkspace v-if="presetPreview" :fullscreen="true" :open="true" kind="receipt" :title="presetPreview === 'no-tax' ? 'No Tax Receipt' : 'Tax Receipt'" :busy="busy" :dirty="dirty" @close="presetPreview = null">
        <template #actions>
          <UButton label="Use for company" :disabled="busy || !canSave" @click="settings.receiptId = presetPreview === 'no-tax' ? NO_TAX_RECEIPT_ID : CLASSIC_RECEIPT_ID; save()" />
          <UButton label="Download PDF" :disabled="busy" @click="presetOutput('pdf')" />
          <UButton label="Test print" :disabled="busy" @click="presetOutput('print')" />
        </template>
        <div v-if="presetPreview" class="h-full overflow-auto">
          <p v-if="error" role="alert" class="text-red-600 mb-3">{{ error }}</p>
          <p v-if="message" role="status" class="mb-3">{{ message }}</p>
          <div class="preset-receipt preset-receipt-classic"><ThermalReceipt :data="presetData" /></div>
          <p class="text-sm text-gray-500 mt-3 text-center">Sample receipt. Actual bills use your company details, tax settings and UPI address.</p>
        </div>
      </PrinterDesignerWorkspace>
      <div class="section-heading"><div><h3>Your designs</h3><p>Open a receipt or product label to edit it.</p></div></div>
      <p v-if="!libraryTemplates.length" class="empty-designs">No custom designs yet. Choose New receipt or New label to create one.</p>
      <div v-else class="template-library">
        <button v-for="t in libraryTemplates" :key="t.id" type="button" class="template-card" :class="{ 'template-card-selected': t.id === selectedId }" :disabled="busy" @click="edit(t.id)">
          <span class="template-card-icon" aria-hidden="true">{{ t.kind === 'label' ? '▤' : '▥' }}</span>
          <span class="template-card-description"><strong>{{ t.name }}<small v-if="settings.receiptId === t.id || settings.labelId === t.id" class="default-badge">Default</small></strong><span>{{ t.kind === 'label' ? `${t.width} × ${t.height} mm label` : `${t.width} mm receipt` }} · {{ t.dpi }} DPI</span></span>
          <span class="template-card-link">Edit {{ t.kind }} →</span>
        </button>
      </div>
      <details class="printer-help"><summary>Printer setup tips</summary><p>Match the printable width and resolution to your printer. Connect and assign your WebUSB printers above. Saved company defaults are used by billing and product printing.</p></details>

    </template>
  </section>
</template>

<style scoped>
.selection-toolbar { flex-shrink: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 8px 12px; background: white; border: 1px solid #e2e8f0; border-top: 0; font-size: 12px; }
.selection-toolbar strong { flex: 1; min-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.selection-toolbar button { padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 5px; }
.selection-toolbar button[aria-pressed=true] { color: #c2410c; background: #fff7ed; }
.canvas-tip { font-size: 11px; color: #64748b; margin-top: 8px; }
.canvas-toolbar select { width: 78px; margin: 0; padding: 4px; font-size: 12px; }
.preview-hit-area.preview-hit-guide { border: 1px dashed #94a3b855; }
.drop-marker { position: absolute; left: 0; right: 0; height: 3px; background: #f97316; pointer-events: none; z-index: 5; }
.drop-marker span { position: absolute; right: 0; bottom: 3px; padding: 3px 6px; background: #c2410c; color: white; font-size: 11px; border-radius: 3px; }
:global(.dark) .selection-toolbar { background: #111827; border-color: #334155; }

.design-toolbar, .design-toolbar-actions, .section-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.design-toolbar { justify-content: space-between; margin-bottom: 24px; }
.save-status { font-size: 12px; color: #64748b; }
.section-heading { justify-content: space-between; margin-bottom: 14px; }
.section-heading h3 { font-size: 14px; font-weight: 600; }
.section-heading p, .default-help, .printer-help p { margin-top: 4px; font-size: 13px; color: #64748b; }
.design-defaults { padding: 18px; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px; }
.default-selectors, .receipt-base-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.base-previews { margin-top: 16px; font-size: 13px; }
.base-previews summary, .printer-help summary { cursor: pointer; color: #475569; }
.base-previews .design-toolbar-actions { margin-top: 12px; }
.receipt-base-chooser { padding: 20px; margin-bottom: 24px; border: 1px solid #fdba74; background: #fff7ed; color: #0f172a; border-radius: 12px; }
.receipt-base-chooser:focus { outline: 2px solid #fb923c; outline-offset: 3px; }
.receipt-base-card { display: grid; gap: 8px; text-align: left; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background: white; color: #0f172a; }
.receipt-base-card:hover { border-color: #f97316; }
.receipt-base-card > span { font-size: 13px; color: #64748b; }
.receipt-base-card .receipt-base-link { margin-top: 8px; color: #c2410c; font-weight: 600; }
.empty-designs { padding: 24px; border: 1px dashed #cbd5e1; border-radius: 12px; font-size: 13px; color: #64748b; margin-bottom: 20px; }
.default-badge { margin-left: 8px; padding: 3px 6px; background: #fff7ed; color: #c2410c; border-radius: 4px; font-size: 10px; font-weight: 500; }
.printer-help { margin-top: 16px; font-size: 12px; }
@media (max-width: 600px) { .default-selectors, .receipt-base-grid { grid-template-columns: 1fr; } .design-toolbar { align-items: flex-start; flex-direction: column; } }

.receipt-style { display: flex; padding: 3px; border: 1px solid #fed7aa; border-radius: 8px; gap: 3px; }
.receipt-style button { padding: 6px 12px; border-radius: 5px; font-size: 14px; }
.receipt-style button[aria-pressed=true] { background: #f97316; color: white; }

.table-controls { display: grid; gap: 12px; }
.table-controls > p { font-size: 12px; color: #64748b; }
.table-column { display: grid; gap: 10px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; }
.table-column-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 13px; }
.table-column-heading button { padding: 4px 6px; }
.designer label { display: block; font-size: 0.875rem; }
.designer input:not([type=checkbox]), .designer select, .designer textarea { display: block; width: 100%; margin-top: 4px; border: 1px solid #9ca3af; border-radius: 6px; padding: 6px 8px; background: transparent; }
.designer input[type=checkbox] { width: 16px; height: 16px; }
.designer button:disabled { opacity: 0.45; }
.template-library { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 24px; }
.template-card { display: flex; align-items: center; gap: 12px; text-align: left; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; transition: border-color .15s, box-shadow .15s; }
.template-card:hover, .template-card-selected { border-color: #60a5fa; box-shadow: 0 0 0 1px #60a5fa; }
.template-card-icon { display: grid; place-items: center; width: 40px; height: 44px; border-radius: 8px; color: #2563eb; background: #eff6ff; font-size: 24px; }
.template-card-description { flex: 1; min-width: 0; display: grid; gap: 4px; }
.template-card-description strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; }
.template-card-description span { font-size: 12px; color: #64748b; }
.template-card-link { font-size: 12px; color: #2563eb; white-space: nowrap; }
.editor-layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(320px, 1fr); gap: 12px; }
.editor-sidebar { min-width: 0; min-height: 0; margin: 0; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; background: white; display: flex; flex-direction: column; overflow: hidden; }
.editor-tabs { display: flex; flex: none; gap: 6px; padding: 8px; border-bottom: 1px solid #e2e8f0; }
.editor-tabs button { flex: 1; padding: 10px 12px; border-radius: 7px; font-size: 14px; font-weight: 600; color: #64748b; }
.editor-tabs button[aria-pressed=true] { color: #c2410c; background: #fff7ed; }
.editor-tabs span { margin-left: 6px; font-size: 11px; }
.controls-scroll { overflow: auto; min-height: 0; padding: 20px; scrollbar-gutter: stable; }
.setup-controls, .content-controls { display: grid; gap: 16px; }
.control-heading h3, .properties-heading h3 { font-size: 15px; font-weight: 650; margin: 0; }
.control-heading p { font-size: 12px; color: #64748b; margin: 5px 0 0; }
.control-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.three-columns { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.add-tools, .paper-presets, .design-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.paper-presets button { padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 7px; font-size: 13px; }
.paper-presets button[aria-pressed=true] { background: #fff7ed; border-color: #fb923c; color: #c2410c; }
.paper-presets span { width: 100%; font-size: 12px; color: #64748b; }
.designer .default-choice, .designer .bold-choice { display: flex; align-items: center; gap: 8px; }
.bold-choice { padding-top: 22px; }
.element-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; max-height: 160px; overflow: auto; }
.element-row { display: flex; min-width: 0; align-items: center; border: 1px solid #e2e8f0; border-radius: 7px; }
.element-selected { border-color: #fb923c; background: #fff7ed; color: #9a3412; }
.element-select { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1; text-align: left; }
.element-select > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.element-number { color: #94a3b8; font-size: 11px; }
.element-properties { display: grid; gap: 14px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
.properties-heading { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.properties-heading h3 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.properties-heading span { flex: none; font-size: 11px; color: #c2410c; background: #fff7ed; border-radius: 4px; padding: 4px 6px; }
.position-controls { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
.position-controls summary { cursor: pointer; font-size: 13px; font-weight: 600; }
.position-controls summary span { float: right; font-size: 11px; font-weight: 400; color: #64748b; }
.position-controls[open] summary { margin-bottom: 12px; }
.empty-selection { padding: 16px; background: #f8fafc; color: #64748b; border-radius: 8px; font-size: 13px; }
.design-actions { padding-top: 16px; border-top: 1px solid #e2e8f0; }
.variable-control { min-width: 0; }
.variable-label { display: block; font-size: 14px; margin-bottom: 5px; }
.variable-trigger { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 6px; text-align: left; background: white; font-size: 14px; }
.variable-trigger small { display: block; color: #64748b; font-size: 11px; }
.variable-picker { padding: 10px; border: 1px solid #fdba74; border-radius: 8px; margin-top: 6px; background: #fff; }
.variable-results { max-height: 220px; overflow: auto; margin-top: 8px; }
.variable-results h4 { position: sticky; top: 0; background: #f8fafc; padding: 7px; font-size: 11px; color: #64748b; font-weight: 600; }
.variable-results button { display: block; width: 100%; padding: 8px; text-align: left; border-radius: 5px; font-size: 13px; }
.variable-results button:hover, .variable-results button[aria-pressed=true] { background: #fff7ed; color: #c2410c; }
.variable-note { margin-top: 6px; font-size: 11px; color: #64748b; overflow-wrap: anywhere; }
.variable-note button, .variable-clear { color: #c2410c; text-decoration: underline; font-size: 12px; }
.variable-clear { margin-top: 10px; }
:global(.dark) .variable-trigger, :global(.dark) .variable-picker { background: #0f172a; border-color: #475569; }
:global(.dark) .variable-results h4 { background: #1e293b; color: #cbd5e1; }
.panel-title { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: #64748b; }
.designer input:not([type=checkbox]), .designer select, .designer textarea { padding: 9px 10px; border-color: #cbd5e1; background: #fff; transition: box-shadow .15s; }
.designer input:focus-visible, .designer select:focus-visible, .designer textarea:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
.element-list button { padding: 6px; font-size: 13px; }
.content-body { display: grid; gap: 16px; }
@media (min-width: 1100px) {
  .content-body { grid-template-columns: minmax(0, 0.85fr) minmax(0, 2fr); align-items: start; }
  .element-list { grid-template-columns: 1fr; max-height: 280px; }
  .element-properties { border-top: 0; border-left: 1px solid #e2e8f0; padding: 0 0 0 16px; }
  .properties-heading { align-items: start; flex-direction: column; gap: 3px; }
}
.editor-preview { order: -1; display: flex; flex-direction: column; min-height: 0; }
.preset-receipt { width: fit-content; max-width: 100%; margin: 0 auto; }
.preset-receipt-classic { width: min(100%, 420px); }
.preset-receipt-classic :deep(img[alt="Receipt"]) { width: 100% !important; }
.preview-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; flex: none; }
.preview-heading .canvas-state { flex: 1; font-size: 15px; font-weight: 600; }
.preview-paper { position: relative; background: white; box-shadow: 0 3px 12px #0f172a1a; }
.preview-image { position: absolute; inset: 0; width: 100%; height: 100%; }
.preview-hit-area { position: absolute; touch-action: none; border: 0; padding: 0; background: transparent; }
.preview-hit-area:hover { outline: 1px solid #fb923c; }
.preview-hit-selected { outline: 2px solid #f97316; }
.resize-selection { position: absolute; pointer-events: none; z-index: 3; outline: 2px solid #f97316; }
.resize-handle { position: absolute; width: 14px; height: 14px; transform: translate(-50%, -50%); pointer-events: auto; touch-action: none; border: 0; padding: 0; background: transparent; }
.resize-handle::after { content: ''; position: absolute; width: 9px; height: 9px; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border: 2px solid #f97316; border-radius: 2px; }
.resize-handle[data-handle=n], .resize-handle[data-handle=s] { width: calc(100% - 14px); }
.resize-handle[data-handle=e], .resize-handle[data-handle=w] { height: calc(100% - 14px); }
.resize-handle:hover::after, .resize-handle:focus-visible::after { background: #ffedd5; box-shadow: 0 0 0 2px #fb923c66; }
.canvas-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 12px 12px 0 0; background: #fff; font-size: 12px; color: #64748b; }
.canvas-toolbar > select { width: auto; max-width: 220px; min-width: 0; margin: 0; }
.canvas-toolbar div { margin-left: auto; flex-shrink: 0; display: flex; align-items: center; gap: 12px; }
.canvas-toolbar button { flex-shrink: 0; width: 28px; height: 28px; border: 1px solid #cbd5e1; border-radius: 6px; color: #0f172a; font-size: 18px; }
.canvas-toolbar .fit-button { flex: none; white-space: nowrap; width: auto; padding: 0 10px; font-size: 12px; }
.canvas-toolbar .fit-button[aria-pressed=true] { color: #c2410c; border-color: #fb923c; background: #fff7ed; }
.canvas-workbench { touch-action: none; cursor: grab; flex: 1; display: flex; align-items: flex-start; min-height: 350px; max-height: 850px; padding: 24px; overflow: auto; border: 1px solid #e2e8f0; border-top: 0; border-radius: 0 0 12px 12px; background-color: #eef2f6; background-image: radial-gradient(#cbd5e1 1px, transparent 1px); background-size: 16px 16px; }
.canvas-workbench > div { margin: auto; }
.canvas-caption { padding-top: 12px; font-size: 12px; color: #64748b; }
.designer-workspace { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.designer-workspace .editor-layout { flex: 1; min-height: 0; }
.designer-workspace .canvas-workbench { min-height: 0; max-height: none; }
.designer-workspace .canvas-toolbar, .designer-workspace .canvas-caption { flex: none; }
:global(.dark) .template-card, :global(.dark) .editor-sidebar, :global(.dark) .canvas-toolbar { background: #111827; border-color: #334155; }
:global(.dark) .designer input:not([type=checkbox]), :global(.dark) .designer select, :global(.dark) .designer textarea { background: #0f172a; border-color: #475569; }
:global(.dark) .canvas-workbench { background-color: #1e293b; background-image: radial-gradient(#475569 1px, transparent 1px); border-color: #334155; }
:global(.dark) .canvas-toolbar button { color: #e2e8f0; border-color: #475569; }
:global(.dark) .element-selected, :global(.dark) .editor-tabs button[aria-pressed=true], :global(.dark) .properties-heading span, :global(.dark) .paper-presets button[aria-pressed=true] { background: #431407; color: #fdba74; }
:global(.dark) .element-row, :global(.dark) .editor-tabs, :global(.dark) .position-controls, :global(.dark) .element-properties { border-color: #334155; }
@media (max-width: 1000px) { .element-list { grid-template-columns: 1fr; max-height: 135px; } .controls-scroll { padding: 14px; } .canvas-toolbar > span { display: none; } .canvas-toolbar { justify-content: flex-end; } }
@media (max-width: 760px) { .editor-layout { grid-template-columns: 1fr; } .designer-workspace { height: auto; } .designer-workspace .editor-layout { flex: none; } .controls-scroll { overflow: visible; } .designer-workspace .editor-preview { order: -1; height: 75dvh; } .canvas-workbench { min-height: 200px; padding: 20px; } .element-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>


<style scoped>
.print-page-state{min-height:100dvh;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16px;background:#f8fafc}.print-page-state button{padding:8px 14px;border:1px solid #ddd;border-radius:5px;background:white;margin:4px}
</style>
