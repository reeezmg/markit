<script setup lang="ts">
import { computed, ref, watch } from 'vue'
const props = withDefaults(defineProps<{ label: string; inputLabel: string; values: [number, number, number, number]; individual: boolean; corners?: boolean; controlId: string; min?: number; max?: number }>(), { min: 0, max: 100 })
const emit = defineEmits<{ all: [value: number]; individual: [values: [number, number, number, number]] }>()
const expanded = ref(props.individual)
const draft = ref<[number, number, number, number]>([...props.values])
watch(() => props.values, values => { draft.value = [...values] }, { deep: true })
watch(() => props.individual, individual => { if (individual) expanded.value = true })
const mixed = computed(() => draft.value.some(n => n !== draft.value[0]))
const names = computed(() => props.corners ? ['top left', 'top right', 'bottom right', 'bottom left'] : ['top', 'right', 'bottom', 'left'])
const order = computed(() => props.corners ? [0, 1, 3, 2] : [0, 1, 2, 3])
function change(event: Event, index?: number) {
  const input = event.target as HTMLInputElement, value = Number(input.value)
  if (!input.value.trim() || !Number.isFinite(value)) { input.value = index === undefined ? mixed.value ? '' : String(draft.value[0]) : String(draft.value[index]); return }
  const next = Math.max(props.min, Math.min(props.max, value))
  if (index === undefined) { draft.value = [next, next, next, next]; emit('all', next) }
  else { draft.value = [...draft.value]; draft.value[index] = next; emit('individual', [...draft.value]) }
}
</script>
<template>
  <div class="four-values">
    <div class="summary-row" :class="{ 'with-leading': !!$slots.leading }">
      <slot name="leading" />
      <label class="unified-label">{{ label }}
        <div class="unified-control"><div class="value-field"><span class="value-icon" :class="corners ? 'corner-icon all-corners' : 'side-icon all-sides'" aria-hidden="true" /><input :value="mixed ? '' : draft[0]" :placeholder="mixed ? 'Mixed' : '0'" type="number" :min="min" :max="max" step=".5" :aria-label="inputLabel" @change="change($event)" /><span class="unit">mm</span></div><button type="button" :aria-label="corners ? 'Independent corner radii' : `Independent ${label.toLowerCase()} sides`" :title="corners ? 'Edit each corner' : 'Edit each side'" :aria-expanded="expanded" :aria-controls="controlId" @click="expanded = !expanded"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path v-if="corners" d="M6 2H2v4m8-4h4v4M2 10v4h4m8-4v4h-4" /><path v-else d="M4 2h8M4 14h8M2 4v8m12-8v8M5 5h6v6H5z" /></svg></button></div>
      </label>
    </div>
    <div v-if="expanded" :id="controlId" class="individual-values" :aria-label="corners ? 'Individual corner radii' : `Individual ${label.toLowerCase()} sides`">
      <label v-for="index in order" :key="index" class="value-field" :title="`${label}: ${names[index]}`"><span class="value-icon" :class="[corners ? 'corner-icon' : 'side-icon', `value-${index}`]" aria-hidden="true" /><input :value="draft[index]" type="number" :min="min" :max="max" step=".5" :aria-label="`${label} ${names[index]}`" @change="change($event, index)" /><span class="unit">mm</span></label>
    </div>
  </div>
</template>
<style scoped>
.four-values{display:grid;gap:7px;min-width:0}.summary-row.with-leading,.individual-values{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px}.unified-label{display:grid;gap:5px;color:#777;font:10px Arial,sans-serif;min-width:0}.unified-control{display:flex;gap:4px;align-items:center;min-width:0}.value-field{display:flex;align-items:center;gap:5px;min-width:0;height:29px;padding:0 6px;border:1px solid transparent;border-radius:4px;background:#f5f5f5;box-sizing:border-box}.value-field:focus-within{border-color:#0d99ff}.unified-control>.value-field{flex:1}input{box-sizing:border-box;min-width:0;width:100%;height:27px;padding:3px 1px;border:0;border-radius:3px;background:transparent;color:#222;font:11px Arial,sans-serif;appearance:textfield}input::-webkit-inner-spin-button{opacity:0;width:0}.unit{font:9px Arial,sans-serif;color:#999}.value-icon{display:inline-block;box-sizing:border-box;width:10px;height:10px;flex-shrink:0;color:#888}.corner-icon{border-top:1px solid;border-left:1px solid;border-top-left-radius:4px}.corner-icon.value-1{transform:rotate(90deg)}.corner-icon.value-2{transform:rotate(180deg)}.corner-icon.value-3{transform:rotate(270deg)}.all-corners{border:1px dashed;border-radius:3px}.side-icon{border:1px dotted #bbb;border-top:2px solid #888}.side-icon.value-1{transform:rotate(90deg)}.side-icon.value-2{transform:rotate(180deg)}.side-icon.value-3{transform:rotate(270deg)}.all-sides{border:1px solid #888;box-shadow:inset 0 0 0 2px #f5f5f5,inset 0 0 0 3px #bbb}button{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:24px;height:26px;padding:4px;border:0;border-radius:4px;background:transparent;color:#777;cursor:pointer}button[aria-expanded=true]{background:#e6f0ff;color:#0d99ff}button:hover{background:#edf3fa}svg{width:14px;height:14px;stroke:currentColor;stroke-width:1.2}button:focus-visible,input:focus-visible{outline:1px solid #0d99ff;outline-offset:1px}
</style>
