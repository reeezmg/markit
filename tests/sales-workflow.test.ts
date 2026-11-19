import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ref, computed, watch, toValue, effectScope, nextTick } from 'vue';
import ts from 'typescript';
import { normalizeSalesWorkflow, salesMenu } from '../utils/sales-workflow';
import { readSalesWorkflow, saveSalesWorkflow } from '../server/utils/sales-workflow';

test('simple and invoicing menus have the requested order and retain Settings', () => {
    assert.deepEqual(salesMenu(false).map(link => link.label), ['Billing', 'Sales', 'Credit', 'Settings']);
    assert.deepEqual(salesMenu(true).map(link => link.label), ['Quotes', 'Billing', 'Sales', 'Credit', 'Sales order', 'Recurring invoices', 'Retainer invoices', 'Payments received', 'Settings']);
    assert.deepEqual(normalizeSalesWorkflow(undefined), { version: 1, includeInvoicing: false, includeAfterSales: false });
    assert.deepEqual(normalizeSalesWorkflow({ includeInvoicing: 'true', includeAfterSales: null }), { version: 1, includeInvoicing: false, includeAfterSales: false });
    assert.deepEqual(normalizeSalesWorkflow({ includeInvoicing: true, includeAfterSales: true }), { version: 1, includeInvoicing: true, includeAfterSales: true });
    assert.equal(normalizeSalesWorkflow({ includeInvoicing: false }).includeInvoicing, false);
    assert.equal(normalizeSalesWorkflow({ includeInvoicing: false }).includeAfterSales, false);
    assert.equal(normalizeSalesWorkflow({ includeAfterSales: false }).includeAfterSales, false);
});
test('workflow persists per company, backs up prior settings, and reads without writing', async () => {
    const settings = new Map<string, any>(), backups = new Map<string, any>(); let writes = 0;
    const db = { query: async (sql: string, args: any[]) => {
        if (sql.startsWith('SELECT')) return { rows: settings.has(args[0]) ? [{ preference_value: settings.get(args[0]) }] : [] };
        writes++;
        if (sql.includes("'defaults-backup'")) { if (settings.has(args[0])) backups.set(args[0], structuredClone(settings.get(args[0]))); }
        else settings.set(args[1], JSON.parse(args[2]));
        return { rows: [] };
    } };
    assert.equal((await readSalesWorkflow(db, 'a')).includeInvoicing, false); assert.equal(writes, 0);
    await saveSalesWorkflow(db, 'a', { includeInvoicing: false });
    assert.equal((await readSalesWorkflow(db, 'a')).includeInvoicing, false);
    assert.equal((await readSalesWorkflow(db, 'b')).includeInvoicing, false);
    await saveSalesWorkflow(db, 'a', { includeInvoicing: true });
    assert.deepEqual(backups.get('a'), { version: 1, includeInvoicing: false, includeAfterSales: false });
    await saveSalesWorkflow(db, 'a', { includeAfterSales: true });
    assert.deepEqual(await readSalesWorkflow(db, 'a'), { version: 1, includeInvoicing: true, includeAfterSales: true });
    await saveSalesWorkflow(db, 'a', { includeInvoicing: false });
    assert.deepEqual(await readSalesWorkflow(db, 'a'), { version: 1, includeInvoicing: false, includeAfterSales: true });
    assert.equal((await readSalesWorkflow(db, 'b')).includeAfterSales, false);
});

function workflowHarness() {
    const source = readFileSync('composables/useSalesWorkflow.ts', 'utf8');
    const ast = ts.createSourceFile('workflow.ts', source, ts.ScriptTarget.Latest, true);
    const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast).replace(/^export /, '')).join('\n');
    const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const states = new Map<string, any>();
    const useState = (key: string, init: () => any) => { if (!states.has(key)) states.set(key, ref(init())); return states.get(key); };
    return new Function('ref', 'computed', 'watch', 'toValue', 'useState', 'normalizeSalesWorkflow', compiled + '\nreturn useSalesWorkflow;')(ref, computed, watch, toValue, useState, normalizeSalesWorkflow);
}
test('settings update sidebar immediately and stale reads cannot undo a saved choice', async () => {
    const create = workflowHarness(), active = ref('a'), branch = ref('b'), scope = effectScope();
    let finishRead!: (value: any) => void;
    const pending = new Promise(resolve => { finishRead = resolve; });
    const sidebar = scope.run(() => create(active, () => pending));
    const editor = scope.run(() => create(active, async (_url: string, options: any) => ({ preferences: { includeInvoicing: options?.body?.includeInvoicing ?? true, includeAfterSales: options?.body?.includeAfterSales ?? true }, canManage: true })));
    const other = scope.run(() => create(branch, async () => ({ preferences: { includeInvoicing: true, includeAfterSales: true }, canManage: true })));
    await nextTick(); await Promise.resolve();
    await editor.save({ includeInvoicing: false, includeAfterSales: false });
    assert.equal(sidebar.preferences.value.includeInvoicing, false);
    assert.equal(sidebar.preferences.value.includeAfterSales, false);
    assert.equal(other.preferences.value.includeInvoicing, true);
    assert.equal(other.preferences.value.includeAfterSales, true);
    finishRead({ preferences: { includeInvoicing: true }, canManage: true });
    await Promise.resolve(); await nextTick();
    assert.equal(sidebar.preferences.value.includeInvoicing, false);
    assert.equal(sidebar.preferences.value.includeAfterSales, false);
    scope.stop();
});
test('failed saves retain the saved mode and company switching ignores a late previous-company response', async () => {
    const create = workflowHarness(), company = ref('a'), scope = effectScope();
    let finish!: (value: any) => void;
    const workflow = scope.run(() => create(company, async (_url: string, options: any) => {
        if (options.method === 'PUT') throw Error('Rejected');
        if (options.headers['x-company-id'] === 'a') return new Promise(resolve => { finish = resolve; });
        return { preferences: { includeInvoicing: false }, canManage: true };
    }));
    company.value = 'b'; await nextTick(); await Promise.resolve();
    finish({ preferences: { includeInvoicing: true }, canManage: true }); await Promise.resolve(); await nextTick();
    assert.equal(workflow.preferences.value.includeInvoicing, false);
    await assert.rejects(workflow.save(true), /Rejected/);
    assert.equal(workflow.preferences.value.includeInvoicing, false);
    scope.stop();
});
