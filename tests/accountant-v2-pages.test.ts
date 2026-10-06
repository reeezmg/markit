import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, compileScript } from '@vue/compiler-sfc';
import ts from 'typescript';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createRouter, createMemoryHistory } from 'vue-router';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { accountantSections } from '../utils/accountant-navigation';

const errors: string[] = [];
let currentView = 'account-details';
Object.assign(globalThis, Vue, {
  useAccountantApi: () => ({ companyId: Vue.ref('test-company'), get: async () => ({ data: [], accounts: [], parties: [], projects: [], company: { currency: 'INR' } }) }),
  useNuxtApp: () => ({ $auth: { session: Vue.ref({ role: 'manager' }) } }),
  useToast: () => ({ add() {} }),
  useRoute: () => ({ path: `/accountant/${currentView}`, params: { view: currentView }, meta: {}, query: {} }),
  useRouter: () => ({ push() {} }),
});
mkdirSync('.cache/accountant-pages', { recursive: true });
for (const file of readdirSync('components/Accountant').filter(f => f.endsWith('.vue'))) {
  let source = readFileSync(`components/Accountant/${file}`, 'utf8');
  source = source.replace("from '~/utils/accountant-navigation'", `from '${pathToFileURL(resolve('utils/accountant-navigation.ts')).href}'`);
  source = source.replace(/import DataTable from .*?;/, 'const DataTable = { template: "<table><slot /></table>" };');
  const { descriptor, errors: parseErrors } = parse(source, { filename: file });
  assert.deepEqual(parseErrors, [], file);
  const script = compileScript(descriptor, { id: file, inlineTemplate: true });
  const output = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true });
  assert.equal(output.diagnostics?.length || 0, 0, file);
  const path = resolve('.cache/accountant-pages', file + '.mjs');
  writeFileSync(path, output.outputText);
  const component = (await import(pathToFileURL(path).href)).default;
  const views = file === 'AccountantManagementPage.vue'
    // Dedicated pages are selected before ManagementPage in pages/accountant/[view].vue.
    ? accountantSections.flatMap(s => s.links.map(([path]) => path)).filter(v => !['chart-of-accounts', 'money', 'ecommerce', 'manual-journals', 'account-transfers', 'contacts', 'projects'].includes(v))
    : ['account-details'];
  for (currentView of views) {
    const app = Vue.createSSRApp(component, file === 'Directory.vue' ? { kind: 'contacts' } : file === 'ErpConnection.vue' ? { companyId: 'test-company' } : {});
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:view', component }] });
    app.use(router);
    await router.push(`/${currentView}`);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    app.use(VueQueryPlugin, { queryClient });
    app.config.warnHandler = () => {};
    app.config.errorHandler = error => { errors.push(`${file}/${currentView}: ${String(error)}`); };
    await renderToString(app);
    queryClient.clear();
  }
}
assert.deepEqual(errors, []);
console.log('Accountant Vue templates compile and all management views render without setup errors.');
