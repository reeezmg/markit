import { newQuoteDesignSection, quoteSectionLabels, type QuoteDesign, type QuoteDesignElement, type QuoteDesignSection } from './quote-design'
import { quoteLayerDefinitions, quoteLayerHasRowData, type QuoteLayerDefinition } from './quote-layer-definitions'
import { quoteBindingOptions } from './quote-bindings'

export const quoteLayerId = (sectionId: string, key?: string) => key ? `${sectionId}::${key}` : sectionId
export interface QuoteLayerNode extends QuoteLayerDefinition {
  id: string; section: QuoteDesignSection; element?: QuoteDesignElement; model: QuoteDesignSection
  parentId?: string; locked: boolean; visible: boolean; children: QuoteLayerNode[]
}
export function quoteLayerTree(design: QuoteDesign): QuoteLayerNode[] {
  return design.sections.map(section => {
    const fieldBinding = section.field || (section.role === 'signature' ? 'companyName' : '')
    const root: QuoteLayerNode = { id: section.id, key: '', name: section.name || (section.kind === 'text' ? section.text.slice(0, 24) || 'Text' : quoteSectionLabels[section.kind]), kind: ['text', 'field', 'subject'].includes(section.kind) ? 'text' : section.kind === 'image' ? 'image' : section.kind === 'shape' ? 'shape' : 'frame',
      section, model: section, locked: !!section.locked, visible: section.visible, protected: ['items', 'totals'].includes(section.kind), children: [],
      binding: section.kind === 'field' ? section.elements?.find(e => e.key === 'field-value')?.binding ?? fieldBinding : section.kind === 'subject' ? section.elements?.find(e => e.key === 'subject-text')?.binding ?? 'subject' : section.elements?.find(e => e.key === 'text-body')?.binding ?? section.binding }
    const definitions = [...quoteLayerDefinitions(section.kind, section.role), ...(section.elements || []).filter(e => e.kind).map(e => ({ key: e.key, name: e.name || (e.kind === 'text' ? e.text?.slice(0, 24) || 'Text' : e.kind!), kind: e.kind!, parent: e.parent, binding: e.binding }))]
    const build = (parent: QuoteLayerNode, depth: number) => {
      if (depth >= 8) return
      parent.children = definitions.filter(d => (d.parent || '') === parent.key).map(definition => {
        const element = section.elements?.find(e => e.key === definition.key), id = quoteLayerId(section.id, definition.key)
        const model: QuoteDesignSection = { ...newQuoteDesignSection(definition.kind === 'frame' ? 'header' : definition.kind, id), ...element, kind: definition.kind === 'frame' ? 'header' : definition.kind, id, name: element?.name || definition.name, visible: element?.visible !== false,
          // Native nodes inherit typography; defaults here are inspector fallbacks only.
          fontSize: element?.fontSize || section.fontSize, locked: !!element?.locked }
        const binding = element?.binding === 'field' ? fieldBinding : element?.binding ?? (definition.kind === 'image' && element?.image ? '' : definition.binding === 'field' ? fieldBinding : definition.key === 'text-body' ? section.binding : definition.binding)
        const node: QuoteLayerNode = { ...definition, binding, id, name: model.name || definition.name, section, element, model, parentId: parent.id,
          locked: parent.locked || !!element?.locked, visible: parent.visible && element?.visible !== false, children: [] }
        build(node, depth + 1); return node
      })
    }
    build(root, 0); return root
  })
}
export function flattenQuoteLayers(nodes: QuoteLayerNode[]): QuoteLayerNode[] { return nodes.flatMap(node => [node, ...flattenQuoteLayers(node.children)]) }
export const quoteLayers = (design: QuoteDesign) => flattenQuoteLayers(quoteLayerTree(design))
export const findQuoteLayer = (design: QuoteDesign, id: string) => quoteLayers(design).find(node => node.id === id)

/** The same operation handles template nodes, custom children and top-level sections. */
export function setQuoteLayerBinding(design: QuoteDesign, id: string, binding: string, currentText = ''): boolean {
  const node = findQuoteLayer(design, id)
  if (!node || node.locked || !['text', 'image'].includes(node.kind)) return false
  if (binding && !quoteBindingOptions(node.kind as 'text' | 'image', quoteLayerHasRowData(node.section, node.key)).some(field => field.key === binding)) return false
  const native = quoteLayerDefinitions(node.section.kind, node.section.role).find(d => d.key === node.key)
  if (native?.protected && native.binding && binding !== native.binding) return false
  const section = node.section
  let key = node.key
  if (!key && section.kind === 'subject') key = 'subject-text'
  if (section.kind === 'field' && (!key || key === 'field-value')) {
    section.field = binding; key = 'field-value'
  }
  if (!key) {
    section.binding = binding
    if (section.kind === 'text') {
      // A root selection edits the same content as its body layer.
      const body = section.elements?.find(e => e.key === 'text-body')
      if (body) { delete body.binding; delete body.text }
      if (!binding) section.text = (section.heading ? section.text.split('\n')[0] + '\n' + currentText : currentText).slice(0, 5000)
    }
    if (section.kind === 'image' && binding) section.image = ''
    return true
  }
  section.elements ||= []
  let element = section.elements.find(e => e.key === key)
  if (!element) { element = { key }; section.elements.push(element) }
  const definition = quoteLayerDefinitions(section.kind, section.role).find(d => d.key === key)
  if (binding && (binding === definition?.binding || definition?.binding === 'field')) delete element.binding
  else element.binding = binding
  if (binding) { delete element.text; delete element.image }
  else if (node.kind === 'text') element.text = currentText.slice(0, 5000)
  return true
}
export function patchQuoteLayer(design: QuoteDesign, id: string, patch: Partial<QuoteDesignSection>) {
  const node = findQuoteLayer(design, id)
  if (!node || node.locked && Object.keys(patch).some(key => key !== 'locked')) return
  if (!node.key) { Object.assign(node.section, patch); return }
  if (node.protected && patch.visible === false) return
  node.section.elements ||= []
  let element = node.section.elements.find(e => e.key === node.key)
  if (!element) { element = { key: node.key }; node.section.elements.push(element) }
  const { id: ignoredId, kind: ignoredKind, elements: ignoredElements, ...style } = patch
  Object.assign(element, style)
}
export function restoreQuoteLayer(design: QuoteDesign, id: string, snapshot: QuoteDesignSection | QuoteDesignElement | null) {
  const node = findQuoteLayer(design, id)
  if (!node) return
  if (!node.key) {
    const index = design.sections.findIndex(s => s.id === id)
    if (snapshot) design.sections[index] = snapshot as QuoteDesignSection
  } else {
    const elements = node.section.elements || [], index = elements.findIndex(e => e.key === node.key)
    if (snapshot && index >= 0) elements[index] = snapshot as QuoteDesignElement
    else if (snapshot) elements.push(snapshot as QuoteDesignElement)
    else if (index >= 0) elements.splice(index, 1)
    node.section.elements = elements
    if (!node.section.elements.length) delete node.section.elements
  }
}
export function layerAncestors(nodes: QuoteLayerNode[], id: string): QuoteLayerNode[] {
  const node = nodes.find(n => n.id === id), parent = nodes.find(n => n.id === node?.parentId)
  return parent ? [...layerAncestors(nodes, parent.id), parent] : []
}
/** A transform selection must never include both a frame and one of its descendants. */
export function independentLayerIds(nodes: QuoteLayerNode[], ids: string[]) {
  return [...new Set(ids)].filter(id => nodes.some(n => n.id === id) && !layerAncestors(nodes, id).some(parent => ids.includes(parent.id)))
}
