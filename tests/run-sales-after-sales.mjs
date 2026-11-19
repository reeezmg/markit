import { spawn } from 'node:child_process'

const browserOnly = process.argv.includes('--browser-only')
const env = { ...process.env, TSX_TSCONFIG_PATH: 'tests/tsconfig.after-sales.json', SALES_AFTER_SALES_BROWSER: '1' }
// A normal regression run always executes the complete combination matrix.
if (browserOnly) env.SALES_AFTER_SALES_CASE = '^browser:'
else delete env.SALES_AFTER_SALES_CASE
const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/sales-after-sales.integration.test.ts'], {
  windowsHide: true, stdio: 'inherit', env
})
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
