<script setup lang="ts">
import { computed, inject, provide, useAttrs, type ComputedRef } from 'vue'
import { paintColor, compositeFills, layerBoxStyle } from '~/utils/designer-presentation'
import type { QuoteDesignSection } from '~/utils/quote-design'
import { quoteLayerId } from '~/utils/quote-layers'
import { quoteLayerDefinitions } from '~/utils/quote-layer-definitions'
import { applyDesignerRules } from '~/utils/designer-rules'
import { quoteDocumentImage } from '~/utils/quote-document'
const props = withDefaults(defineProps<{ section: QuoteDesignSection; layerKey: string; tag?: string; source?: string; rowValues?: Record<string, string>; rowConditionValues?: Record<string, unknown> }>(), { tag: 'div' })
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const inheritedRuleValues = inject<ComputedRef<Record<string, unknown>>>('quote-condition-values')
const ruleValues = computed(() => ({ ...inheritedRuleValues?.value, ...props.rowConditionValues }))
provide('quote-condition-values', ruleValues)
const element = computed(() => { const layer = props.section.elements?.find(e => e.key === props.layerKey); return layer ? applyDesignerRules(layer, key => ruleValues.value[key], layer.kind === 'text' || quoteLayerDefinitions(props.section.kind, props.section.role).some(node => node.key === props.layerKey && node.kind === 'text')) : undefined })
const custom = computed(() => !!element.value?.kind)
const inheritedValues = inject<ComputedRef<Record<string, string>>>('quote-layer-values')
const values = computed(() => ({ ...inheritedValues?.value, ...props.rowValues }))
provide('quote-layer-values', values)
const binding = computed(() => element.value?.binding ?? (props.layerKey === 'text-body' ? props.section.binding : undefined))
const bindingValue = computed(() => binding.value ? values.value[binding.value === 'field' ? props.section.field : binding.value] ?? '' : '')
const textOverride = computed(() => binding.value ? bindingValue.value : element.value?.text)
const imageLayer = computed(() => element.value?.kind === 'image' || quoteLayerDefinitions(props.section.kind, props.section.role).some(node => node.key === props.layerKey && node.kind === 'image'))
const sourceImage = computed(() => binding.value ? quoteDocumentImage(bindingValue.value) : element.value?.image || (binding.value === '' ? '' : props.source))
const reservedSlot = computed(() => !custom.value && element.value?.slotWidth !== undefined && element.value.slotHeight !== undefined)
const children = computed(() => (props.section.elements || []).filter(e => e.kind && (e.parent || '') === props.layerKey))
const style = computed(() => {
  const e = element.value
  if (!e) return props.layerKey ? { position: 'relative' as const, display: ['span', 'strong'].includes(props.tag) ? 'inline-block' : undefined } : undefined
  const text = element.value?.kind === 'text' || quoteLayerDefinitions(props.section.kind, props.section.role).some(node => node.key === props.layerKey && node.kind === 'text')
  const autoWidth = text && e.resizeMode === 'auto-width', autoHeight = text && (e.resizeMode === 'auto-height' || autoWidth)
  const vertical = text && !!e.frameHeight && !autoHeight && !!e.textVerticalAlign
  return {
    display: e.visible === false ? 'none' : vertical ? 'flex' : ['span', 'strong'].includes(props.tag) ? 'inline-block' : undefined,
    position: custom.value ? 'absolute' as const : 'relative' as const,
    left: custom.value ? `${e.x || 0}mm` : undefined, top: custom.value ? `${e.y || 0}mm` : undefined,
    width: autoWidth ? 'max-content' : e.frameWidth ? `${e.frameWidth}mm` : undefined, height: autoHeight ? 'auto' : e.frameHeight ? `${e.frameHeight}mm` : undefined,
    whiteSpace: autoWidth ? 'pre' : undefined, flexDirection: vertical ? 'column' as const : undefined, justifyContent: vertical ? e.textVerticalAlign === 'bottom' ? 'flex-end' : e.textVerticalAlign === 'middle' ? 'center' : 'flex-start' : undefined,
    minWidth: e.frameWidth ? '0' : undefined, maxWidth: e.frameWidth ? 'none' : undefined, flex: e.frameWidth ? 'none' : undefined,
    transform: `${!custom.value ? `translate(${e.x || 0}mm, ${e.y || 0}mm)` : ''} rotate(${e.rotation || 0}deg) scale(${e.flipX ? -1 : 1}, ${e.flipY ? -1 : 1})`,
    opacity: e.opacity, color: text && e.fills ? compositeFills(e.fills).css : text ? paintColor(e.color || (e.fillOpacity !== undefined ? '#111827' : undefined), e.fillOpacity, e.fillVisible) : e.color, background: !text && e.fills ? compositeFills(e.fills).css : text ? paintColor(e.background, e.backgroundOpacity, e.backgroundVisible) : paintColor(e.background, e.fillOpacity, e.fillVisible), zIndex: e.zIndex,
    border: e.borderWidth !== undefined ? `${e.borderWidth}mm solid ${e.borderColor || '#cbd5e1'}` : undefined,
    ...layerBoxStyle(e), boxSizing: 'border-box' as const,
    fontFamily: e.fontFamily, fontSize: e.fontSize ? `${e.fontSize}px` : undefined, fontWeight: e.fontWeight ?? (e.bold !== undefined ? e.bold ? '700' : '400' : undefined),
    fontStyle: e.italic !== undefined ? e.italic ? 'italic' : 'normal' : undefined, textDecoration: [e.underline ? 'underline' : '', e.strike ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
    textAlign: e.align, lineHeight: e.lineHeight, letterSpacing: e.letterSpacing !== undefined ? e.letterSpacingUnit === 'percent' ? `${e.letterSpacing / 100}em` : `${e.letterSpacing}px` : undefined,
    objectFit: e.imageFit,
    '--quote-layer-image-fit': e.imageFit,
  }
})
</script>
<template>
  <component v-if="reservedSlot" :is="tag === 'img' ? 'span' : tag" :class="attrs.class" :style="[attrs.style as any, { position: 'relative', display: element?.visible === false ? 'none' : tag === 'img' ? 'block' : undefined, flex: 'none', width: `${element!.slotWidth}mm`, height: `${element!.slotHeight}mm` }]">
    <component :is="tag === 'img' ? 'img' : 'span'" v-bind="{ ...attrs, class: undefined, style: undefined }" :data-layer-id="quoteLayerId(section.id, layerKey)" :data-layer-key="layerKey" :style="[style, { display: style?.display === 'none' ? 'none' : style?.display === 'flex' ? 'flex' : 'block', maxWidth: 'none' }]" :src="tag === 'img' ? sourceImage : undefined"><template v-if="tag !== 'img'"><img v-if="imageLayer && binding !== undefined" :src="sourceImage || undefined" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:inherit;object-fit:inherit" /><template v-else-if="textOverride !== undefined">{{ textOverride }}</template><slot v-else /></template></component>
  </component>
  <component v-else :is="tag" v-bind="attrs" :data-layer-id="quoteLayerId(section.id, layerKey)" :data-layer-key="layerKey || undefined" :style="style" :src="tag === 'img' ? sourceImage : undefined">
    <template v-if="tag !== 'img'">
      <img v-if="imageLayer && binding !== undefined" :src="sourceImage || undefined" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:inherit;object-fit:var(--quote-layer-image-fit,contain)" /><template v-else-if="textOverride !== undefined">{{ textOverride }}</template><slot v-else />
      <QuoteLayer v-for="child in children" :key="child.key" :section="section" :layer-key="child.key" :tag="child.kind === 'image' && (child.image || child.binding) ? 'img' : 'div'" :class="['quote-custom-layer', `custom-${child.kind}`]">
        <template v-if="child.kind === 'text'">{{ child.text || 'Text' }}</template><template v-else-if="child.kind === 'image'">Image</template>
      </QuoteLayer>
    </template>
  </component>
</template>
<style scoped>
.quote-custom-layer { white-space: pre-wrap; overflow-wrap: anywhere; }.custom-image { object-fit: contain; }.custom-shape { background: #e2e8f0; }.custom-frame { position: relative; }.quote-custom-layer:not(img) { min-height: 1mm; }
</style>
