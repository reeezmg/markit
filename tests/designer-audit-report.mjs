import fs from 'node:fs'
import path from 'node:path'

export function writeDesignerAuditReport(folder, results) {
  const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char])
  const readMatrix = name => {
    const file = path.join(folder, `${name}.log`)
    if (!fs.existsSync(file)) return null
    const match = fs.readFileSync(file, 'utf8').match(/(?:ALL PASSED|FAILED):\s*(\{[\s\S]*\})/)
    try { return match ? JSON.parse(match[1]) : null } catch { return null }
  }
  const combinations = readMatrix('designer-combinations-browser'), interactions = readMatrix('printer-interactions-browser')
  const failed = results.filter(result => !result.passed)
  const coverage = [
    ['Content and binding', 'Text, linked/manual values, prefixes/suffixes, empty/zero values, images, QR/barcode formats, item/tax tables; live document and product-row fields.'],
    ['Position and layout', 'Dragging/numeric moves, flow/fixed placement, all resize handles, aspect lock, rotation/flips, nested frames, multi-selection, align/distribute, snap/grid/zoom and gesture cancellation.'],
    ['Appearance', 'Font family/weight/size, alignment, line/letter spacing, text resizing, fill stacks, backgrounds, strokes, opacity/visibility, independent corners, padding and margins.'],
    ['Editing interactions', 'Nested grouping, resize and Undo/Redo, duplicate/copy/paste/ungroup, inherited locks, save/reopen, invalid nesting and layer/schema limits.'],
    ['Documents and persistence', 'Full-page quote/sales-order/receipt/label editors, template choices/defaults, retained drafts, failed save/load retry, company and role isolation using local API fixtures.'],
    ['Output', 'Growing tables/receipts, standard label/roll/sheet sizes, PDF geometry/pixels, image fitting and raster bytes for ESC/POS, TSPL and CPCL; mocked USB/Bluetooth routing and failures.'],
  ]
  const findings = [
    { issue: 'Grouping shifted contents when a printer frame stored padding; ungrouping still used rounded DOM geometry.', fix: 'Grouping and ungrouping use exact raster millimetres and the actual printer-frame child origin.', files: ['utils/print-designer.ts', 'components/DocumentDesigner/PrintEditor.vue'] },
    { issue: 'Numeric resize created a separate fixed-size-mode history edit, leaving that mode behind after Undo.', fix: 'The adapter changes resize mode and geometry in one transaction for printer and quote editors.', files: ['components/DocumentDesigner/ElementProperties.vue'] },
    { issue: 'Rotating a receipt frame could crop its lower corners from the output image.', fix: 'Receipt image bounds include transformed corners, including nested layers.', files: ['utils/print-template-renderer.client.ts'] },
    { issue: 'Group/paste/reparent operations could exceed eight nesting levels and invalidate the design.', fix: 'Check the resulting subtree depth before mutation; valid shallower operations remain available.', files: ['utils/print-designer.ts', 'components/DocumentDesigner/PrintEditor.vue'] },
  ]
  const report = { checkedAt: new Date().toISOString(), status: failed.length ? 'failed' : results.length < 13 ? 'partial' : 'passed', suites: results.length,
    unitTests: results.find(result => result.name === 'unit')?.tests, renderingCases: combinations?.cases,
    textPairwiseCases: combinations?.pairwiseCases, textPairsCovered: combinations?.pairsCovered,
    interactionCases: interactions?.cases, interactionAssertions: interactions?.checks, findings,
    supportedConstraints: ['At most 40 printer layers and eight nesting levels.', 'Growing receipt item/tax tables stay at the root and cannot be grouped or reparented through the editor.', 'Frame rotation must be reset before ungrouping; overlapping root receipt-flow children must be separated first.'],
    scope: coverage.map(([area, tested]) => ({ area, tested })),
    limitations: ['Finite selected scenarios and pairwise coverage, not all mathematical permutations.', 'Chromium desktop fixtures; Safari/Firefox/mobile touch and device-specific installed fonts are not verified.', 'API storage and USB/Bluetooth transports are mocked. No live company settings, database records or physical printers were changed.', 'Physical print quality and barcode/QR scanning still require real hardware.'], results }
  fs.writeFileSync(path.join(folder, 'report.json'), JSON.stringify(report, null, 2))
  const rows = results.map(result => `<tr><td>${escape(result.name)}</td><td class="${result.passed?'pass':'fail'}">${result.passed?'PASS':'FAIL'}</td><td>${Math.round(result.durationMs/1000)}s</td><td><a href="${escape(result.log)}">Log</a></td></tr>`).join('')
  const lists = values => values.map(text=>`<li>${escape(text)}</li>`).join('')
  fs.writeFileSync(path.join(folder, 'report.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Print editor audit</title><style>body{font:16px/1.55 system-ui;max-width:1040px;margin:40px auto;padding:0 24px;color:#1e293b}h1{margin-bottom:6px}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{border-bottom:1px solid #cbd5e1;text-align:left;padding:10px;vertical-align:top}.pass{color:#15803d}.fail{color:#b91c1c}small{color:#64748b}code{font-size:14px}</style><h1>Print editor audit: ${escape(report.status)}</h1><small>${escape(report.checkedAt)}</small><p>${report.unitTests||0} unit tests; ${report.renderingCases||0} rendering combinations (${report.textPairsCovered||0} text factor pairs); ${report.interactionCases||0} interaction workflows with ${report.interactionAssertions||0} assertions.</p><h2>Findings fixed</h2><ol>${findings.map(f=>`<li>${escape(f.issue)} <strong>${escape(f.fix)}</strong></li>`).join('')}</ol><h2>Coverage</h2><table><tr><th>Area</th><th>Checked scenarios</th></tr>${coverage.map(([area,tested])=>`<tr><td>${escape(area)}</td><td>${escape(tested)}</td></tr>`).join('')}</table><h2>Results</h2><table><tr><th>Suite</th><th>Result</th><th>Duration</th><th>Evidence</th></tr>${rows}</table><h2>Current editor constraints</h2><ul>${lists(report.supportedConstraints)}</ul><h2>Verification limits</h2><ul>${lists(report.limitations)}</ul><p>Repeat with <code>npm run test:designer-audit</code>. <a href="report.json">Machine-readable report</a>.</p></html>`)
}
