import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'

test('client Actions menu routes service history using the client identity and row company', () => {
  const file = 'pages/client/index.vue'
  const source = ts.createSourceFile(file, parse(fs.readFileSync(file, 'utf8')).descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true)
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'action') expression = node.initializer.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert(expression, 'Client row actions are available')
  const script = ts.transpileModule(`const subject = ${expression}; subject;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const enabled = new Set(['head-office', 'branch'])
  const actions = vm.runInNewContext(script, { afterSales: { isEnabled: id => enabled.has(id) }, editClient() {}, removeClient() {} })
  for (const companyId of ['head-office', 'branch']) {
    const row = { id: `${companyId}:shared-client`, clientId: 'shared-client', companyId }
    const items = actions(row).flat()
    const item = items.find(item => item.label === 'Service history')
    assert(item)
    assert.deepEqual(JSON.parse(JSON.stringify(item.to)), {
      path: '/after-sales/customers/shared-client', query: { entryCompany: companyId }
    })
    assert(items.some(item => item.label === 'Edit'))
    assert(items.some(item => item.label === 'Delete'))
  }
  enabled.delete('branch')
  assert(!actions({ clientId: 'shared-client', companyId: 'branch' }).flat().some(item => item.label === 'Service history'))
  assert(actions({ clientId: 'shared-client', companyId: 'head-office' }).flat().some(item => item.label === 'Service history'))
})
