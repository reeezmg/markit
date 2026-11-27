<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Eye, EyeOff, Lock, LockOpen } from 'lucide-vue-next'
import type { QuoteLayerNode } from '~/utils/quote-layers'
const props = withDefaults(defineProps<{ node: QuoteLayerNode; selectedIds: string[]; disabled: boolean; depth?: number; index?: number; count?: number }>(), { depth: 0, index: 0, count: 0 })
const emit = defineEmits<{ select: [id: string, event: MouseEvent]; visibility: [id: string]; lock: [id: string]; move: [id: string, direction: number]; drag: [id: string]; drop: [id: string] }>()
const expanded = ref(props.node.section.kind === 'header' && (!props.node.key || ['brand', 'company-info', 'document-info'].includes(props.node.key)))
const contains = (node: QuoteLayerNode): boolean => props.selectedIds.includes(node.id) || node.children.some(contains)
watch(() => props.selectedIds, () => { if (props.node.children.some(contains)) expanded.value = true })
const inheritedLock = computed(() => props.node.locked && !props.node.model.locked)
</script>
<template>
  <li class="layer-tree-node" :data-layer-node="node.id">
    <div class="layer-row" :class="{ active: selectedIds.includes(node.id), muted: !node.visible }" :style="{ paddingLeft: `${6 + depth * 12}px` }" :draggable="!disabled && !node.locked && (!node.key || !!node.element?.kind)" @dragstart.stop="emit('drag', node.id)" @dragend.stop="emit('drag', '')" @dragover.prevent.stop @drop.prevent.stop="emit('drop', node.id)">
      <button v-if="node.children.length" type="button" class="layer-expand" :aria-expanded="expanded" :aria-label="`${expanded ? 'Collapse' : 'Expand'} layer ${node.id}`" @click="expanded = !expanded">{{ expanded ? '⌄' : '›' }}</button><span v-else class="layer-expand" />
      <button type="button" class="layer-select" :aria-pressed="selectedIds.includes(node.id)" :aria-label="node.key ? `Select layer ${node.id}` : `Select quote section ${node.id}`" @click="emit('select', node.id, $event)"><span class="layer-symbol">{{ node.kind === 'frame' ? '▧' : node.kind === 'text' ? 'T' : node.kind === 'image' ? '▨' : '□' }}</span><span>{{ node.name }}</span></button>
      <button type="button" class="layer-action" :aria-label="`${node.model.visible ? 'Hide' : 'Show'} layer ${node.id}`" :disabled="disabled || node.locked || node.protected" @click="emit('visibility', node.id)"><Eye v-if="node.model.visible" /><EyeOff v-else /></button>
      <button type="button" class="layer-action" :aria-label="`${node.model.locked ? 'Unlock' : 'Lock'} layer ${node.id}`" :disabled="disabled || inheritedLock" @click="emit('lock', node.id)"><Lock v-if="node.locked" /><LockOpen v-else /></button>
      <div v-if="!node.key" class="layer-order"><button type="button" :disabled="disabled || node.locked || index === 0" :aria-label="`Move section ${node.id} up`" @click="emit('move', node.id, -1)">↑</button><button type="button" :disabled="disabled || node.locked || index === count - 1" :aria-label="`Move section ${node.id} down`" @click="emit('move', node.id, 1)">↓</button></div>
    </div>
    <ul v-if="node.children.length" v-show="expanded" class="child-layers"><LayerTree v-for="child in node.children" :key="child.id" :node="child" :depth="depth + 1" :selected-ids="selectedIds" :disabled="disabled" @select="(id, event) => emit('select', id, event)" @visibility="emit('visibility', $event)" @lock="emit('lock', $event)" @move="(id, direction) => emit('move', id, direction)" @drag="emit('drag', $event)" @drop="emit('drop', $event)" /></ul>
  </li>
</template>
<style scoped>
.layer-tree-node,.child-layers { margin: 0; padding: 0; list-style: none; }.layer-row { display: flex; align-items: center; position: relative; min-height: 32px; padding-right: 7px; gap: 2px; font-size: 11px; }.layer-row:hover { background: #f5f5f5; }.layer-row.active { background: #e6f0ff; box-shadow: inset 2px 0 #0d99ff; }.muted { opacity: .45; }
.layer-expand { display: grid; place-items: center; width: 12px; min-width: 12px; height: 22px; color: #737373; }.layer-select { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; text-align: left; padding: 7px 0; color: #333; }.layer-select > span:last-child { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }.layer-symbol { color: #888; width: 12px; text-align: center; font-size: 12px; }
.layer-action { padding: 3px 1px; color: #8c8c8c; opacity: 0; }.layer-action svg { width: 11px; height: 11px; }.layer-row:hover .layer-action,.layer-row:focus-within .layer-action,.layer-row.active .layer-action { opacity: 1; }.layer-action:disabled { opacity: .25; }.layer-order { display: none; position: absolute; top: 25px; right: 8px; z-index: 10; border: 1px solid #ddd; background: white; }.layer-order button { padding: 2px 6px; }.layer-row:hover .layer-order,.layer-row:focus-within .layer-order { display: flex; }button { cursor: pointer; border: 0; background: none; }button:focus-visible { outline: 2px solid #0d99ff; }button:disabled { cursor: default; }
</style>
