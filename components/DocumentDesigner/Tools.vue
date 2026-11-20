<script setup lang="ts">
import { ref } from 'vue'
import { customSectionText, type CustomDocumentSection, type DesignerOption } from '~/utils/document-designer'
defineProps<{ templates: DesignerOption[]; papers: DesignerOption[]; paper: string; disabled?: boolean; limitReached?: boolean }>()
const emit = defineEmits<{ template: [value: string]; paper: [value: string]; section: [section: CustomDocumentSection] }>()
const chosen = ref(''), title = ref(''), body = ref(''), style = ref('bullets'), border = ref(false)
function add() {
  if (!title.value.trim() && !body.value.trim()) return
  emit('section', { text: customSectionText(title.value, body.value, style.value), heading: !!title.value.trim(), border: border.value })
  title.value = ''; body.value = ''
}
</script>
<template>
  <fieldset class="document-tools" :disabled="disabled">
    <h3>Design tools</h3>
    <label>Start from a template<select v-model="chosen" aria-label="Design template"><option value="">Choose a template</option><option v-for="option in templates" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
    <div v-if="chosen" class="template-choice"><p>Applying a template replaces this draft’s layout. Undo restores your previous design.</p><button type="button" @click="emit('template', chosen); chosen = ''">Apply template</button><button type="button" @click="chosen = ''">Cancel</button></div>
    <label>Page size<select :value="paper" aria-label="Document page size" @change="emit('paper', ($event.target as HTMLSelectElement).value)"><option v-for="option in papers" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
    <details><summary>Add custom section</summary><div class="section-form">
      <label>Section heading<input v-model="title" maxlength="100" placeholder="Features of our plant" /></label>
      <label>Section content<textarea v-model="body" maxlength="1800" rows="5" placeholder="Enter each feature on a new line" /></label>
      <label>Content style<select v-model="style"><option value="paragraph">Paragraphs</option><option value="bullets">Bullet list</option><option value="numbered">Numbered list</option></select></label>
      <label class="check"><input v-model="border" type="checkbox" /> Section border</label>
      <button type="button" :disabled="limitReached || (!title.trim() && !body.trim())" @click="add">Add section</button>
      <p v-if="limitReached" role="status">The section limit has been reached.</p>
    </div></details>
  </fieldset>
</template>
<style scoped>
.document-tools,.section-form{display:flex;flex-direction:column;gap:12px;min-width:0}.document-tools{padding:14px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;color:#0f172a}.document-tools h3{font-size:14px;font-weight:650}label{display:flex;flex-direction:column;gap:5px;font-size:13px}input:not([type=checkbox]),textarea,select{width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;background:white;color:#0f172a}button{padding:8px 12px;border:1px solid #94a3b8;border-radius:6px;background:white;font-size:13px}button:disabled{opacity:.45}summary{cursor:pointer;font-size:13px;font-weight:600}.section-form{padding-top:12px}.check{flex-direction:row;align-items:center}.template-choice p,p{font-size:12px;color:#475569}.template-choice button{margin:6px 6px 0 0}
</style>
