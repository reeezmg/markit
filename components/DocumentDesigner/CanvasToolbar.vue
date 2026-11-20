<script setup lang="ts">
defineProps<{ zoom: number; fitted?: boolean; disabled?: boolean; label?: string }>()
const emit = defineEmits<{ zoom: [value: number]; fit: [] }>()
const levels = [25, 50, 75, 100, 125, 150, 200, 300]
</script>
<template>
  <div class="document-canvas-toolbar">
    <div class="document-canvas-info"><slot>{{ label || 'Live preview' }}</slot></div>
    <div class="document-zoom" role="group" aria-label="Canvas zoom">
      <button type="button" class="fit-button" :disabled="disabled" :aria-pressed="fitted" @click="emit('fit')">Fit width</button>
      <button type="button" aria-label="Zoom out" :disabled="disabled || zoom <= 25" @click="emit('zoom', Math.max(25, zoom - 25))">−</button>
      <select aria-label="Preview zoom" :value="zoom" :disabled="disabled" @change="emit('zoom', Number(($event.target as HTMLSelectElement).value))"><option v-if="!levels.includes(zoom)" :value="zoom">{{ zoom }}%</option><option v-for="level in levels" :key="level" :value="level">{{ level }}%</option></select>
      <button type="button" aria-label="Zoom in" :disabled="disabled || zoom >= 300" @click="emit('zoom', Math.min(300, zoom + 25))">+</button>
    </div>
  </div>
</template>
<style scoped>
.document-canvas-toolbar,.document-zoom,.document-canvas-info{display:flex;gap:6px;align-items:center;min-width:0}.document-canvas-toolbar{justify-content:space-between;width:100%;flex-wrap:wrap;color:#334155;font-size:12px}.document-canvas-info{flex:1;flex-wrap:wrap}.document-zoom{flex-shrink:0}button,select{background:white;border:1px solid #cbd5e1;border-radius:5px;padding:5px 7px;color:#334155}button:disabled{opacity:.4}select{width:auto;max-width:90px}
</style>
