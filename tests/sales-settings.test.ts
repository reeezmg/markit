import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { ref, reactive, computed, watch } from 'vue';
import ts from 'typescript';

async function setup(file: string, bindings: Record<string, any>, exposed: string) {
    const { descriptor } = parse(readFileSync(file, 'utf8'));
    const ast = ts.createSourceFile('sales-settings.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
    const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
    const source = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const scope = { ref, reactive, computed, ...bindings };
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    return new AsyncFunction(...Object.keys(scope), source + `\nreturn {${exposed}};`)(...Object.values(scope));
}
async function accounts(role = 'manager') {
    const calls: any[] = [], notices: any[] = [], refreshes: any[] = [];
    const owner = ref('branch-a'); let fail = false;
    const data = { enabled: false, accounts: [], mappings: { cash: 'cash', bank: 'bank', sales: 'sales', receivable: 'credit', outputTax: 'tax', stock: 'stock', cogs: 'cogs', expense: 'old-expense', inputTax: 'old-input-tax' } };
    const scope = { companyId: owner, auth: { session: ref({ role }) }, fetch: async (url: string, options: any) => {
        calls.push({ url, ...structuredClone(options) });
        if (options.method === 'PUT') { if (fail) throw { data: { statusMessage: 'Account rejected' } }; data.mappings = options.body.mappings; }
        if (options.method === 'POST') data.enabled = true;
        return structuredClone(data);
    } };
    const vm = await setup('components/Sales/AccountSettings.vue', { useCompanyScope: () => scope, useSelectedAccounts: () => ({ refresh: async (id: string) => { refreshes.push(id); } }), useToast: () => ({ add: (n: any) => notices.push(n) }), onMounted: () => {} }, 'load,save,state,mappings,loading,busy,error');
    return { vm, calls, notices, refreshes, owner, data, fail: () => { fail = true; } };
}
test('sales account save merges current expense settings and targets the selected branch', async () => {
    const f = await accounts(); await f.vm.load();
    f.vm.mappings.sales = 'new-sales'; f.data.mappings.expense = 'newer-expense';
    f.data.mappings.inputTax = 'newer-input-tax';
    await f.vm.save();
    const write = f.calls.find(c => c.method === 'PUT');
    assert.equal(write.body.mappings.sales, 'new-sales');
    assert.equal(write.body.mappings.expense, 'newer-expense');
    assert.equal(write.body.mappings.inputTax, 'newer-input-tax');
    assert.ok(f.calls.every(c => c.headers['x-company-id'] === 'branch-a' && c.headers['x-company-filter'] === 'branch-a'));
    assert.deepEqual(f.refreshes, ['branch-a']); assert.equal(f.notices.length, 1);
    assert.equal(f.calls.filter(c => c.method === 'POST').length, 0, 'Saving must not enable accounting implicitly');
});
test('rejected saves clear loading without success; unauthorized roles never read or write accounting', async () => {
    const f = await accounts(); await f.vm.load(); f.fail(); await f.vm.save(true);
    assert.equal(f.vm.error.value, 'Account rejected'); assert.equal(f.vm.busy.value, false);
    assert.equal(f.notices.length, 0); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
    const denied = await accounts('staff'); await denied.vm.load(); await denied.vm.save();
    assert.equal(denied.calls.length, 0); assert.equal(denied.vm.loading.value, false);
});
test('settings tabs and preference editors preserve company context', async () => {
    const route = reactive({ path: '/erp/settings', query: { entryCompany: 'branch-a', section: 'printer' } as Record<string, string> });
    const locations: any[] = [];
    const scope = { companyId: ref('branch-a'), companies: ref([{ id: 'branch-a' }, { id: 'branch-b' }]) };
    const vm = await setup('components/Sales/SettingsPage.vue', { useSettingsCompany: async () => ({ scope }), useRoute: () => route, useRouter: () => ({ replace: async (to: any) => { locations.push(to); } }) }, 'links,section,selectCompany,preference,billingOpen,quoteOpen');
    assert.equal(vm.section.value, 'printer');
    assert.ok(vm.links.value.every((link: any) => link.to.query.entryCompany === 'branch-a'));
    await vm.selectCompany('branch-b'); assert.equal(locations[0].query.section, 'printer'); assert.equal(locations[0].query.entryCompany, 'branch-b');
    await vm.selectCompany('unrelated'); assert.equal(locations.length, 1);
    vm.preference.value = 'invoice'; assert.equal(vm.billingOpen.value, true); assert.equal(vm.quoteOpen.value, false);
    vm.preference.value = 'sales-order'; assert.equal(vm.quoteOpen.value, true);
    route.query.section = 'invalid'; assert.equal(vm.section.value, 'accounts');
});
test('new Sales settings route, reused editors and navigation compile', () => {
    for (const file of ['components/Sales/SettingsPage.vue', 'components/Sales/WorkflowSettings.vue', 'components/Sales/AccountSettings.vue', 'pages/settings/branches.vue', 'pages/erp/settings.vue', 'pages/erp.vue', 'layouts/default.vue', 'pages/settings/printer.vue', 'pages/settings/numbering.vue']) {
        const { descriptor, errors } = parse(readFileSync(file, 'utf8'), { filename: file }); assert.deepEqual(errors, []);
        const script = descriptor.scriptSetup ? compileScript(descriptor, { id: file }) : null;
        const template = compileTemplate({ source: descriptor.template!.content, filename: file, id: file, compilerOptions: { bindingMetadata: script?.bindings } });
        assert.deepEqual(template.errors, [], file);
    }
});

test('company workflow editor guards duplicate and denied saves and reports rejected persistence', async () => {
    const writes: any[] = [];
    let rejectSave!: (error: any) => void;
    const workflow = {
        preferences: ref({ includeInvoicing: true, includeAfterSales: false }),
        loading: ref(false), canManage: ref(true), error: ref(''),
        save: async (value: any) => { writes.push(value); await new Promise((_resolve, reject) => { rejectSave = reject; }); },
    };
    const vm = await setup('components/Sales/WorkflowSettings.vue', {
        watch, defineProps: () => ({ companyId: 'branch-a' }), useRequestFetch: () => () => {},
        useSalesWorkflow: (companyId: any) => { assert.equal(companyId.value, 'branch-a'); return workflow; },
    }, 'includeInvoicing,includeAfterSales,busy,error,saved,save');
    assert.equal(vm.includeAfterSales.value, false, 'Existing disabled setting is loaded');
    vm.includeInvoicing.value = false; vm.includeAfterSales.value = true;
    const pending = vm.save(); await vm.save();
    assert.deepEqual(writes, [{ includeInvoicing: false, includeAfterSales: true }]);
    assert.equal(vm.busy.value, true);
    rejectSave({ data: { statusMessage: 'Save rejected' } }); await pending;
    assert.equal(vm.error.value, 'Save rejected'); assert.equal(vm.saved.value, false);
    assert.equal(vm.busy.value, false);
    assert.equal(workflow.preferences.value.includeAfterSales, false, 'Rejected save retains persisted visibility');
    workflow.canManage.value = false; await vm.save();
    assert.equal(writes.length, 1);
});
