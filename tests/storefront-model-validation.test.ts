import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import { isStorefrontModelKey } from '../server/utils/storefrontModel'

const catalog = JSON.parse(readFileSync('../orchestrator/bedrock-models.json', 'utf8'))

function route(kind: 'design' | 'chat', model?: string) {
  const file = kind === 'design'
    ? 'server/api/ecommerce-cms/storefront-design/index.post.ts'
    : 'server/api/ecommerce-cms/storefront-agent/chat.post.ts'
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const code = source.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(source)).join('\n')
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const calls: any[] = []
  const profiles: any[] = []
  const bindings = {
    exports: {} as any,
    defineEventHandler: (handler: any) => handler,
    requireAuthSession: async () => ({ data: { companyId: 'company-fixture', id: 'user-fixture' } }),
    readBody: async () => ({ model, userId: 'untrusted-user', companyId: 'untrusted-company', companyDescription: 'Accessories store', designDirection: 'Warm minimal',
      conversationId: 'conversation-fixture', prompt: 'Change the header', displayPrompt: 'Change the header' }),
    createError: (value: any) => Object.assign(new Error(value.statusMessage), value),
    useRuntimeConfig: () => ({}),
    isStorefrontModelKey,
    shouldAutoPlanStorefrontTask: () => false,
    saveGeneratingDesignProfile: async (...args: any[]) => { profiles.push(args) },
    failDesignProfile: async () => assert.fail('Valid models must reach the interaction'),
    startStorefrontInteraction: async (args: any) => { calls.push(args); return { interactionId: 'interaction-fixture' } },
  }
  new Function(...Object.keys(bindings), js)(...Object.values(bindings))
  return { run: () => bindings.exports.default({}), calls, profiles }
}

for (const kind of ['design', 'chat'] as const) {
  for (const model of [...catalog.models.map((item: any) => item.key), 'gemini-3.1-pro', 'byok:12345678-1234-1234-1234-123456789abc']) {
    test(`${kind} forwards supported model key ${model} to the interaction`, async () => {
      const current = route(kind, model)
      await current.run()
      assert.equal(current.calls.length, 1)
      assert.equal(current.calls[0].model, model)
      assert.equal(current.calls[0].userId, 'user-fixture')
      assert.equal(current.calls[0].companyId, 'company-fixture')
      assert.ok(current.calls[0].conversationId)
      assert.ok(current.calls[0].prompt)
    })
  }
  for (const model of ['bedrock:', 'bedrock:../../model', 'bedrock:model\nother', 'bedrock:model:', 'bedrock:model:abc', 'bedrock:model:0:1', 'bedrock:model:1234', `bedrock:${'a'.repeat(73)}`, 'byok:other-company', 'https://model.example']) {
    test(`${kind} rejects malformed model ${JSON.stringify(model)} before saving or starting`, async () => {
      const current = route(kind, model)
      await assert.rejects(current.run(), (error: any) => error.statusCode === 400 && error.message === 'Invalid model')
      assert.equal(current.calls.length, 0)
      assert.equal(current.profiles.length, 0)
    })
  }
}

test('chat without a model preserves sticky/default model selection', async () => {
  const current = route('chat')
  await current.run()
  assert.equal(current.calls[0].model, undefined)
})
