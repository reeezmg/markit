import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { QueryClient, VueQueryPlugin, dehydrate, hydrate, useQuery } from '@tanstack/vue-query';
import { Prisma } from '@prisma/client';
import { stringify, parse } from 'devalue';
import { serialize, deserialize } from '@zenstackhq/runtime/browser';

function setup(server: boolean, payload: any = null) {
  const state = ref(payload);
  const hooks = new Map<string, Function>();
  let client!: QueryClient;
  const App = { setup() {
    const query = useQuery({ queryKey: ['rows', 'branch'], queryFn: async () => { throw Error('Hydrated data must not refetch'); } });
    return () => h('table', [h('tbody', (query.data.value as any[] || []).map(row => h('tr', [h('td', row.name)])))]);
  } };
  const app = createSSRApp(App);
  const source = ts.transpileModule(readFileSync(process.env.VUE_QUERY_PLUGIN_SOURCE || 'plugins/vue-query.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/^import .*?;\r?\n/gm, '').replace('export default', 'return')
    .replaceAll('import.meta.server', String(server)).replaceAll('import.meta.client', String(!server));
  const PluginClient = class extends QueryClient { constructor(...args: any[]) { super(...args); client = this; } };
  const plugin = new Function('VueQueryPlugin', 'QueryClient', 'dehydrate', 'hydrate', 'defineNuxtPlugin', 'useState', 'serialize', 'deserialize', 'onNuxtReady', source)(
    VueQueryPlugin, PluginClient, dehydrate, hydrate, (fn: any) => fn, () => state, serialize, deserialize, (fn: Function) => hooks.set('app:suspense:resolve', fn));
  plugin({ vueApp: app, hooks: { hook: (name: string, fn: Function) => hooks.set(name, fn) } });
  return { app, client, state, hooks };
}

test('server query rows survive the Nuxt payload with isolated company caches', async () => {
  const server = setup(true);
  try {
    server.client.setQueryData(['rows', 'branch'], [{ name: 'Run-owned branch fixture' }]);
    const html = await renderToString(server.app);
    await server.hooks.get('app:rendered')!();
    assert.ok(server.state.value?.data.queries.length, 'Rendered query cache is serialized');
    const browser = setup(false, JSON.parse(JSON.stringify(server.state.value)));
    const otherRequest = setup(true);
    try {
      assert.equal(await renderToString(browser.app), html, 'Hydration starts with exactly the rendered table rows');
      assert.deepEqual(browser.client.getQueryData(['rows', 'branch']), [{ name: 'Run-owned branch fixture' }]);
      assert.equal(browser.client.getQueryState(['rows', 'branch'])?.fetchStatus, 'idle');
      assert.equal(otherRequest.client.getQueryData(['rows', 'branch']), undefined, 'Another request cannot see this company cache');
      assert.equal(browser.client.getQueryData(['rows', 'head']), undefined, 'Different company key remains empty');
    } finally { browser.client.clear(); otherRequest.client.clear(); }
  } finally { server.client.clear(); }
});

test('financial decimals and dates survive Nuxt query payload serialization', async () => {
  const server = setup(true);
  try {
    const when = new Date('2026-10-20T10:00:00.000Z');
    server.client.setQueryData(['rows', 'branch'], [{ name: 'Financial fixture', amount: new Prisma.Decimal('12.34'), when }]);
    await renderToString(server.app);
    await server.hooks.get('app:rendered')!();
    const payload = parse(stringify(server.state.value));
    const browser = setup(false, payload);
    try {
      const [record] = browser.client.getQueryData(['rows', 'branch']) as any[];
      assert.equal(record.amount.toString(), '12.34');
      assert.equal(record.amount.plus('0.66').toString(), '13');
      assert.ok(record.when instanceof Date);
      assert.equal(record.when.toISOString(), when.toISOString());
      assert.match(await renderToString(browser.app), /Financial fixture/);
    } finally { browser.client.clear(); }
  } finally { server.client.clear(); }
});
