import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
execFileSync(process.execPath, [path.join(root, 'scripts/generate-db-meta.mjs'), '--check'], { stdio: 'inherit' })
const source = fs.readFileSync(path.join(root, 'schema.zmodel'), 'utf8')
const meta = JSON.parse(fs.readFileSync(path.join(root, 'docs/database/dbMeta.json'), 'utf8'))
const modelCount = [...source.matchAll(/^(?:abstract\s+)?model\s+\w+/gm)].length
const enumCount = [...source.matchAll(/^enum\s+\w+/gm)].length
if (modelCount !== meta.counts.models || enumCount !== meta.counts.enums) {
  throw new Error(`Database documentation drift: schema=${modelCount}/${enumCount}, catalog=${meta.counts.models}/${meta.counts.enums}`)
}
for (const [name, model] of Object.entries(meta.models)) {
  if ((!model.abstract && !model.table) || !model.fields || !Object.keys(model.fields).length) throw new Error(`Incomplete metadata for ${name}`)
}
const described = Object.values(meta.models).reduce((sum, model) => sum + Object.values(model.fields).filter((field) => field.description).length, 0)
const runtimeColumns = meta.unmodeledRuntimeTables.reduce((sum, table) => sum + Object.keys(table.columns).length, 0)
const describedRuntimeColumns = meta.unmodeledRuntimeTables.reduce((sum, table) => sum + Object.values(table.columns).filter((column) => column.description).length, 0)
console.log(`Database inventory synchronized: ${modelCount} models, ${enumCount} enums, ${meta.counts.fields} effective fields (${described} explained); ${meta.unmodeledRuntimeTables.length} runtime tables, ${runtimeColumns} columns (${describedRuntimeColumns} explained)`)
