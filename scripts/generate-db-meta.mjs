import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const sourcePath = path.join(root, 'schema.zmodel')
const outputPath = path.join(root, 'docs', 'database', 'dbMeta.json')
const markdownPath = path.join(root, 'docs', 'database', 'DB-CATALOG.md')
const explanationsPath = path.join(root, 'docs', 'database', 'dbExplanations.json')
const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n')
const ecommerceTablesPath = path.resolve(root, '..', 'ecommerce-api', 'api', 'app', 'tables.py')
const codeRoots = ['storetools/server', 'server', 'ecommerce-api/api/app']
const codeFiles = []
function gatherCodeFiles(directory) {
  if (!fs.existsSync(directory)) return
  let entries
  try { entries = fs.readdirSync(directory, { withFileTypes: true }) }
  catch (error) { if (error.code === 'EPERM' || error.code === 'EACCES') return; throw error }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) gatherCodeFiles(full)
    else if (/\.(?:ts|js|mjs|py)$/.test(entry.name)) codeFiles.push({
      path: path.relative(path.resolve(root, '..'), full).replaceAll('\\', '/'),
      text: fs.readFileSync(full, 'utf8'),
    })
  }
}
for (const directory of codeRoots) gatherCodeFiles(path.resolve(root, '..', directory))

function blocks(kind) {
  const result = []
  const re = new RegExp(`(?:abstract\\s+)?${kind}\\s+(\\w+)(?:\\s+extends\\s+(\\w+))?\\s*\\{`, 'g')
  let match
  while ((match = re.exec(source))) {
    let depth = 1
    let cursor = re.lastIndex
    while (cursor < source.length && depth) {
      if (source[cursor] === '{') depth++
      if (source[cursor] === '}') depth--
      cursor++
    }
    const before = source.slice(0, match.index)
    result.push({
      name: match[1],
      extends: match[2] || null,
      abstract: match[0].trimStart().startsWith('abstract'),
      body: source.slice(re.lastIndex, cursor - 1),
      line: before.split('\n').length,
    })
    re.lastIndex = cursor
  }
  return result
}

function splitTopLevel(text) {
  const parts = []
  let current = ''
  let round = 0
  let square = 0
  let quote = null
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quote) {
      current += char
      if (char === quote && text[i - 1] !== '\\') quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    if (char === '(') round++
    if (char === ')') round--
    if (char === '[') square++
    if (char === ']') square--
    if (/\s/.test(char) && round === 0 && square === 0) {
      if (current) parts.push(current), current = ''
    } else current += char
  }
  if (current) parts.push(current)
  return parts
}

function parseAttribute(token) {
  const match = token.match(/^@(\w+)(?:\((.*)\))?$/s)
  if (!match) return { raw: token }
  return { name: match[1], args: match[2] ?? null, raw: token }
}

function quotedArg(attributes, name) {
  const attr = attributes.find((item) => item.name === name)
  if (!attr?.args) return null
  return attr.args.match(/["']([^"']+)["']/)?.[1] || attr.args
}

function relationInfo(attributes) {
  const attr = attributes.find((item) => item.name === 'relation')
  if (!attr) return null
  const args = attr.args || ''
  const firstString = args.match(/^\s*["']([^"']+)["']/)?.[1] || null
  const fields = args.match(/fields\s*:\s*\[([^\]]*)\]/)?.[1]?.split(',').map((v) => v.trim()).filter(Boolean) || []
  const references = args.match(/references\s*:\s*\[([^\]]*)\]/)?.[1]?.split(',').map((v) => v.trim()).filter(Boolean) || []
  return { name: firstString, fields, references, raw: attr.raw }
}

// Human-authored explanations are kept apart from schema-derived metadata. New keys
// are deliberately empty so a schema change never acquires invented business meaning.
const savedExplanations = fs.existsSync(explanationsPath)
  ? JSON.parse(fs.readFileSync(explanationsPath, 'utf8')) : { models: {}, runtimeTables: {} }
const explanations = { models: {}, runtimeTables: {} }

const enumBlocks = blocks('enum')
const enums = Object.fromEntries(enumBlocks.map((block) => {
  const values = block.body.split('\n').map((line) => line.replace(/\/\/.*$/, '').trim()).filter((line) => line && !line.startsWith('@@'))
  return [block.name, { sourceLine: block.line, values }]
}))

const modelBlocks = blocks('model')
const modelNames = new Set(modelBlocks.map((block) => block.name))
const parsedModels = {}

for (const block of modelBlocks) {
  const fields = {}
  const modelAttributes = []
  const pendingComments = []
  const bodyLines = block.body.split('\n')
  for (let index = 0; index < bodyLines.length; index++) {
    const rawLine = bodyLines[index]
    const trimmed = rawLine.trim()
    if (!trimmed) { pendingComments.length = 0; continue }
    if (trimmed.startsWith('///')) { pendingComments.push(trimmed.slice(3).trim()); continue }
    if (trimmed.startsWith('//')) { pendingComments.push(trimmed.slice(2).trim()); continue }
    if (trimmed.startsWith('@@')) {
      modelAttributes.push(trimmed)
      pendingComments.length = 0
      continue
    }
    if (trimmed.startsWith('@')) continue
    const parts = splitTopLevel(trimmed)
    if (parts.length < 2) continue
    const [name, rawType, ...attributeTokens] = parts
    if (!/^\w+$/.test(name)) continue
    const list = rawType.endsWith('[]')
    const optional = rawType.endsWith('?')
    const type = rawType.replace(/\[\]$/, '').replace(/\?$/, '')
    const attributes = attributeTokens.filter((token) => token.startsWith('@')).map(parseAttribute)
    const relation = relationInfo(attributes)
    const kind = modelNames.has(type) ? 'relation' : Object.hasOwn(enums, type) ? 'enum' : 'scalar'
    const field = {
      kind, type, required: !optional && !list, list,
      column: quotedArg(attributes, 'map'),
      id: attributes.some((item) => item.name === 'id'),
      unique: attributes.some((item) => item.name === 'unique'),
      default: attributes.find((item) => item.name === 'default')?.args ?? null,
      relation,
      attributes: attributes.map((item) => item.raw),
      sourceLine: block.line + index + 1,
    }
    const inlineComment = trimmed.match(/\s\/\/\s*(.*)$/)?.[1]
    field.schemaComment = [...pendingComments, inlineComment].filter(Boolean).join(' ')
    if (!field.column) delete field.column
    if (!field.default) delete field.default
    if (!field.relation) delete field.relation
    if (!field.attributes.length) delete field.attributes
    fields[name] = field
    pendingComments.length = 0
  }
  const mapped = modelAttributes.find((attr) => attr.startsWith('@@map('))?.match(/["']([^"']+)["']/)?.[1]
  parsedModels[block.name] = {
    table: block.abstract ? null : mapped || block.name,
    abstract: block.abstract,
    extends: block.extends,
    sourceLine: block.line,
    attributes: modelAttributes,
    fields,
  }
}

// Materialize inherited fields so consumers see the complete effective model.
for (const model of Object.values(parsedModels)) {
  if (!model.extends || !parsedModels[model.extends]) continue
  model.fields = { ...parsedModels[model.extends].fields, ...model.fields }
  model.inheritedAttributes = parsedModels[model.extends].attributes
}

for (const [name, model] of Object.entries(parsedModels)) {
  const saved = savedExplanations.models?.[name] || {}
  const fields = Object.fromEntries(Object.keys(model.fields).map((field) => [field, saved.fields?.[field] || '']))
  explanations.models[name] = { purpose: saved.purpose || '', fields }
  model.description = explanations.models[name].purpose
  // These are searchable source references, not a claim that every match executes.
  const accessor = name[0].toLowerCase() + name.slice(1)
  const tablePattern = model.table && new RegExp(`\\b${model.table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  const accessorPattern = new RegExp(`\\b(?:prisma|db|tx|zenstack)\\.${accessor}\\b`)
  model.codeReferences = codeFiles.filter((file) =>
    (tablePattern && tablePattern.test(file.text)) || accessorPattern.test(file.text)
  ).map((file) => file.path)
  for (const [fieldName, field] of Object.entries(model.fields)) {
    field.description = fields[fieldName]
    field.descriptionSource = field.description ? 'dbExplanations.json' : 'unexplained'
  }
}

const meta = {
  source: 'storetools/schema.zmodel',
  sourceOfTruth: true,
  notes: [
    'Generated file: do not edit by hand.',
    'Regenerate with: node storetools/scripts/generate-db-meta.mjs',
    'Business explanations come from dbExplanations.json. Empty text means a human explanation is still required.',
  ],
  counts: {
    models: Object.keys(parsedModels).length,
    concreteModels: Object.values(parsedModels).filter((model) => !model.abstract).length,
    enums: Object.keys(enums).length,
    fields: Object.values(parsedModels).reduce((sum, model) => sum + Object.keys(model.fields).length, 0),
    explainedFields: Object.values(parsedModels).reduce((sum, model) => sum + Object.values(model.fields).filter((field) => field.description).length, 0),
  },
  enums,
  models: parsedModels,
  unmodeledRuntimeTables: [],
}

if (fs.existsSync(ecommerceTablesPath)) {
  const ddl = fs.readFileSync(ecommerceTablesPath, 'utf8')
  const createRe = /CREATE TABLE IF NOT EXISTS\s+([a-zA-Z_]\w*)\s*\(([^;]+)\);/gsi
  const modeledTables = new Set(Object.values(parsedModels).filter(model => model.table).map((model) => model.table.toLowerCase()))
  let create
  while ((create = createRe.exec(ddl))) {
    if (!modeledTables.has(create[1].toLowerCase())) {
      const tableName = create[1]
      const columns = create[2].split('\n').map((line) => line.trim().replace(/,$/, ''))
        .filter((line) => line && !/^(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK)\b/i.test(line))
        .map((line) => line.match(/^([a-zA-Z_]\w*)\s+(.+)$/))
        .filter(Boolean)
      const saved = savedExplanations.runtimeTables?.[tableName] || {}
      const fields = Object.fromEntries(columns.map(([, column]) => [column, saved.fields?.[column] || '']))
      explanations.runtimeTables[tableName] = { purpose: saved.purpose || '', fields }
      meta.unmodeledRuntimeTables.push({
        table: tableName, source: 'ecommerce-api/api/app/tables.py',
        explanation: explanations.runtimeTables[tableName].purpose,
        columns: Object.fromEntries(columns.map(([, column, declaration]) => [column, {
          declaration, description: fields[column],
        }])),
        warning: 'Created by ecommerce-api startup DDL but missing from schema.zmodel; reconcile this schema drift before changing the table.',
        codeReferences: codeFiles.filter((file) => file.text.includes(tableName)).map((file) => file.path),
        createSql: `CREATE TABLE IF NOT EXISTS ${tableName} (${create[2].trim()});`,
      })
    }
  }
}

const explanationOutput = `${JSON.stringify(explanations, null, 2)}\n`
if (process.argv.includes('--check')) {
  if (!fs.existsSync(explanationsPath) || fs.readFileSync(explanationsPath, 'utf8') !== explanationOutput) throw new Error('Database explanation keys differ from schema; regenerate and fill blank entries.')
} else fs.writeFileSync(explanationsPath, explanationOutput)

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
const jsonOutput = `${JSON.stringify(meta, null, 2)}\n`
if (process.argv.includes('--check')) {
  if (fs.readFileSync(outputPath, 'utf8') !== jsonOutput) throw new Error('Database catalog differs from source; regenerate it.')
} else fs.writeFileSync(outputPath, jsonOutput)

const md = [
  '# Storetools Database Catalog',
  '',
  '> Generated from `storetools/schema.zmodel` and editable `dbExplanations.json`. Do not edit this file manually. Run `node storetools/scripts/generate-db-meta.mjs`; new explanations start blank.',
  '',
  `- Models: **${meta.counts.models}** (${meta.counts.concreteModels} concrete)`,
  `- Enums: **${meta.counts.enums}**`,
  `- Effective fields: **${meta.counts.fields}**`,
  `- Fields with explanations: **${meta.counts.explainedFields}**${meta.counts.explainedFields < meta.counts.fields ? '; new fields remain blank pending review' : ''}`,
  '',
  'The complete machine-readable catalog, including every field attribute and relation mapping, is [`dbMeta.json`](./dbMeta.json).',
  'Edit model and field explanations in [`dbExplanations.json`](./dbExplanations.json), not in this generated catalog. A new model or field gets a blank explanation on regeneration. Existing wording is preserved.',
  'Code references are direct source-text or ORM-accessor matches in Storetools, the Express server and ecommerce-api. They help locate usage but do not prove a runtime path or explain business intent.',
  '',
  '## Enums',
  '',
  '| Enum | Values | Source |',
  '|---|---|---|',
  ...Object.entries(enums).map(([name, value]) => `| \`${name}\` | ${value.values.map((item) => `\`${item}\``).join(', ')} | \`schema.zmodel:${value.sourceLine}\` |`),
  '',
  '## Models',
  '',
]

if (meta.unmodeledRuntimeTables.length) {
  md.splice(13, 0, '## Unmodeled runtime tables', '', ...meta.unmodeledRuntimeTables.flatMap((table) => [
    `### ${table.table}`, '', table.explanation, '', table.warning, '',
    `Created in: \`${table.source}\`. References: ${table.codeReferences.map((ref) => `\`${ref}\``).join(', ')}.`, '',
    '| Column | SQL declaration | Meaning |', '|---|---|---|',
    ...Object.entries(table.columns).map(([column, value]) => `| \`${column}\` | \`${value.declaration.replaceAll('|', '\\|')}\` | ${value.description.replaceAll('|', '\\|')} |`), '',
    'Exact SQL declaration, including every column and constraint:', '', '```sql', table.createSql, '```', '',
  ]))
}

for (const [name, model] of Object.entries(parsedModels)) {
  md.push(`### ${name}`, '', `${model.abstract ? 'Abstract model; no physical table.' : `PostgreSQL table: \`${model.table}\`.`} Source: \`schema.zmodel:${model.sourceLine}\`.${model.extends ? ` Extends \`${model.extends}\`.` : ''}`, '', `Purpose: ${model.description}`, '')
  md.push(`Code references (direct text/accessor matches): ${model.codeReferences.map((ref) => `\`${ref}\``).join(', ') || 'No direct match in scanned server code.'}`, '')
  md.push('Declared constraints and policies:', '', '```prisma', ...model.attributes, '```', '')
  if (model.inheritedAttributes?.length) md.push('Inherited attributes (declarations; consult ZenStack policy composition):', '', '```prisma', ...model.inheritedAttributes, '```', '')
  md.push('| Field | Kind/type | Required | Column/default | Relation | Meaning |', '|---|---|---:|---|---|---|')
  for (const [fieldName, field] of Object.entries(model.fields)) {
    const type = `${field.kind}: ${field.type}${field.list ? '[]' : ''}`
    const storage = [field.column && `column \`${field.column}\``, field.default && `default \`${field.default}\``].filter(Boolean).join('; ')
    const relation = field.relation ? `${field.relation.fields.join(', ') || 'implicit'} → ${field.type}.${field.relation.references.join(', ') || 'implicit'}` : ''
    md.push(`| \`${fieldName}\` | ${type} | ${field.required ? 'yes' : 'no'} | ${storage} | ${relation} | ${field.description.replaceAll('|', '\\|')} |`)
  }
  md.push('')
}

const markdownOutput = `${md.join('\n')}\n`
if (process.argv.includes('--check')) {
  if (fs.readFileSync(markdownPath, 'utf8') !== markdownOutput) throw new Error('Database Markdown differs from source; regenerate it.')
} else fs.writeFileSync(markdownPath, markdownOutput)
console.log(`Generated ${outputPath} and ${markdownPath}`)
