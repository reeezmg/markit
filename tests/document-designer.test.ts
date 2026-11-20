import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computed, ref } from 'vue'
import { customSectionText, sheetDimensions } from '../utils/document-designer'
import { useDocumentSections } from '../utils/document-designer-sections'
import { defaultQuoteDesign, normalizeQuoteDesign, quoteDesignTemplate } from '../utils/quote-design'
import { defaultTemplate, templateSchema } from '../utils/print-templates'
import { useDesignerHistory } from '../utils/designer-history'
import { columnPercentage, setColumnPercentage, resizeAdjacentColumns, documentTableStyleSchema } from '../utils/document-table'

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
