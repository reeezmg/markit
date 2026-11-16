import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';

test('daily blocks start together, render independently, reject stale data and lazily load details', async () => {
  const descriptor = parse(readFileSync('pages/reports/daily.vue', 'utf8'), { filename: 'daily.vue' }).descriptor;
  const script = compileScript(descriptor, { id: 'daily-loading' });
  assert.deepEqual(compileTemplate({ source: descriptor.template!.content, filename: 'daily.vue', id: 'daily-loading',
    compilerOptions: { bindingMetadata: script.bindings } }).errors, []);
  const js = ts.transpileModule(script.content, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const requests: { options: any; resolve: (value: any) => void; reject: (error: Error) => void }[] = [];
  const fetch = (_url: string, options: any) => new Promise((resolve, reject) => requests.push({ options, resolve, reject }));
  const bindings = {
    useCompanyScope: () => ({ fetch, auth: { session: Vue.ref({ companyId: 'fixture', cleanup: true }) } }),
    useToast: () => ({ add() {} }), usePrint: () => ({ printReport() {} }), useRoute: () => ({ query: {} }),
  };
  const require = createRequire(import.meta.url), module = { exports: {} as any };
  new Function('require', 'exports', 'module', ...Object.keys(bindings), js)(
    (name: string) => name === 'vue' ? Vue : require(name), module.exports, module, ...Object.values(bindings));
  let state: any;
  const component = module.exports.default;
  component.render = function(this: any) { state = this.$.setupState; return Vue.h('div'); };
  await renderToString(Vue.createSSRApp(component));
  const first = state.refresh();
  assert.deepEqual(requests.map(r => r.options.params.block), ['sales', 'expenses', 'money', 'balances', 'items']);
  assert.ok(requests.every(r => r.options.params.showCleanedValues === false));
  assert.ok(!requests.some(r => r.options.params.block === 'details'));
  requests[0].resolve({ totalSales: 123, salesByPaymentMethod: { Cash: 123 } });
  await new Promise(done => setImmediate(done));
  assert.equal(state.dashboard.totalSales, 123);
  assert.ok(state.ready('sales'));
  assert.ok(!state.ready('balances'));
  assert.equal(state.loading, true);
  const second = state.refresh();
  assert.ok(requests.slice(0, 5).every(r => r.options.signal.aborted));
  for (const request of requests.slice(1, 5)) request.resolve({ totalSales: 999 });
  await first;
  assert.equal(state.dashboard.totalSales, undefined, 'aborted results never populate the new range');
  for (const request of requests.slice(5)) {
    if (request.options.params.block === 'money') request.reject(new Error('Temporary failure'));
    else request.resolve({ [request.options.params.block]: true });
  }
  await second;
  assert.ok(state.ready('sales', 'expenses', 'balances', 'items'));
  assert.equal(state.blockStatus.money, 'error');
  assert.equal(state.blockErrors.money, 'Temporary failure');
  assert.equal(state.loading, false);
  assert.equal(state.lastUpdated, null, 'partial failure is not marked fully updated');
  state.detailsOpen = true;
  const details = state.loadDetails();
  await state.loadDetails();
  assert.equal(requests.length, 11, 'opening details starts only one request');
  requests[10].resolve({ salaryPayments: [{ amount: 10 }] });
  await details;
  assert.equal(state.dashboard.salaryPayments[0].amount, 10);
  assert.ok(state.ready('details'));
  const count = requests.length;
  state.selectedDate = { start: new Date('2026-11-16'), end: new Date('2025-11-16') };
  await state.refresh();
  assert.equal(requests.length, count, 'invalid ranges do not issue block requests');
  assert.equal(state.dashboard, null);
  assert.ok(state.error.includes('start date'));
});
