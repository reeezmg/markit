import { spawnSync } from 'node:child_process'
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const folder = fileURLToPath(new URL('./', import.meta.url))
const files = readdirSync(folder).filter(file => file.endsWith('.test.ts')).sort().map(file => folder + file)
files.push(root + 'tests/billing-error.test.ts')
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', ...files], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
mkdirSync(folder + 'reports', { recursive: true })
writeFileSync(folder + 'reports/latest.tap', result.stdout || '')
const summary = { timestamp: new Date().toISOString(), exitCode: result.status, files: files.map(file => file.replace(root, '')), databaseAccess: false, ...Object.fromEntries(['tests', 'pass', 'fail', 'skipped'].map(key => [key, Number(result.stdout?.match(new RegExp(`^# ${key} (\\d+)`, 'm'))?.[1] ?? 0)])) }
writeFileSync(folder + 'reports/latest.json', JSON.stringify(summary, null, 2) + '\n')
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '')
if (result.error) console.error(result.error)
process.exit(result.status ?? 1)
