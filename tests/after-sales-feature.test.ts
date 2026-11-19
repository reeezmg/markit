import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { normalizeSalesWorkflow } from '../utils/sales-workflow';

function harness() {
    const states = new Map<string, any>();
    const useState = (key: string, init: () => any) => {
        if (!states.has(key)) states.set(key, Vue.ref(init()));
        return states.get(key);
    };
    const ast = ts.createSourceFile('feature.ts', readFileSync('composables/useAfterSalesFeature.ts', 'utf8'), ts.ScriptTarget.Latest, true);
    const source = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast).replace(/^export /, '')).join('\n');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const bindings = { ...Vue, useState, normalizeSalesWorkflow, onServerPrefetch: () => {} };
    const create = new Function(...Object.keys(bindings), js + '\nreturn useAfterSalesFeature;')(...Object.values(bindings));
    return { create, states };
}

test('after-sales controls use each row owner, default off, and react to workflow saves', async () => {
    const { create, states } = harness(), scope = Vue.effectScope();
    const owners = Vue.ref(['head', 'branch']);
    const requests: any[] = [];
    const feature = scope.run(() => create(owners, async (_url: string, options: any) => {
        requests.push(options.headers);
        return { preferences: options.headers['x-company-id'] === 'branch' ? { includeAfterSales: true } : {} };
    }));
    await feature.ready;
    assert.equal(feature.isEnabled('head'), false);
    assert.equal(feature.isEnabled('branch'), true);
    assert.equal(feature.isEnabled('foreign'), false);
    assert.equal(feature.enabled.value, false, 'Mixed tables must check each row owner');
    assert.ok(requests.every(headers => headers['x-company-id'] === headers['x-company-filter']));
    states.get('sales-workflow-settings').value.branch = normalizeSalesWorkflow({ includeAfterSales: false });
    assert.equal(feature.isEnabled('branch'), false, 'Settings saves hide controls immediately');
    scope.stop();
});

test('late reads cannot override a workflow save, cross company scope, or update after unmount', async () => {
    const { create, states } = harness(), scope = Vue.effectScope(), owner = Vue.ref('head');
    const pending: Array<(value: any) => void> = [];
    const feature = scope.run(() => create(owner, () => new Promise(resolve => pending.push(resolve))));
    states.get('sales-workflow-settings').value.head = normalizeSalesWorkflow({ includeAfterSales: false });
    states.get('sales-workflow-revisions').value.head = 1;
    pending[0]({ preferences: { includeAfterSales: true } }); await feature.ready;
    assert.equal(feature.enabled.value, false);
    owner.value = 'branch'; await Vue.nextTick();
    assert.equal(feature.isEnabled('head'), false);
    scope.stop(); pending[1]({ preferences: { includeAfterSales: true } });
    await Promise.resolve(); await Vue.nextTick();
    assert.equal(feature.enabled.value, false);
});

test('failed workflow reads keep optional inputs hidden', async () => {
    const { create } = harness(), scope = Vue.effectScope();
    const feature = scope.run(() => create(Vue.ref('company'), async () => { throw Error('Unavailable'); }));
    await feature.ready; assert.equal(feature.enabled.value, false); scope.stop();
});

async function renderControls(file: string, names: string[], enabled: boolean) {
    const source = parse(readFileSync(file, 'utf8')).descriptor.template!.content;
    const nodes = names.map(name => {
        const node = source.match(new RegExp('<' + name + '\\b[\\s\\S]*?\\/>'))?.[0];
        assert.ok(node, `${name} exists in ${file}`); return node;
    });
    const compiled = compileTemplate({ source: '<div>' + nodes.join('') + '</div>', filename: file, id: 'controls' });
    assert.deepEqual(compiled.errors, []);
    const code = ts.transpileModule(compiled.code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const module = { exports: {} as any }, require = createRequire(import.meta.url);
    new Function('require', 'module', 'exports', code)(require, module, module.exports);
    const mounted: string[] = [];
    const components = Object.fromEntries(names.map(name => [name, { render() { mounted.push(name); return Vue.h('span', name); } }]));
    const app = Vue.createSSRApp({ components, setup: () => ({
        afterSales: { enabled: Vue.ref(enabled) }, afterSalesEnabled: Vue.ref(enabled),
        isServiceUnitsOpen: true, row: { id: 'item', qty: 1 }, isSaving: false, bill: {},
        serialRegistration: { isCovered: () => true, owned: Vue.ref([]), setDetails() {} },
        hideCustomFields: false, isServiceProduct: false, serviceConfigurationIds: [],
        removedServiceUnitIds: [], serviceUnits: [], returnedServiceUnitIds: [], items: [], clientId: '',
        serviceCustomerRequired: false, route: { params: { salesId: 'bill' } },
    }), render: module.exports.render });
    await renderToString(app);
    return mounted;
}

test('disabled product, billing, invoice and numbering controls never mount their service components', async () => {
    for (const [file, names] of [
        ['components/AddProduct/Create.vue', ['UCheckbox', 'AfterSalesProductSelector']],
        ['pages/erp/edit/[salesId].vue', ['AfterSalesInvoiceUnits', 'BillingSerialNumbers']],
        ['pages/settings/numbering.vue', ['SettingsCustomerProductNumbering']],
    ] as Array<[string, string[]]>) {
        assert.deepEqual(await renderControls(file, names, false), [], file);
        assert.deepEqual(await renderControls(file, names, true), names, file);
    }
});

test('all affected Vue scripts and templates compile', () => {
    for (const file of ['components/AddProduct/Create.vue', 'pages/erp/billing.vue', 'pages/erp/edit/[salesId].vue',
        'pages/settings/numbering.vue', 'pages/client/index.vue', 'pages/order/ecomorders.vue',
        'components/Accountant/EcommercePage.vue', 'pages/after-sales.vue']) {
        const { descriptor, errors } = parse(readFileSync(file, 'utf8'), { filename: file });
        assert.deepEqual(errors, [], file);
        const script = compileScript(descriptor, { id: file });
        const result = compileTemplate({ source: descriptor.template!.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } });
        assert.deepEqual(result.errors, [], file);
    }
});
