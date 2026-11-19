import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ref, computed, effectScope, nextTick } from 'vue';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { useBillingSerialNumbers } from '../composables/useBillingSerialNumbers';
import { composable, harness } from './billing/harness';

function fixture(rows: any[] = [{ id: 'item', qty: 2, name: 'Product' }], enabled = true) {
    const scope = effectScope(), items = ref(rows), client = ref('client'), active = ref(enabled), company = ref('branch');
    const calls: any[] = [];
    const api = scope.run(() => useBillingSerialNumbers(items, client, active, company, async (url: string, options: any) => {
        calls.push({ url, ...options });
        return url.endsWith('sale-context') ? [{ item_id: 'item' }]
            : [{ id: 'owned', item_id: 'item', status: 'ACTIVE', serial_number: 'RETURN-1' }];
    }))!;
    return { api, items, client, active, company, calls, stop: () => scope.stop() };
}

test('serials map to each line and unit, including duplicate products, and trim reduced quantities', async t => {
    const f = fixture([{ id: 'item', qty: 2 }, { id: 'item', qty: 1 }, { id: 'plain', qty: 1 }]); t.after(f.stop);
    await f.api.ready;
    const [first, second] = f.items.value;
    assert.notEqual(first.serviceLineKey, second.serviceLineKey);
    f.api.setSerial(first, 0, ' A-1 '); f.api.setSerial(first, 1, 'A-2'); f.api.setSerial(second, 0, 'B-1');
    assert.deepEqual(f.api.serviceUnits.value.map(unit => [unit.lineKey, unit.unit, unit.serialNumber]), [
        [first.serviceLineKey, 0, 'A-1'], [first.serviceLineKey, 1, 'A-2'], [second.serviceLineKey, 0, 'B-1'],
    ]);
    assert.equal(f.api.isCovered(f.items.value[2]), false);
    first.qty = 1;
    assert.equal(f.api.serviceUnits.value.some(unit => unit.serialNumber === 'A-2'), false);
    f.items.value.splice(1, 1);
    assert.deepEqual(f.api.serviceUnits.value.map(unit => unit.serialNumber), ['A-1']);
    first.id = 'other';
    assert.deepEqual(first.serviceSerialNumbers, [], 'Changing the stock item cannot reuse its previous serial');
});

test('serials survive real billing draft storage and switching without crossing drafts', async t => {
    const draft = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(draft.stop);
    await draft.mount();
    draft.result.items.value = [{ id: 'item', qty: 1, category: [], rate: 10, value: 10 }];
    const scope = effectScope(); t.after(() => scope.stop());
    const serials = scope.run(() => useBillingSerialNumbers(draft.result.items, draft.result.clientId, ref(true), ref('company'), async () => [{ item_id: 'item' }]))!;
    await serials.ready; serials.setSerial(draft.result.items.value[0], 0, 'DRAFT-1'); await nextTick();
    const original = draft.result.billNo.value;
    assert.match(draft.storage.get(draft.result.LOCAL_BILLS_KEY)!, /DRAFT-1/);
    draft.result.createNewBill(); await nextTick();
    assert.equal(serials.serviceUnits.value.length, 0);
    draft.result.loadBill(original); await nextTick(); await serials.waitUntilReady();
    assert.equal(draft.result.items.value[0].serviceSerialNumbers[0], 'DRAFT-1');
    assert.equal(serials.serviceUnits.value[0].serialNumber, 'DRAFT-1');
});

test('disabled after-sales hides serial state from saves and does not fetch optional service APIs', async t => {
    const f = fixture([{ id: 'item', qty: 1, serviceSerialNumbers: ['KEPT'] }], false); t.after(f.stop);
    await f.api.ready;
    assert.equal(f.calls.length, 0); assert.equal(f.api.required.value, false);
    assert.deepEqual(f.api.serviceUnits.value, []);
    assert.deepEqual(f.items.value[0].serviceSerialNumbers, ['KEPT']);
    f.active.value = true; await f.api.waitUntilReady();
    assert.equal(f.api.serviceUnits.value[0].serialNumber, 'KEPT');
    assert.ok(f.calls.every(call => call.headers['x-company-id'] === 'branch'));
});

test('modal details include date-only units and remain attached to the same draft unit', async t => {
    const f = fixture(); t.after(f.stop); await f.api.ready;
    f.api.setDetails(f.items.value[0], [
        { serialNumber: 'ONE', deliveredOn: '2026-11-17', installedOn: '2026-11-18' },
        { serialNumber: '', deliveredOn: '', installedOn: '2026-11-19' },
    ]);
    assert.equal(f.api.serviceUnits.value.length, 2);
    assert.equal(f.api.serviceUnits.value[1].installedOn, '2026-11-19');
    f.items.value[0].qty = 1;
    assert.deepEqual(f.items.value[0].serviceInstalledDates, ['2026-11-18']);
    assert.equal(f.api.serviceUnits.value[0].deliveredOn, '2026-11-17');
});

test('modal edits are staged until Confirm and reopening after Cancel restores draft values', () => {
    const { descriptor } = parse(readFileSync('components/Billing/SerialNumbers.vue', 'utf8'));
    const ast = ts.createSourceFile('modal.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
    const nodes = ast.statements.filter(node => /^(const (open|details|draftReturns|count|returnOptions|selectedReturns)\b|function (show|selectReturns|confirm)\b)/.test(node.getText(ast))).map(node => node.getText(ast)).join('\n');
    const js = ts.transpileModule(nodes, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const events: any[] = [];
    const props = { item: { id: 'item', qty: 1, serviceSerialNumbers: ['OLD'] }, covered: true, owned: [], returnedUnitIds: [], disabled: false };
    const modal = new Function('props', 'ref', 'computed', 'emit', js + '\nreturn {open,details,show,confirm};')(props, ref, computed, (...event: any[]) => events.push(event));
    modal.show(); modal.details.value[0].serialNumber = 'CANCELLED'; modal.open.value = false;
    assert.equal(events.length, 0); assert.equal(props.item.serviceSerialNumbers[0], 'OLD');
    modal.show(); assert.equal(modal.details.value[0].serialNumber, 'OLD');
    modal.details.value[0].serialNumber = 'CONFIRMED'; modal.confirm();
    assert.equal(events[0][0], 'details'); assert.equal(events[0][1][0].serialNumber, 'CONFIRMED');
    assert.equal(modal.open.value, false);
});

test('covered returns keep exact-unit selection and ignore stale client reads', async t => {
    const f = fixture([{ id: 'item', qty: 1, return: true }]); t.after(f.stop);
    await f.api.ready;
    assert.equal(f.api.owned.value[0].serial_number, 'RETURN-1');
    f.api.returnedUnitIds.value = ['owned'];
    f.items.value.push({ id: 'plain', qty: 1 }); await f.api.waitUntilReady();
    assert.deepEqual(f.api.returnedUnitIds.value, ['owned']);
    f.client.value = ''; await f.api.waitUntilReady();
    assert.deepEqual(f.api.returnedUnitIds.value, []); assert.deepEqual(f.api.owned.value, []);
});

test('billing uses a gated row action instead of a serial column or registration panel', () => {
    const file = 'pages/erp/billing.vue', source = readFileSync(file, 'utf8');
    assert.ok(!source.includes('<AfterSalesSaleRegistration'));
    for (const enabled of [false, true]) {
        const h = harness(file, ['columns'], { afterSalesEnabled: ref(enabled), showUnitColumn: ref(false), isUserTrackIncluded: ref(false), useAuth: () => ({ session: { value: { role: 'staff' } } }) });
        assert.equal(h.context.columns.value.some((column: any) => column.key === 'serialNumber'), false); h.stop();
    }
    for (const filename of [file, 'components/Billing/SerialNumbers.vue']) {
        const { descriptor, errors } = parse(readFileSync(filename, 'utf8'), { filename }); assert.deepEqual(errors, []);
        const script = compileScript(descriptor, { id: filename });
        assert.deepEqual(compileTemplate({ source: descriptor.template!.content, filename, id: filename, compilerOptions: { bindingMetadata: script.bindings } }).errors, []);
    }
});

test('return cell updates retain selected serials belonging to other product rows', () => {
    const { descriptor } = parse(readFileSync('components/Billing/SerialNumbers.vue', 'utf8'));
    const ast = ts.createSourceFile('cell.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
    const nodes = ast.statements.filter(node => /^(const returnOptions|const selectedReturns|function selectReturns)/.test(node.getText(ast))).map(node => node.getText(ast)).join('\n');
    const js = ts.transpileModule(nodes, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const events: any[] = [];
    const props = { item: { id: 'item' }, owned: [{ id: 'one', item_id: 'item' }, { id: 'two', item_id: 'other' }], returnedUnitIds: ['one', 'two'] };
    const select = new Function('props', 'computed', 'emit', js + '\nreturn selectReturns;')(props, computed, (...event: any[]) => events.push(event));
    select([]); assert.deepEqual(events[0], ['update:returnedUnitIds', ['two']]);
});

test('keyboard flow stays in the normal table columns with after-sales enabled', () => {
    const focused: string[] = [], enabled = ref(true);
    const h = harness('pages/erp/billing.vue', ['moveFocus'], {
        items: ref([{ id: 'item' }]), afterSalesEnabled: enabled, isUserTrackIncluded: ref(false),
        serialRegistration: { isCovered: () => true, owned: ref([]) },
        focusInput: (_row: number, field: string) => focused.push(field),
    });
    try {
        h.context.moveFocus(0, 'name', 'right');
        h.context.moveFocus(0, 'name', 'right');
        enabled.value = false; h.context.moveFocus(0, 'name', 'right');
        assert.deepEqual(focused, ['rate', 'rate', 'rate']);
    } finally { h.stop(); }
});
