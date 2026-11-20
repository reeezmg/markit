<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import type { DocumentTableStyle } from '~/utils/document-table'
const props = defineProps<{ modelValue?: DocumentTableStyle; defaults: DocumentTableStyle; images?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: DocumentTableStyle] }>()
const local = shallowRef<DocumentTableStyle>(props.modelValue || {})
watch(() => props.modelValue, value => { local.value = value || {} }, { flush: 'sync' })
function update(value: DocumentTableStyle) { local.value = value; emit('update:modelValue', value) }
function set(key: keyof DocumentTableStyle, event: Event, numeric = true) {
  const raw = (event.target as HTMLInputElement).value
  const value = numeric ? (raw === '' ? undefined : Number(raw)) : raw
  if (numeric && value !== undefined && !Number.isFinite(value)) return
  update({ ...local.value, [key]: value })
}
const value = (key: keyof DocumentTableStyle) => {
  const setting = local.value[key] ?? props.defaults[key]
  return typeof setting === 'number' ? Math.round(setting * 100) / 100 : setting
}
</script>
<template>
  <section class="table-design-properties" aria-label="Table sizing and appearance">
    <h4>Table sizing &amp; appearance</h4>
    <p>Heights are minimums. Rows grow to fit text and images.</p>
    <div class="table-control-grid">
      <label>Minimum row height (mm)<input :value="value('rowHeight') ?? 0" type="number" min="0" max="100" step="0.5" aria-label="Minimum table row height" @input="set('rowHeight', $event)" /></label>
      <label>Minimum header height (mm)<input :value="value('headerHeight') ?? 0" type="number" min="0" max="40" step="0.5" aria-label="Minimum table header height" @input="set('headerHeight', $event)" /></label>
      <label>Cell padding (mm)<input :value="value('cellPadding')" type="number" min="0" max="10" step="0.25" aria-label="Table cell padding" @input="set('cellPadding', $event)" /></label>
      <label>Vertical alignment<select :value="value('verticalAlign') || 'top'" aria-label="Table vertical alignment" @change="set('verticalAlign', $event, false)"><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label>
      <label>Body text (pt)<input :value="value('fontSize')" type="number" min="6" max="32" step="0.5" aria-label="Table body text size" @input="set('fontSize', $event)" /></label>
      <label>Header text (pt)<input :value="value('headerFontSize')" type="number" min="6" max="32" step="0.5" aria-label="Table header text size" @input="set('headerFontSize', $event)" /></label>
      <label>Border thickness (mm)<input :value="value('borderWidth')" type="number" min="0.1" max="2" step="0.1" aria-label="Table border thickness" @input="set('borderWidth', $event)" /></label>
    </div>
    <template v-if="images"><h4>Product images</h4><div class="table-control-grid">
      <label>Image width (mm)<input :value="value('imageWidth') || 13" type="number" min="5" max="80" step="1" aria-label="Table image width" @input="set('imageWidth', $event)" /></label>
      <label>Image height (mm)<input :value="value('imageHeight') || 13" type="number" min="5" max="80" step="1" aria-label="Table image height" @input="set('imageHeight', $event)" /></label>
      <label>Image fit<select :value="value('imageFit') || 'contain'" aria-label="Table image fit" @change="set('imageFit', $event, false)"><option value="contain">Fit whole image</option><option value="cover">Fill image box</option></select></label>
      <label>Image placement<select :value="value('imagePlacement') || 'beside'" aria-label="Table image placement" @change="set('imagePlacement', $event, false)"><option value="beside">Beside description</option><option value="above">Above description</option></select></label>
    </div><p>Image boxes shrink to fit their column. Widen the description column for larger images.</p></template>
    <button type="button" @click="update({})">Reset table sizing</button>
  </section>
</template>
<style scoped>
.table-design-properties{grid-column:1/-1;display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#0f172a}.table-control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}label{display:flex;flex-direction:column;gap:5px;font-size:12px;min-width:0}input,select{width:100%;min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:5px;background:white;color:#0f172a}h4{font-size:13px;font-weight:650}p{font-size:12px;color:#64748b}button{padding:7px;border:1px solid #cbd5e1;border-radius:5px;background:white;font-size:12px}
</style>
