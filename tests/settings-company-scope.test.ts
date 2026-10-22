import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { ref } from 'vue';

function harness(target: string, active = 'head') {
  const calls: any[] = [];
  const auth = { session: ref({ companyId: active, billPrefix: 'HEAD', name: 'Head alias' }) };
  const scope = { companyId: ref(active), auth: { session: ref<any>({ companyId: active }) }, fetch() {},
    ready: Promise.resolve(), async selectCompany(id: string) {
      if (id !== active && !(active === 'head' && id === 'branch')) throw new Error('Company access denied');
      scope.companyId.value = id; scope.auth.session.value = { companyId: id };
    }, async refreshSettings() { calls.push({ refresh: scope.companyId.value }); } };
  const sessionSettings = new Proxy({}, { get: (_, key) => async (...args: any[]) => { calls.push({ helper: key, args }); } });
  const source = readFileSync('composables/useSettingsCompany.ts', 'utf8').replace(/^import .*;\r?\n/gm, '')
    .replace('export async function', 'async function');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = new Function('sessionSettings', 'useCompanyScope', 'useNuxtApp', 'useRoute', js + ';return useSettingsCompany();');
  return { calls, auth, scope, run: () => run(sessionSettings, () => scope, () => ({ $auth: auth }), () => ({ query: { entryCompany: target } })) };
}

test('all company-setting refresh helpers keep a head-office session unchanged when saving a branch', async () => {
  const h = harness('branch'); const before = JSON.stringify(h.auth.session.value);
  const settings = await h.run();
  const names = Object.keys(settings).filter(key => !['scope', 'auth', 'fetch', 'updateProfileDetails'].includes(key));
  assert.equal(names.length, 19);
  for (const name of names) await settings[name]('branch value');
  assert.equal(h.calls.filter(call => call.helper).length, 0, 'No branch values reach cookie-writing helpers');
  assert.equal(h.calls.filter(call => call.refresh === 'branch').length, names.length);
  assert.equal(JSON.stringify(h.auth.session.value), before);
});

test('active-company settings still synchronize their own session after saving', async () => {
  const h = harness('head'); const settings = await h.run();
  await settings.updatePrefixes({ billPrefix: 'NEW' });
  assert.deepEqual(h.calls, [{ helper: 'updatePrefixes', args: [{ billPrefix: 'NEW' }] }, { refresh: 'head' }]);
});

test('branch membership name changes preserve the head-office alias; global profile changes remain user-wide', async () => {
  const h = harness('branch'); const settings = await h.run();
  await settings.updateProfileDetails('Branch alias', null, undefined);
  assert.deepEqual(h.calls, [{ refresh: 'branch' }]);
  await settings.updateProfileDetails('Branch alias', 'new@example.invalid', null);
  assert.deepEqual(h.calls.at(-2), { helper: 'updateProfileDetails', args: [null, 'new@example.invalid', null] });
});

test('unrelated companies and branch-to-head selections reject before a settings page becomes usable', async () => {
  await assert.rejects(harness('unrelated').run(), /Company access denied/);
  await assert.rejects(harness('head', 'branch').run(), /Company access denied/);
});

test('an already-started branch save retains its original company when a new page selects another branch', async () => {
  const old = harness('branch'); const saved = await old.run();
  const next = harness('head'); await next.run();
  await saved.updatePrinterLabelSize('50x25mm');
  assert.deepEqual(old.calls, [{ refresh: 'branch' }]);
  assert.equal(next.calls.length, 0);
});

test('failed settings refresh rejects instead of reporting a successful save', async () => {
  const h = harness('branch'); const settings = await h.run();
  h.scope.refreshSettings = async () => { throw new Error('Refresh rejected'); };
  await assert.rejects(settings.updatePrefixes({ billPrefix: 'B' }), /Refresh rejected/);
  assert.equal(h.auth.session.value.billPrefix, 'HEAD');
});
