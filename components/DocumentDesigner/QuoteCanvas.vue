<script setup lang="ts">
import { designerFonts, transformLayerVector } from '~/utils/designer-presentation'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import QuoteDocument from '~/components/Quotes/Document.vue'
import type { QuoteDesign, QuoteDesignSection, QuoteDesignElement } from '~/utils/quote-design'
import { quoteLayers, independentLayerIds, layerAncestors, type QuoteLayerNode } from '~/utils/quote-layers'
import { sheetDimensions } from '~/utils/document-designer'
import { boxUnion, constrainBox, resizeBox, snapBox, transformBoxes, type DesignerBox, type DesignerGuide } from '~/utils/designer-geometry'

const props = defineProps<{ design: QuoteDesign; quote: any; company: any; documentTitle?: string; selectedIds: string[]; disabled: boolean; snap: boolean; grid: boolean; tool: string; layerNodes?: QuoteLayerNode[]; dimensions?: { width: number; height: number }; revision?: number; textLimit?: number }>()
const emit = defineEmits<{
  'update:selectedIds': [ids: string[]]; gesture: [active: boolean];
  transform: [frames: { id: string; box: DesignerBox; original: DesignerBox; resize: boolean; initial?: QuoteDesignSection | QuoteDesignElement | null }[]];
  patch: [id: string, patch: Partial<QuoteDesignSection>]; command: [command: string];
  restore: [id: string, snapshot: QuoteDesignSection | QuoteDesignElement | null];
  resizeColumns: [columns: { field: string; width: number }[]];
  context: [event: MouseEvent];
}>()
const root = ref<HTMLElement | null>(null), boxes = ref<Record<string, DesignerBox>>({}), guides = ref<DesignerGuide[]>([])
const nodes = computed(() => props.layerNodes || quoteLayers(props.design)), rotations = ref<Record<string, number>>({}), localBoxes = ref<Record<string, DesignerBox>>({})
const presentation = ref<Record<string, Partial<QuoteDesignSection>>>({}), renderedText = ref<Record<string, string>>({}), drillSection = ref('')
const marquee = ref<DesignerBox | null>(null), editingId = ref(''), editingText = ref('')
const page = computed(() => props.dimensions || sheetDimensions(props.design.paperSize))
const selectedBoxes = computed(() => props.selectedIds.flatMap(id => boxes.value[id] ? [boxes.value[id]] : []))
const bounds = computed(() => selectedBoxes.value.length ? boxUnion(selectedBoxes.value) : null)
const selectionLocked = computed(() => nodes.value.some(s => props.selectedIds.includes(s.id) && s.locked))
const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const handleNames: Record<string, string> = { nw: 'top left', n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left' }
let observer: ResizeObserver | undefined, stopGesture: ((cancel?: boolean) => void) | undefined, scheduled = false
const paperElement = () => root.value?.querySelector<HTMLElement>('.quote-paper')
function refresh() {
  const paper = paperElement()
  if (!paper || !paper.offsetWidth) return
  const paperRect = paper.getBoundingClientRect(), scale = paperRect.width / page.value.width, mm = page.value.width / paper.offsetWidth
  const next: Record<string, DesignerBox> = {}, angles: Record<string, number> = {}, localNext: Record<string, DesignerBox> = {}, styles: typeof presentation.value = {}, text: Record<string, string> = {}
  paper.querySelectorAll<HTMLElement>('[data-layer-id]').forEach(element => {
    const id = element.dataset.layerId!, node = nodes.value.find(n => n.id === id)
    if (!node || next[id] || !element.offsetWidth || !element.offsetHeight || getComputedStyle(element).display === 'none') return
    const rect = element.getBoundingClientRect(), width = element.offsetWidth * mm, height = Math.max(1, element.offsetHeight * mm)
    next[id] = { x: (rect.left + rect.width / 2 - paperRect.left) / scale - width / 2, y: (rect.top + rect.height / 2 - paperRect.top) / scale - height / 2, width, height }
    angles[id] = layerAncestors(nodes.value, id).reduce((sum, n) => sum + (n.model.rotation || 0), node.model.rotation || 0)
    const css = getComputedStyle(element), rgb = css.color.match(/\d+/g), background = css.backgroundColor.match(/[\d.]+/g)
    styles[id] = { fontSize: parseFloat(css.fontSize), fontFamily: designerFonts.find(font => css.fontFamily.includes(font)) || 'Arial', fontWeight: Number(css.fontWeight) || 400, bold: Number(css.fontWeight) >= 600, italic: css.fontStyle === 'italic',
      color: rgb?.length ? '#' + rgb.slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('') : undefined,
      background: background?.length && (background.length < 4 || Number(background[3]) > 0) ? '#' + background.slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('') : 'transparent',
      lineHeight: Number.isFinite(parseFloat(css.lineHeight)) ? parseFloat(css.lineHeight) / parseFloat(css.fontSize) : undefined,
      letterSpacing: parseFloat(css.letterSpacing) || 0, align: css.textAlign === 'right' || css.textAlign === 'end' ? 'right' : css.textAlign === 'center' ? 'center' : 'left' }
    text[id] = element.textContent?.trim() || ''
  })
  for (const node of nodes.value) {
    const box = next[node.id], parent = node.parentId ? next[node.parentId] : null
    if (!box) continue
    if (!parent) { localNext[node.id] = box; continue }
    const dx = box.x + box.width / 2 - parent.x - parent.width / 2, dy = box.y + box.height / 2 - parent.y - parent.height / 2
    const delta = transformLayerVector(layerAncestors(nodes.value, node.id).map(n => n.model), dx, dy, true)
    localNext[node.id] = { ...box, x: parent.width / 2 + delta.x - box.width / 2, y: parent.height / 2 + delta.y - box.height / 2 }
  }
  if (JSON.stringify(next) !== JSON.stringify(boxes.value)) boxes.value = next
  rotations.value = angles; localBoxes.value = localNext; presentation.value = styles; renderedText.value = text
}
function scheduleRefresh() {
  if (scheduled) return
  scheduled = true
  nextTick(() => { scheduled = false; refresh() })
}
watch(() => props.design, scheduleRefresh, { deep: true })
watch(() => [props.layerNodes, props.dimensions, props.revision], scheduleRefresh, { deep: true })
watch(() => props.disabled, value => { if (value) { stopGesture?.(true); finishText() } })
onMounted(() => {
  observer = new ResizeObserver(scheduleRefresh)
  if (root.value) observer.observe(root.value)
  refresh()
})
onBeforeUnmount(() => { stopGesture?.(true); observer?.disconnect() })
const boxStyle = (box: DesignerBox) => ({ left: `${box.x}mm`, top: `${box.y}mm`, width: `${box.width}mm`, height: `${box.height}mm` })
function local(event: MouseEvent) {
  const rect = paperElement()!.getBoundingClientRect(), scale = rect.width / page.value.width
  return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale, scale }
}
function expanded(ids: string[]) {
  const groups = new Set(nodes.value.filter(s => ids.includes(s.id) && s.model.groupId).map(s => s.model.groupId))
  return independentLayerIds(nodes.value, nodes.value.filter(s => ids.includes(s.id) || (s.model.groupId && groups.has(s.model.groupId))).map(s => s.id))
}
function setSelection(ids: string[]) { emit('update:selectedIds', expanded(ids)) }
function listen(event: PointerEvent, move: (next: PointerEvent) => void, finish: (cancelled: boolean) => void) {
  const target = root.value!
  target.setPointerCapture(event.pointerId)
  const onMove = (next: PointerEvent) => { if (next.pointerId === event.pointerId) move(next) }
  const end = (next: PointerEvent) => { if (next.pointerId === event.pointerId) stop(next.type !== 'pointerup') }
  const stop = (cancelled = false) => {
    target.removeEventListener('pointermove', onMove); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); target.removeEventListener('lostpointercapture', end)
    stopGesture = undefined
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
    guides.value = []; marquee.value = null; finish(cancelled)
  }
  stopGesture = stop
  target.addEventListener('pointermove', onMove); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end); target.addEventListener('lostpointercapture', end)
}
function pointerdown(event: PointerEvent) {
  if (props.disabled || event.button !== 0 || props.tool === 'hand' || event.defaultPrevented || (event.target as HTMLElement).closest('.column-divider, textarea, .canvas-handle, .rotation-handle')) return
  finishText(); refresh()
  const sectionElement = (event.target as HTMLElement).closest<HTMLElement>('[data-section-id]')
  root.value?.focus({ preventScroll: true })
  if (sectionElement) {
    event.preventDefault(); event.stopPropagation()
    const hit = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
    const deep = event.ctrlKey || event.metaKey || drillSection.value === sectionElement.dataset.sectionId || props.selectedIds.some(id => nodes.value.find(n => n.id === id)?.key && nodes.value.find(n => n.id === id)?.section.id === sectionElement.dataset.sectionId)
    const id = deep && hit ? hit : sectionElement.dataset.sectionId!, section = nodes.value.find(s => s.id === id)!
    if (deep) drillSection.value = section.section.id
    const group = expanded([id])
    if (event.shiftKey) {
      setSelection(props.selectedIds.includes(id) ? props.selectedIds.filter(key => !group.includes(key)) : [...props.selectedIds, ...group]); return
    }
    const ids = props.selectedIds.includes(id) ? [...props.selectedIds] : group
    if (!props.selectedIds.includes(id)) setSelection(ids)
    if (section.locked || ids.some(key => nodes.value.find(s => s.id === key)?.locked)) return
    startTransform(event, ids, 'move')
  } else {
    event.preventDefault()
    const start = local(event), existing = event.shiftKey ? [...props.selectedIds] : []
    drillSection.value = ''
    setSelection(existing)
    listen(event, next => {
      const point = local(next)
      marquee.value = { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }
      const area = marquee.value
      setSelection([...new Set([...existing, ...props.design.sections.filter(s => {
        const b = boxes.value[s.id]
        return s.visible && !s.locked && b && b.x < area.x + area.width && b.x + b.width > area.x && b.y < area.y + area.height && b.y + b.height > area.y
      }).map(s => s.id)])])
    }, cancelled => { if (cancelled) setSelection(existing) })
  }
}
function startTransform(event: PointerEvent, ids: string[], handle: string) {
  if (props.disabled || ids.some(id => nodes.value.find(s => s.id === id)?.locked) || event.button !== 0) return
  refresh()
  const originals = ids.map(id => ({ ...boxes.value[id] })).filter(b => b.width)
  if (originals.length !== ids.length) return
  const union = boxUnion(originals), origin = local(event), pageHeight = Math.max(page.value.height, paperElement()!.getBoundingClientRect().height / origin.scale, union.y + union.height)
  const excluded = new Set(ids.flatMap(id => [id, ...layerAncestors(nodes.value, id).map(n => n.id), ...nodes.value.filter(n => layerAncestors(nodes.value, n.id).some(a => a.id === id)).map(n => n.id)]))
  const targets = nodes.value.filter(s => !excluded.has(s.id) && s.visible && (s.parentId === nodes.value.find(n => n.id === ids[0])?.parentId)).flatMap(s => boxes.value[s.id] ? [boxes.value[s.id]] : [])
  const before = ids.map(id => { const n = nodes.value.find(s => s.id === id)!; return JSON.parse(JSON.stringify(n.key ? n.element || null : n.section)) as QuoteDesignSection | QuoteDesignElement | null })
  const originalRotations = ids.map(id => rotations.value[id] || 0)
  let active = false
  event.preventDefault(); event.stopPropagation(); root.value?.focus({ preventScroll: true })
  listen(event, next => {
    let dx = (next.clientX - event.clientX) / origin.scale, dy = (next.clientY - event.clientY) / origin.scale
    if (!active && Math.hypot(dx, dy) * origin.scale < 3) return
    if (!active) { active = true; emit('gesture', true) }
    const keepAspect = next.shiftKey || ids.length === 1 && !!before[0]?.aspectLocked
    if (handle === 'rotate') {
      const center = { x: union.x + union.width / 2, y: union.y + union.height / 2 }, point = local(next)
      let angle = Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI + 90
      if (angle > 180) angle -= 360
      if (next.shiftKey) angle = Math.round(angle / 15) * 15
      const ancestorRotation = originalRotations[0] - (before[0]?.rotation || 0)
      emit('patch', ids[0], { rotation: Math.max(-180, Math.min(180, Math.round(angle - ancestorRotation))) }); return
    }
    let nextUnion: DesignerBox
    if (handle === 'move') {
      if (next.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
      nextUnion = { ...union, x: union.x + dx, y: union.y + dy }
      if (props.snap && !next.altKey) {
        const snapped = snapBox(nextUnion, targets, { width: page.value.width, height: pageHeight }, 5 / origin.scale, props.grid ? 5 : 0)
        nextUnion = snapped.box; guides.value = snapped.guides
        if (next.shiftKey) { if (dx === 0) nextUnion.x = union.x; else nextUnion.y = union.y }
      }
    } else {
      const angle = ids.length === 1 ? originalRotations[0] * Math.PI / 180 : 0
      const localDX = dx * Math.cos(angle) + dy * Math.sin(angle), localDY = -dx * Math.sin(angle) + dy * Math.cos(angle)
      nextUnion = resizeBox(union, handle, localDX, localDY, keepAspect, next.altKey)
      if (angle) {
        const cx = nextUnion.x + nextUnion.width / 2 - union.x - union.width / 2, cy = nextUnion.y + nextUnion.height / 2 - union.y - union.height / 2
        nextUnion.x = union.x + union.width / 2 + cx * Math.cos(angle) - cy * Math.sin(angle) - nextUnion.width / 2
        nextUnion.y = union.y + union.height / 2 + cx * Math.sin(angle) + cy * Math.cos(angle) - nextUnion.height / 2
      } else if (props.snap && !next.altKey && !keepAspect) {
        const edge = { x: nextUnion.x + (handle.includes('e') ? nextUnion.width : 0), y: nextUnion.y + (handle.includes('s') ? nextUnion.height : 0), width: 0, height: 0 }
        const snapped = snapBox(edge, targets, { width: page.value.width, height: pageHeight }, 5 / origin.scale, props.grid ? 5 : 0)
        const snapX = handle.includes('e') || handle.includes('w'), snapY = handle.includes('n') || handle.includes('s')
        nextUnion = resizeBox(union, handle, dx + (snapX ? snapped.box.x - edge.x : 0), dy + (snapY ? snapped.box.y - edge.y : 0))
        guides.value = snapped.guides.filter(g => g.axis === 'x' ? snapX : snapY)
      }
    }
    nextUnion = constrainBox(nextUnion, page.value.width, Math.max(pageHeight, nextUnion.height))
    if (handle !== 'move' && keepAspect) { const factor = Math.min(nextUnion.width / union.width, nextUnion.height / union.height); nextUnion = { ...nextUnion, width: union.width * factor, height: union.height * factor } }
    const frames = transformBoxes(originals, union, nextUnion)
    emit('transform', frames.map((box, index) => ({ id: ids[index], box, original: originals[index], resize: handle !== 'move', initial: before[index] })))
  }, cancelled => {
    if (active) {
      if (cancelled) before.forEach((snapshot, index) => emit('restore', ids[index], snapshot))
      emit('gesture', false)
    }
  })
}
function doubleclick(event: MouseEvent) {
  if (props.disabled || props.tool === 'hand') return
  const id = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
  const node = nodes.value.find(s => s.id === id), section = node?.model
  if (!node || !section || node.locked) return
  drillSection.value = node.section.id; setSelection([node.id])
  if (node.kind !== 'text' || node.binding || !node.key && section.kind !== 'text') return
  event.preventDefault(); editingId.value = section.id; editingText.value = node.key ? node.element?.text ?? renderedText.value[node.id] ?? '' : section.text; emit('gesture', true)
  nextTick(() => root.value?.querySelector<HTMLTextAreaElement>('.inline-text')?.focus())
}
function click(event: MouseEvent) {
  // Keyboard activation and HTMLElement.click() do not have a preceding pointer gesture.
  if (event.detail || props.disabled || (event.target as HTMLElement).closest('button,textarea')) return
  const id = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
  if (id) setSelection(event.shiftKey ? [...props.selectedIds, id] : [id])
}
function finishText(cancel = false) {
  if (!editingId.value) return
  if (!cancel && !props.disabled) emit('patch', editingId.value, { text: editingText.value })
  editingId.value = ''; emit('gesture', false)
}
function cancel() { stopGesture?.(true); finishText(true) }
function escapeSelection() {
  if (stopGesture || editingId.value) { cancel(); return }
  const parent = props.selectedIds.length === 1 ? nodes.value.find(n => n.id === props.selectedIds[0])?.parentId : undefined
  drillSection.value = ''; setSelection(parent ? [parent] : [])
}
function context(event: MouseEvent) {
  event.preventDefault()
  const id = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
  if (id && !props.selectedIds.includes(id)) setSelection([id])
  emit('context', event)
}
defineExpose({ boxes, localBoxes, rotations, presentation, renderedText, bounds, refresh, cancel, finishText })
</script>
<template>
  <div ref="root" class="quote-editing-canvas" :class="{ 'show-grid': grid, 'hand-tool': tool === 'hand' }" tabindex="0" role="region" aria-label="Document editing canvas" :aria-disabled="disabled" @pointerdown.capture="pointerdown" @click="click" @dblclick="doubleclick" @contextmenu="context" @keydown.esc.stop.prevent="escapeSelection" @load.capture="scheduleRefresh">
    <slot><QuoteDocument :design="design" :quote="quote" :company="company" :document-title="documentTitle" editable canvas-managed @resize-columns="emit('resizeColumns', $event)" @gesture="emit('gesture', $event)" /></slot>
    <div class="canvas-overlays" aria-hidden="true">
      <div v-for="(box, id) in boxes" v-show="selectedIds.includes(String(id)) && selectedIds.length > 1" :key="id" class="member-outline" :style="boxStyle(box)" />
      <div v-for="(guide, index) in guides" :key="index" class="snap-guide" :class="guide.axis" :style="guide.axis === 'x' ? { left: `${guide.value}mm` } : { top: `${guide.value}mm` }" />
      <div v-if="marquee" class="selection-marquee" :style="boxStyle(marquee)" />
    </div>
    <div v-if="bounds && !editingId" class="selection-frame" :class="{ locked: selectionLocked }" :style="{ ...boxStyle(bounds), transform: selectedIds.length === 1 && rotations[selectedIds[0]] ? `rotate(${rotations[selectedIds[0]]}deg)` : undefined }">
      <span class="selection-size">{{ Math.round(bounds.width * 10) / 10 }} × {{ Math.round(bounds.height * 10) / 10 }} mm{{ selectionLocked ? ' · Locked' : '' }}</span>
      <template v-if="!selectionLocked && !disabled">
        <button v-for="handle in handles" :key="handle" type="button" class="canvas-handle" :class="handle" :aria-label="`Resize selection ${handleNames[handle]}`" @pointerdown.stop="startTransform($event, selectedIds, handle)" />
        <button v-if="selectedIds.length === 1" type="button" class="rotation-handle" aria-label="Rotate selection" title="Rotate · Shift for 15° increments" @pointerdown.stop="startTransform($event, selectedIds, 'rotate')">↻</button>
      </template>
    </div>
    <textarea v-if="editingId && boxes[editingId]" v-model="editingText" class="inline-text" :style="{ ...boxStyle(boxes[editingId]), fontSize: `${presentation[editingId]?.fontSize || 12}px`, transform: rotations[editingId] ? `rotate(${rotations[editingId]}deg)` : undefined }" aria-label="Edit text on canvas" :maxlength="textLimit || 5000" @blur="finishText()" @keydown.esc.stop.prevent="finishText(true)" @keydown.ctrl.enter.prevent="finishText()" @keydown.meta.enter.prevent="finishText()" />
  </div>
</template>
<style scoped>
.quote-editing-canvas { position: relative; width: fit-content; outline: none; user-select: none; }
.canvas-overlays { position: absolute; inset: 0; pointer-events: none; z-index: 10001; }
.show-grid::after { content: ''; position: absolute; inset: 0; background-image: linear-gradient(to right,#64748b18 1px,transparent 1px),linear-gradient(to bottom,#64748b18 1px,transparent 1px); background-size: 5mm 5mm; pointer-events: none; z-index: 10000; }
.selection-frame { position: absolute; border: calc(1px / var(--designer-zoom, 1)) solid #0d99ff; box-sizing: border-box; z-index: 10002; pointer-events: none; }
.selection-frame.locked { border-style: dashed; border-color: #94a3b8; }
.member-outline { position: absolute; border: 1px solid #8acbff; box-sizing: border-box; }
.selection-size { position: absolute; top: calc(100% + 7px / var(--designer-zoom, 1)); left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 3px 6px; border-radius: 4px; background: #0d99ff; color: white; font: calc(10px / var(--designer-zoom, 1)) Arial; }
.canvas-handle { position: absolute; width: calc(8px / var(--designer-zoom, 1)); height: calc(8px / var(--designer-zoom, 1)); padding: 0; border: calc(1px / var(--designer-zoom, 1)) solid #0d99ff; background: white; pointer-events: auto; touch-action: none; transform: translate(-50%,-50%); border-radius: 1px; }
.nw { left: 0; top: 0; cursor: nwse-resize; }.n { left: 50%; top: 0; cursor: ns-resize; }.ne { left: 100%; top: 0; cursor: nesw-resize; }.e { left: 100%; top: 50%; cursor: ew-resize; }.se { left: 100%; top: 100%; cursor: nwse-resize; }.s { left: 50%; top: 100%; cursor: ns-resize; }.sw { left: 0; top: 100%; cursor: nesw-resize; }.w { left: 0; top: 50%; cursor: ew-resize; }
.rotation-handle { position: absolute; left: 50%; top: calc(-28px / var(--designer-zoom, 1)); transform: translateX(-50%); background: white; border: 1px solid #0d99ff; color: #0d99ff; border-radius: 50%; width: calc(20px / var(--designer-zoom, 1)); height: calc(20px / var(--designer-zoom, 1)); padding: 0; font-size: calc(14px / var(--designer-zoom, 1)); line-height: 1; pointer-events: auto; cursor: grab; touch-action: none; }
.snap-guide { position: absolute; border-color: #ec4899; border-style: dashed; border-width: 0; }.snap-guide.x { top: 0; bottom: 0; border-left-width: 1px; }.snap-guide.y { left: 0; right: 0; border-top-width: 1px; }
.selection-marquee { position: absolute; border: 1px solid #0d99ff; background: #0d99ff1a; }
.inline-text { position: absolute; z-index: 10003; box-sizing: border-box; background: white; color: #0f172a; border: 2px solid #0d99ff; resize: vertical; padding: 0; min-height: 15mm; user-select: text; outline: 0; }
.hand-tool :deep(.quote-design-section) { cursor: grab; }
@media print { .canvas-overlays,.selection-frame,.inline-text,.show-grid::after { display: none; } }
</style>
