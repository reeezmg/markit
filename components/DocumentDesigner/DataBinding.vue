<script setup lang="ts">
import { computed, ref } from 'vue'
import { quoteBindingLabel, quoteBindingOptions, type QuoteBindingKind, type QuoteBindingField } from '~/utils/quote-bindings'
const props = defineProps<{ kind: QuoteBindingKind; binding?: string; preview?: string; row?: boolean; protected?: boolean; salesOrder?: boolean; nested?: boolean; text?: string; fields?: QuoteBindingField[]; maxlength?: number; uploadLabel?: string; previewLabel?: string; searchPlaceholder?: string; manualLabel?: string }>()
const emit = defineEmits<{ binding: [value: string]; text: [value: string]; upload: [event: Event] }>()
const search = ref('')
const options = computed(() => props.fields || quoteBindingOptions(props.kind, props.row))
const groups = computed(() => [...new Set(options.value.map(field => field.group))].map(name => ({ name, fields: options.value.filter(field => field.group === name && (field.key === props.binding || `${name} ${quoteBindingLabel(field, props.salesOrder)}`.toLowerCase().includes(search.value.toLowerCase().trim()))) })).filter(group => group.fields.length))
</script>
<template>
  <section class="data-binding" aria-label="Layer data connection">
    <div class="binding-title"><h3>Content</h3><span :class="{ linked: binding, 'live-chip': binding }">{{ binding ? 'Linked' : kind === 'image' ? 'Uploaded image' : manualLabel ? 'Custom value' : 'Custom text' }}</span></div>
    <slot name="before" />
    <label v-if="options.length > 8 && !protected" class="search-label">Find data<input v-model="search" type="search" :placeholder="searchPlaceholder || 'Search customer, total, phone…'" aria-label="Search data fields" /></label>
    <label>Link to data
      <select :value="binding || ''" :disabled="protected" aria-label="Link to data" @change="emit('binding', ($event.target as HTMLSelectElement).value)">
        <option value="">{{ kind === 'image' ? 'Uploaded image' : manualLabel ? 'Custom value' : 'Custom text' }}</option>
        <optgroup v-for="group in groups" :key="group.name" :label="group.name"><option v-for="field in group.fields" :key="field.key" :value="field.key">{{ quoteBindingLabel(field, salesOrder) }}</option></optgroup>
      </select>
    </label>
    <template v-if="binding">
      <slot name="format" />
      <label>Preview <span class="preview-caption">{{ previewLabel || (row ? 'Sample item' : 'Sample document') }}</span></label>
      <div v-if="kind === 'image'" class="image-preview"><img v-if="preview" :src="preview" alt="Linked image preview" referrerpolicy="no-referrer" /><p v-else>No image in the preview data</p></div>
      <p v-else class="live-value" aria-live="polite">{{ preview || 'No value in the preview data' }}</p>
      <p class="binding-help">{{ protected ? 'This required value stays linked to its original data. Add another text layer to show a different field.' : row ? 'Updates for each product row when printed.' : 'Uses the actual document data when printed.' }}</p>
    </template>
    <label v-else-if="kind === 'text'">{{ manualLabel || 'Text' }}<textarea :value="text || ''" rows="3" :maxlength="maxlength || 5000" :aria-label="manualLabel || (nested ? 'Nested layer text' : 'Quote design text')" @input="emit('text', ($event.target as HTMLTextAreaElement).value)" /></label>
    <p v-else-if="kind === 'image'" class="binding-help">Upload an image below, or link to your company logo{{ row ? ' or product image' : '' }}.</p>
    <label v-if="kind === 'image'">{{ binding ? 'Upload a replacement' : 'Upload image' }}<input type="file" accept="image/png,image/jpeg,image/webp" :aria-label="uploadLabel || (nested ? 'Upload nested layer image' : 'Upload quote design image')" @change="emit('upload', $event)" /><span class="binding-help">PNG, JPEG or WebP · up to 10 MB{{ binding ? ' · replaces this data link' : '' }}</span></label>
    <slot />
  </section>
</template>
<style scoped>
.data-binding{display:grid;gap:10px;padding:14px 16px;border-top:1px solid #e8e8e8}.binding-title{display:flex;align-items:center;justify-content:space-between}.binding-title h3{margin:0;font-size:11px;font-weight:650}.binding-title span{font-size:10px;color:#888}.binding-title .linked{color:#0d99ff}label{display:grid;gap:5px;font-size:10px;color:#777}input,select,textarea{box-sizing:border-box;width:100%;min-width:0;padding:8px;border:1px solid #eee;border-radius:4px;background:#f5f5f5;color:#333;font-family:inherit;font-size:11px}select{font-size:11px;cursor:pointer}select:disabled{cursor:default;color:#555;opacity:1}input:focus-visible,select:focus-visible,textarea:focus-visible{outline:1px solid #0d99ff;outline-offset:1px}textarea{font-family:inherit;resize:vertical}.preview-caption{font-size:9px;color:#999}.live-value{margin:0;padding:8px;border-radius:4px;background:#f5f5f5;font-size:11px;line-height:1.5;color:#555;white-space:pre-wrap;overflow-wrap:anywhere}.binding-help{margin:0;font-size:10px;line-height:1.5;color:#888}.image-preview{display:flex;align-items:center;justify-content:center;min-height:64px;border-radius:4px;background:#f5f5f5;padding:8px}.image-preview img{max-width:100%;max-height:80px;object-fit:contain}.image-preview p{font-size:10px;color:#888}
</style>
