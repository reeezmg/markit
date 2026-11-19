import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

function fixture(options: { session?: any; error?: any; recoveryRows?: number } = {}) {
  const source = ts.createSourceFile('agent.ts', readFileSync('server/utils/storefrontAgent.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const declarations = source.statements.filter(node => ts.isFunctionDeclaration(node)
    && ['startStorefrontInteraction', 'getStorefrontInteraction', 'releaseUnacceptedStorefrontStart'].includes(node.name?.text || ''))
  const js = ts.transpileModule(declarations.map(node => node.getText(source)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const queries: { sql: string; values: any[] }[] = []
  let starts = 0
  const bindings = {
    exports: {} as any,
    pool: { query: async (sql: string, values: any[] = []) => {
      queries.push({ sql, values })
      if (sql.includes('SELECT repository_full_name')) return { rows: [{ repositoryFullName: 'fixture', status: 'READY' }] }
      if (sql.includes('SELECT interaction_id AS')) return { rows: options.session ? [options.session] : [] }
      if (sql.includes('UPDATE storefront_agent_sessions s')) return { rowCount: options.recoveryRows ?? 1 }
      if (sql.includes('INSERT INTO storefront_agent_sessions')) return { rowCount: 1, rows: [{ id: 'row', reservationVersion: 'version-1' }] }
      if (sql.includes('SET interaction_id = $3')) return { rowCount: 1 }
      throw new Error(`Unexpected query: ${sql}`)
    } },
    ensureStorefrontAgentSessionsTable: async () => {},
    storefrontUsesAws: async () => true,
    awsStorefrontRequest: async () => ({ main: 'sha-main', preview: 'sha-preview' }),
    storefrontTransport: async () => ({ default: 'bedrock:moonshotai.kimi-k2.5', models: [{ key: 'bedrock:moonshotai.kimi-k2.5', supportsImages: true }] }),
    orchestratorRequest: async () => {
      starts++
      if (options.error) throw options.error
      return { status: 'in_progress', stage: 'working', interactionId: 'accepted-turn', environmentId: 'env' }
    },
    createError: (value: any) => Object.assign(new Error(value.statusMessage), value),
    console,
  }
  new Function(...Object.keys(bindings), js)(...Object.values(bindings))
  const args = { runtime: {}, companyId: 'company', userId: 'user', conversationId: 'conversation', prompt: 'Design the storefront', displayPrompt: 'Design' }
  return { args, queries, starts: () => starts, run: (input = args) => bindings.exports.startStorefrontInteraction(input),
    poll: () => bindings.exports.getStorefrontInteraction(args),
    releases: () => queries.filter(item => item.sql.includes('UPDATE storefront_agent_sessions s')) }
}

test('missing user identity is rejected before any reservation or remote call', async () => {
  const current = fixture()
  await assert.rejects(current.run({ ...current.args, userId: '' }), (error: any) => error.statusCode === 400)
  assert.equal(current.queries.length, 0)
  assert.equal(current.starts(), 0)
})

test('explicit rejected start releases only its own unaccepted reservation and preserves the error', async () => {
  const error = Object.assign(new Error('Invalid model'), { statusCode: 400 })
  const current = fixture({ error })
  await assert.rejects(current.run(), caught => caught === error)
  assert.equal(current.releases().length, 1)
  assert.deepEqual(current.releases()[0].values, ['company', 'conversation', 'version-1'])
  const sql = current.releases()[0].sql
  for (const guard of ['interaction_id IS NULL', 'pending_prompt IS NULL', "'dispatching','running','stopping'", 'updated_at::text=$3', "e.state='processing'"]) {
    assert.ok(sql.includes(guard), `Missing acceptance/race guard: ${guard}`)
  }
})

for (const error of [Object.assign(new Error('Timeout'), { name: 'TimeoutError' }), Object.assign(new Error('Service unavailable'), { statusCode: 503 }), Object.assign(new Error('Rate limited'), { statusCode: 429 })]) {
  test(`ambiguous ${error.message} keeps the reservation for reconciliation`, async () => {
    const current = fixture({ error })
    await assert.rejects(current.run(), caught => caught === error)
    assert.equal(current.releases().length, 0)
  })
}

test('retry recovers an expired unaccepted reservation then starts normally', async () => {
  const current = fixture({ session: { status: 'queued', interactionId: null } })
  const result = await current.run()
  assert.equal(result.status, 'in_progress')
  assert.equal(current.starts(), 1)
  assert.deepEqual(current.releases()[0].values, ['company', 'conversation', null])
  assert.ok(current.releases()[0].sql.includes("updated_at < NOW()-INTERVAL '2 minutes'"))
})

test('a fresh reservation or one accepted concurrently is not recoverable', async () => {
  const current = fixture({ session: { status: 'queued', interactionId: null }, recoveryRows: 0 })
  await assert.rejects(current.run(), (error: any) => error.statusCode === 409)
  assert.equal(current.starts(), 0)
})

for (const status of ['queued', 'in_progress', 'requires_action']) {
  test(`accepted ${status} interaction still blocks a duplicate start`, async () => {
    const current = fixture({ session: { status, interactionId: 'accepted-turn' } })
    await assert.rejects(current.run(), (error: any) => error.statusCode === 409)
    assert.equal(current.releases().length, 0)
    assert.equal(current.starts(), 0)
  })
}

test('new reservation clears an older completed turn ID so failed starts can recover', async () => {
  const current = fixture({ session: { status: 'completed', interactionId: 'old-turn' } })
  await current.run()
  const reserve = current.queries.find(item => item.sql.includes('INSERT INTO storefront_agent_sessions'))!
  assert.ok(reserve.sql.includes('interaction_id = NULL'))
  assert.ok(reserve.sql.includes('RETURNING id, updated_at::text'))
})

test('status polling releases an expired pre-dispatch reservation after a server crash', async () => {
  const current = fixture({ session: { status: 'queued', interactionId: null } })
  await assert.rejects(current.poll(), (error: any) => error.statusCode === 404)
  assert.equal(current.releases().length, 1)
  assert.deepEqual(current.releases()[0].values, ['company', 'conversation', null])
  assert.equal(current.starts(), 0)
})
