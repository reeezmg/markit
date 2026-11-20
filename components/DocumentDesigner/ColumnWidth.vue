<script setup lang="ts">
defineProps<{ modelValue: number; minimum?: number; maximum?: number; disabled?: boolean; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
function update(event: Event) { const value = Number((event.target as HTMLInputElement).value); if (Number.isFinite(value)) emit('update:modelValue', value) }
</script>
<template>
  <label class="column-width">Width (%)<div><input :value="Number(modelValue.toFixed(1))" type="number" :min="minimum || 1" :max="maximum || 100" step="0.5" :disabled="disabled" :aria-label="label || 'Column width percent'" @input="update" @change="update" /><input :value="modelValue" type="range" :min="minimum || 1" :max="maximum || 100" step="0.5" :disabled="disabled" :aria-label="`${label || 'Column width'} slider`" @input="update" /></div></label>
</template>
<style scoped>
.column-width{display:flex;flex-direction:column;gap:5px;font-size:12px;min-width:0}.column-width>div{display:flex;align-items:center;gap:8px;width:100%}input[type=number]{width:75px;padding:6px;border:1px solid #cbd5e1;border-radius:5px;background:white;color:#0f172a}input[type=range]{flex:1;min-width:0;width:80px;accent-color:#f97316}
</style>
