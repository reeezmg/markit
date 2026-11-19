import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import { storefrontDesignOutcome } from '../server/utils/storefrontDesignOutcome'

function profileFixture({ previewStatus = 'READY', oldStatus = 'GENERATING', proof = true } = {}) {
  const source = ts.createSourceFile('design.ts', readFileSync('server/utils/storefrontDesign.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getStorefrontDesignProfile')!
  const js = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const writes: any[] = []
  const bindings = { exports: {} as any, ensureStorefrontDesignTable: async () => {}, storefrontDesignOutcome,
    storefrontUsesAws: async () => true, awsStorefrontRequest: async () => ({ previewStatus }),
    pool: { query: async (sql: string, args: any[]) => {
      if (sql.includes('FROM storefront_design_profiles')) return { rows: [{ status: oldStatus, conversationId: 'design-company' }] }
      if (sql.includes('FROM storefront_agent_sessions')) return { rows: [{ status: 'completed', runtimeResult: proof ? {
        codeChanged: true, beforeSha: 'starter', savedSha: 'designed', designValidation: { version: 1, passed: true,
          skill: '.agents/skills/storefront-design/SKILL.md', sourceFiles: ['src/style.css'], checks: [{ width: 390 }, { width: 1440 }] },
      } : { codeChanged: false } }] }
      writes.push({ sql, args }); return { rowCount: 1 }
    } },
  }
  new Function(...Object.keys(bindings), js)(...Object.values(bindings))
  return { run: () => bindings.exports.getStorefrontDesignProfile('company'), writes }
}

test('a verified design waits for its preview build before opening the editor', async () => {
  const fixture = profileFixture({ previewStatus: 'BUILDING' })
  const profile = await fixture.run()
  assert.equal(profile.status, 'GENERATING'); assert.equal(profile.stage, 'deploying_design_preview'); assert.equal(fixture.writes.length, 0)
})
test('a deployed verified design persists ready status', async () => {
  const fixture = profileFixture()
  assert.equal((await fixture.run()).status, 'READY')
  assert.equal(fixture.writes.length, 1); assert.ok(fixture.writes[0].sql.includes("SET status='READY'"))
})
test('an old falsely ready no-op run becomes retryable with an explanation', async () => {
  const fixture = profileFixture({ oldStatus: 'READY', proof: false })
  const profile = await fixture.run()
  assert.equal(profile.status, 'FAILED'); assert.match(profile.errorMessage, /without a verified design/)
  assert.equal(fixture.writes.length, 1)
})
test('a failed preview deployment never becomes ready', async () => {
  const fixture = profileFixture({ previewStatus: 'ERROR' })
  assert.equal((await fixture.run()).status, 'FAILED')
  assert.equal(fixture.writes.length, 1)
})
