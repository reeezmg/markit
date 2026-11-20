<script setup lang="ts">
import { customSectionText } from '~/utils/document-designer'
const props = defineProps<{ text: string; heading?: boolean; border?: boolean; maxlength?: number; textLabel?: string }>()
const emit = defineEmits<{ 'update:text': [value: string]; 'update:heading': [value: boolean]; 'update:border': [value: boolean] }>()
function format(style: string) {
  const [title, ...lines] = props.text.split('\n')
  emit('update:text', customSectionText(props.heading ? title : '', props.heading ? lines.join('\n') : props.text, style))
}
</script>
<template>
  <div class="text-properties">
    <label>Section text<textarea :aria-label="textLabel || 'Section text'" :value="text" :maxlength="maxlength || 5000" rows="5" @input="emit('update:text', ($event.target as HTMLTextAreaElement).value)" /></label>
    <label><input :checked="heading" type="checkbox" @change="emit('update:heading', ($event.target as HTMLInputElement).checked)" /> First line is a heading</label>
    <label><input :checked="border" type="checkbox" @change="emit('update:border', ($event.target as HTMLInputElement).checked)" /> Section border</label>
    <div role="group" aria-label="Section list formatting"><button type="button" @click="format('bullets')">Bullets</button><button type="button" @click="format('numbered')">Numbered</button><button type="button" @click="format('paragraph')">Plain text</button></div>
  </div>
</template>
<style scoped>
.text-properties{display:flex;flex-direction:column;gap:10px}label{display:flex;gap:6px;align-items:center;font-size:13px;flex-wrap:wrap}textarea{width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;color:#0f172a;background:white}button{padding:6px 9px;margin-right:4px;border:1px solid #cbd5e1;border-radius:5px;font-size:12px}
</style>
