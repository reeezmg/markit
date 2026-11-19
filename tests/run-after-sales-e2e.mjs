import { spawn } from 'node:child_process'
const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/after-sales-api.integration.test.ts'], {
  windowsHide: true, stdio: 'inherit', env: { ...process.env, TSX_TSCONFIG_PATH: 'tests/tsconfig.after-sales.json', AFTER_SALES_BROWSER_E2E: '1' }
})
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
