import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { writeDesignerAuditReport } from './designer-audit-report.mjs'

// Local fixtures only: no database, live settings writes or physical print jobs.
const folder = path.resolve(process.env.DESIGNER_AUDIT_DIR || `../artifacts/document-designer/audit-${new Date().toISOString().replace(/[:.]/g, '-')}`)
fs.mkdirSync(folder, { recursive: true })
const selection = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',')
const jobs = [
  ['unit', 'node_modules/tsx/dist/cli.mjs', '--test', '--test-concurrency=1',
    'tests/designer-rules.test.ts', 'tests/document-designer.test.ts', 'tests/erp-document-tables.test.ts', 'tests/print-templates.test.ts',
    'tests/receipt-pdf-sharing.test.ts', 'tests/receipt-data.test.ts', 'tests/print-label-routing.test.ts', 'tests/bluetooth-printing.test.ts',
    'tests/erp-quotes.test.ts', 'tests/quote-product-search.test.ts', 'tests/quote-preferences.test.ts', 'tests/sales-orders.test.ts', 'tests/erp-quotes-browser.test.ts'],
  ...['document-designer-browser', 'document-designer-page-browser', 'document-designer-layers-browser', 'document-designer-bindings-browser',
    'printer-designer-browser', 'print-template-browser', 'sheet-image-browser', 'receipt-audit-browser', 'printer-interactions-browser', 'designer-combinations-browser']
    .map(name => [name, 'tests/run-print-template-browser.mjs', `${name}.html`]),
  ['print-types', 'node_modules/vue-tsc/bin/vue-tsc.js', '-p', 'tests/tsconfig.print-templates.json'],
  ['quote-types', 'node_modules/vue-tsc/bin/vue-tsc.js', '-p', 'tests/tsconfig.erp-quotes.json'],
].filter(job => !selection || selection.includes(job[0]))
const previous = fs.existsSync(path.join(folder, 'results.json')) ? JSON.parse(fs.readFileSync(path.join(folder, 'results.json'), 'utf8')).results : []
const results = previous.filter(result => !jobs.some(job => job[0] === result.name))
console.log(`Audit results: ${folder}`)
for (const [name, ...args] of jobs) {
  console.log(`START ${name}`)
  const started = Date.now(), log = fs.createWriteStream(path.join(folder, `${name}.log`))
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { windowsHide: true, env: { ...process.env, PRINT_TEST_TIMEOUT_MS: '240000' } })
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false })
    child.on('error', reject); child.on('close', resolve)
  })
  await new Promise(resolve => log.end(resolve))
  const output = fs.readFileSync(path.join(folder, `${name}.log`), 'utf8')
  const result = { name, passed: code === 0, exitCode: code, durationMs: Date.now() - started, log: `${name}.log`,
    tests: Number(output.match(/# tests (\d+)/)?.[1]) || undefined, failures: Number(output.match(/# fail (\d+)/)?.[1]) || undefined }
  results.push(result)
  fs.writeFileSync(path.join(folder, 'results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2))
  writeDesignerAuditReport(folder, results)
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${name} (${Math.round(result.durationMs / 1000)}s)${result.tests ? `, ${result.tests} tests` : ''}`)
  if (!result.passed) console.log(output.slice(-2500))
}
if (results.some(result => !result.passed)) process.exitCode = 1
