import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computed, ref } from 'vue'
import { customSectionText, sheetDimensions } from '../utils/document-designer'
import { useDocumentSections } from '../utils/document-designer-sections'
import { defaultQuoteDesign, normalizeQuoteDesign, quoteDesignTemplate, newQuoteDesignSection } from '../utils/quote-design'
import { defaultTemplate, templateSchema } from '../utils/print-templates'
import { useDesignerHistory } from '../utils/designer-history'
import { columnPercentage, setColumnPercentage, resizeAdjacentColumns, documentTableStyleSchema } from '../utils/document-table'
import { boxUnion, constrainBox, resizeBox, snapBox, transformBoxes } from '../utils/designer-geometry'
import { findQuoteLayer, independentLayerIds, patchQuoteLayer, quoteLayers, restoreQuoteLayer, setQuoteLayerBinding } from '../utils/quote-layers'
import { quoteBindingOptions, quoteDocumentBindingValues, quoteItemBindingValues } from '../utils/quote-bindings'

test('custom section lists are declarative text, reversible and keep headings', () => {
  const bullets = customSectionText('Features', 'Carbon filter\n• Auto backwash', 'bullets')
  assert.equal(bullets, 'Features\n• Carbon filter\n• Auto backwash')
  assert.equal(customSectionText('', '• Carbon filter\n• Auto backwash', 'numbered'), '1. Carbon filter\n2. Auto backwash')
  assert.equal(customSectionText('', '1. Carbon filter\n2. Auto backwash', 'paragraph'), 'Carbon filter\nAuto backwash')
})
test('table sizing roundtrips for both document adapters and rejects unsafe bounds', () => {
  const tableStyle = { rowHeight: 32, headerHeight: 12, cellPadding: 2, fontSize: 12, headerFontSize: 10, verticalAlign: 'middle' as const, borderWidth: .3, imageWidth: 30, imageHeight: 20, imageFit: 'contain' as const, imagePlacement: 'above' as const }
  const quote = defaultQuoteDesign(); quote.tableStyle = tableStyle
  assert.deepEqual(normalizeQuoteDesign(quote).tableStyle, tableStyle)
  const receipt = defaultTemplate('receipt'); receipt.elements.find(e => e.type === 'items')!.tableStyle = tableStyle
  assert.deepEqual(templateSchema.parse(receipt).elements.find(e => e.type === 'items')!.tableStyle, tableStyle)
  for (const invalid of [{ rowHeight: -1 }, { imageWidth: 1000 }, { fontSize: 0 }, { cellPadding: 100 }, { borderWidth: -1 }, { verticalAlign: 'unsafe' }]) assert.equal(documentTableStyleSchema.safeParse(invalid).success, false)
  assert.equal(normalizeQuoteDesign(defaultQuoteDesign()).tableStyle, undefined)
})
test('column percentages preserve total width, minimums, hidden groups and stable repeat input', () => {
  const columns = [{ width: 5 }, { width: 30 }, { width: 13 }, { width: 52 }]
  setColumnPercentage(columns, 1, 40, 3)
  assert.ok(Math.abs(columns.reduce((sum, c) => sum + c.width, 0) - 100) < 1e-8)
  assert.equal(columnPercentage(columns, 1), 40)
  const before = JSON.stringify(columns); setColumnPercentage(columns, 1, 40, 3); assert.equal(JSON.stringify(columns), before)
  setColumnPercentage(columns, 1, 1000, 3); assert.equal(columns[1].width, 91); assert.ok(columns.every(c => c.width >= 3))
  const moved = resizeAdjacentColumns(columns, 1, -10)
  assert.equal(moved[1].width, 81); assert.equal(moved[2].width, 13); assert.equal(moved[0].width, columns[0].width)
  assert.equal(columns[1].width, 91)
  assert.ok(resizeAdjacentColumns([{ width: 3 }, { width: 100 }, { width: 100 }], 1, 1).every(c => c.width >= 3))
  const row2 = [{ width: 20 }]; setColumnPercentage(row2, 0, 50); assert.equal(row2[0].width, 100)
})
test('page and template settings roundtrip; old quote defaults remain A4', () => {
  const legacy = defaultQuoteDesign()
  assert.equal(sheetDimensions(legacy.paperSize).value, 'A4')
  for (const size of ['A4', 'A5', 'Letter'] as const) {
    const draft = quoteDesignTemplate('professional'); draft.paperSize = size
    draft.sections.find(s => s.kind === 'text')!.border = true
    assert.deepEqual(normalizeQuoteDesign(draft), draft)
  }
  const small = defaultQuoteDesign(); small.paperSize = 'A5'
  small.sections.push({ ...small.sections[0], id: 'floating', kind: 'image', placement: 'absolute', width: 25, x: 120, y: 20 })
  assert.throws(() => normalizeQuoteDesign(small), /inside the selected page/)
})
test('receipt and label custom section heading/border survive schema validation', () => {
  for (const kind of ['receipt', 'label'] as const) {
    const template = defaultTemplate(kind)
    Object.assign(template.elements.find(e => e.type === 'text' || e.type === 'field')!, { type: 'text', heading: true, border: true, text: 'Features\n• Carbon filtration' })
    assert.equal(templateSchema.parse(template).elements[0].heading, true)
    assert.equal(templateSchema.parse(template).elements[0].border, true)
  }
})
test('all adapters use protected section operations, deep copies, limits and undo', () => {
  const draft = ref({ sections: [{ id: 'table', protected: true, columns: [{ label: 'Item' }] }, { id: 'text', protected: false, columns: [{ label: 'Body' }] }] })
  const selectedId = ref('table'); let busy = false
  const history = useDesignerHistory(draft)
  const engine = useDocumentSections({ sections: computed(() => draft.value.sections), selectedId, locked: () => busy, limit: 3, protected: s => s.protected })
  engine.remove(); engine.duplicate(); assert.equal(draft.value.sections.length, 2)
  selectedId.value = 'text'; history.begin(); engine.duplicate(); history.end()
  assert.equal(draft.value.sections.length, 3)
  draft.value.sections[2].columns[0].label = 'Independent'; assert.equal(draft.value.sections[1].columns[0].label, 'Body')
  engine.duplicate(); assert.equal(draft.value.sections.length, 3)
  busy = true; engine.move('text', -1); engine.remove(); assert.equal(draft.value.sections[0].id, 'table'); assert.equal(draft.value.sections.length, 3)
  busy = false; engine.drop(selectedId.value, 'table'); assert.equal(draft.value.sections[0].columns[0].label, 'Independent')
  history.undo(); assert.equal(draft.value.sections[0].id, 'table')
})

test('canvas geometry keeps groups proportional, snaps edges and respects page bounds', () => {
  const boxes = [{ x: 10, y: 20, width: 30, height: 10 }, { x: 50, y: 40, width: 20, height: 20 }]
  const union = boxUnion(boxes)
  assert.deepEqual(union, { x: 10, y: 20, width: 60, height: 40 })
  assert.deepEqual(transformBoxes(boxes, union, { x: 20, y: 30, width: 120, height: 80 }), [
    { x: 20, y: 30, width: 60, height: 20 }, { x: 100, y: 70, width: 40, height: 40 },
  ])
  assert.deepEqual(constrainBox({ x: -20, y: 300, width: 300, height: 20 }, 210, 297), { x: 0, y: 277, width: 210, height: 20 })
  const snapped = snapBox({ x: 10.5, y: 19.5, width: 30, height: 10 }, [{ x: 10, y: 20, width: 30, height: 10 }], { width: 210, height: 297 }, 1)
  assert.equal(snapped.box.x, 10); assert.equal(snapped.box.y, 20); assert.equal(snapped.guides.length, 2)
  const unsnapped = snapBox({ x: 12.3, y: 17.8, width: 30, height: 10 }, [], { width: 210, height: 297 }, .1, 5)
  assert.equal(unsnapped.box.x, 10); assert.equal(unsnapped.box.y, 20)
})

test('resize handles support aspect constraints, centered resize and minimum dimensions', () => {
  const box = { x: 10, y: 20, width: 40, height: 20 }
  const ratio = resizeBox(box, 'se', 20, 2, true)
  assert.equal(ratio.width / ratio.height, 2)
  const centered = resizeBox(box, 'se', 20, 10, false, true)
  assert.equal(centered.x + centered.width / 2, box.x + box.width / 2)
  assert.equal(centered.y + centered.height / 2, box.y + box.height / 2)
  const crossed = resizeBox(box, 'nw', 200, 200)
  assert.equal(crossed.width, 1); assert.equal(crossed.height, 1)
})

test('canvas frame and style JSON roundtrip without weakening required sections or image validation', () => {
  const design = defaultQuoteDesign(), text = design.sections.at(-1)!
  Object.assign(text, { placement: 'absolute', x: 20, y: 100, frameWidth: 80, frameHeight: 20, flowHeight: 12, rotation: 30,
    name: 'Footer', locked: true, groupId: 'group', opacity: .8, zIndex: 5, fontFamily: 'Georgia', color: '#336699', background: '#ffffee',
    radius: 2, borderColor: '#111111', borderWidth: .3, italic: true, underline: true, lineHeight: 1.2, letterSpacing: 1 })
  assert.deepEqual(normalizeQuoteDesign(design), design)
  for (const patch of [{ frameWidth: 220 }, { frameHeight: -1 }, { opacity: 2 }, { rotation: 360 }, { background: 'url(javascript:bad)' }, { fontFamily: 'unsafe' }]) {
    const invalid = structuredClone(design); Object.assign(invalid.sections.at(-1)!, patch)
    assert.throws(() => normalizeQuoteDesign(invalid))
  }
  const required = structuredClone(design); required.sections.find(s => s.kind === 'items')!.visible = false
  assert.throws(() => normalizeQuoteDesign(required), /one visible item table/)
  const invalidImage = structuredClone(design); invalidImage.sections.at(-1)!.image = 'data:image/svg+xml;base64,PHN2Zz4='
  assert.throws(() => normalizeQuoteDesign(invalidImage), /PNG or JPEG/)
})

test('nested layers keep bindings, hierarchy and inherited locks through validation and undo', () => {
  const design = quoteDesignTemplate('professional'), header = design.sections[0]
  const nameId = `${header.id}::company-name`, frameId = `${header.id}::brand`
  assert.equal(findQuoteLayer(design, nameId)?.parentId, `${header.id}::company-info`)
  patchQuoteLayer(design, nameId, { x: 12, y: -3, color: '#334455', fontSize: 24 })
  assert.equal(header.elements?.[0].x, 12)
  assert.deepEqual(normalizeQuoteDesign(design), design)
  assert.deepEqual(independentLayerIds(quoteLayers(design), [frameId, nameId]), [frameId])
  patchQuoteLayer(design, frameId, { locked: true })
  assert.ok(findQuoteLayer(design, nameId)?.locked)
  patchQuoteLayer(design, nameId, { x: 20 })
  assert.equal(header.elements?.find(e => e.key === 'company-name')?.x, 12)
  patchQuoteLayer(design, frameId, { locked: false })
  const original = structuredClone(header.elements![0])
  patchQuoteLayer(design, nameId, { x: 40 }); restoreQuoteLayer(design, nameId, original)
  assert.deepEqual(header.elements![0], original)
  header.elements!.push({ key: 'custom-frame', kind: 'frame', parent: 'brand', x: 5, y: 5 }, { key: 'custom-text', kind: 'text', parent: 'custom-frame', text: '<b>Plain text</b>' })
  assert.equal(findQuoteLayer(design, `${header.id}::custom-text`)?.parentId, `${header.id}::custom-frame`)
  assert.deepEqual(normalizeQuoteDesign(design), design)
})

test('nested JSON rejects cycles, unknown nodes, unsafe images and hiding or replacing required values', () => {
  const invalidLayers = [
    [{ key: 'a', kind: 'frame', parent: 'b' }, { key: 'b', kind: 'frame', parent: 'a' }],
    [{ key: 'unknown' }], [{ key: 'logo', parent: 'brand' }], [{ key: 'company-name', text: 'Hardcoded company' }],
    [{ key: 'logo', image: 'data:image/svg+xml;base64,PHN2Zz4=' }],
    [{ key: 'a', kind: 'text', parent: 'company-name', text: 'Invalid parent' }],
    [{ key: 'logo' }, { key: 'logo' }],
  ]
  for (const elements of invalidLayers) {
    const design = defaultQuoteDesign(); design.sections[0].elements = elements as any
    assert.throws(() => normalizeQuoteDesign(design))
  }
  for (const key of ['totals-box', 'grand-row', 'grand-value']) {
    const design = defaultQuoteDesign(); design.sections.find(s => s.kind === 'totals')!.elements = [{ key, visible: false }]
    assert.throws(() => normalizeQuoteDesign(design), /required document values/)
  }
})

test('existing and new layers can change data sources, disconnect, save and retain layout', () => {
  const design = quoteDesignTemplate('professional'), header = design.sections[0], id = `${header.id}::company-name`
  patchQuoteLayer(design, id, { x: 12, fontSize: 24, color: '#334455' })
  assert.equal(setQuoteLayerBinding(design, id, 'clientName'), true)
  assert.equal(findQuoteLayer(design, id)?.binding, 'clientName')
  assert.equal(findQuoteLayer(design, id)?.model.x, 12)
  assert.equal(setQuoteLayerBinding(design, id, '', 'Custom company heading'), true)
  assert.equal(findQuoteLayer(design, id)?.binding, '')
  assert.equal(findQuoteLayer(design, id)?.element?.text, 'Custom company heading')
  assert.deepEqual(normalizeQuoteDesign(design), design)
  setQuoteLayerBinding(design, id, 'companyName')
  assert.equal(findQuoteLayer(design, id)?.element?.binding, undefined)
  assert.equal(findQuoteLayer(design, id)?.element?.text, undefined)
  const text = design.sections.at(-1)!
  setQuoteLayerBinding(design, text.id, 'clientAddress')
  assert.equal(findQuoteLayer(design, `${text.id}::text-body`)?.binding, 'clientAddress')
  const field = newQuoteDesignSection('field', 'new-field'); design.sections.push(field)
  setQuoteLayerBinding(design, field.id, 'companyEmail')
  setQuoteLayerBinding(design, `${field.id}::field-value`, 'notes')
  assert.equal(field.field, 'notes')
  assert.equal(findQuoteLayer(design, field.id)?.binding, 'notes')
  header.elements!.push({ key: 'custom', kind: 'text', parent: 'brand', text: 'Text' })
  setQuoteLayerBinding(design, `${header.id}::custom`, 'terms')
  const image = newQuoteDesignSection('image', 'logo-copy'); design.sections.push(image)
  setQuoteLayerBinding(design, image.id, 'companyLogo')
  assert.deepEqual(normalizeQuoteDesign(design), design)
  patchQuoteLayer(design, `${header.id}::brand`, { locked: true })
  assert.equal(setQuoteLayerBinding(design, id, 'subject'), false)
})

test('bindings reject incompatible fields, row data outside row scope and changing required totals', () => {
  const design = quoteDesignTemplate('professional'), header = design.sections[0]
  assert.equal(setQuoteLayerBinding(design, `${header.id}::company-name`, 'companyLogo'), false)
  assert.equal(setQuoteLayerBinding(design, `${header.id}::logo`, 'clientName'), false)
  assert.equal(setQuoteLayerBinding(design, `${header.id}::company-name`, 'itemName'), false)
  const totals = design.sections.find(s => s.kind === 'totals')!
  assert.equal(setQuoteLayerBinding(design, `${totals.id}::grand-value`, 'clientName'), false)
  assert.equal(setQuoteLayerBinding(design, `${totals.id}::grand-value`, ''), false)
  const items = design.sections.find(s => s.kind === 'items')!
  items.elements = [{ key: 'row-copy', kind: 'text', parent: 'item-details', binding: 'row-quantity' }]
  assert.deepEqual(normalizeQuoteDesign(design), design)
  const invalid = [
    { section: header, element: { key: 'company-name', binding: 'companyLogo' } },
    { section: header, element: { key: 'company-name', binding: 'row-rate' } },
    { section: totals, element: { key: 'grand-value', binding: '' } },
    { section: items, element: { key: 'row-copy', kind: 'text', binding: 'row-quantity' } },
  ]
  for (const { section, element } of invalid) {
    const copy = structuredClone(design)
    copy.sections.find(s => s.id === section.id)!.elements = [element as any]
    assert.throws(() => normalizeQuoteDesign(copy))
  }
  assert.ok(!quoteBindingOptions('text').some(field => field.row))
  assert.ok(quoteBindingOptions('text', true).some(field => field.key === 'row-rate'))
})

test('binding values use supplied document and per-row data, preserving zeros and escaped text', () => {
  const line = { name: '<b>Product</b>', quantity: 0, unit: 'pcs', rate: 0, discount: 0, tax: 0, amount: 0 }
  const quote = { items: [line], discount: 0, discountType: 'amount', adjustment: 0, total: 0, clientName: '<script>Customer</script>', clientAddress: { city: 'Kochi', state: 'Kerala' } }
  const values = quoteDocumentBindingValues(quote, { name: 'Actual company', logo: 'javascript:alert(1)' })
  assert.equal(values.clientName, '<script>Customer</script>')
  assert.equal(values.companyName, 'Actual company')
  assert.equal(values.companyLogo, '')
  assert.match(values.clientAddress, /Kochi, Kerala/)
  assert.match(values.total, /0\.00/)
  const row = quoteItemBindingValues(line, 2)
  assert.equal(row['row-quantity'], '0 pcs')
  assert.equal(row['row-number'], '3')
  assert.equal(row.itemName, '<b>Product</b>')
})
