import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ref, nextTick } from 'vue';
import vm from 'node:vm';
import ts from 'typescript';
import { composable, harness, billing, script, row } from './billing/harness';

function connect(enabled: ReturnType<typeof ref<boolean>>, draft: any) {
    const h = harness(billing, ['changeBillingMode'], { ...draft, invoicingEnabled: enabled });
    const ast = ts.createSourceFile('billing.ts', script(billing), ts.ScriptTarget.Latest, true);
    const watcher = ast.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
        && node.expression.expression.getText(ast) === 'watch' && node.expression.arguments[0]?.getText(ast) === '[invoicingEnabled, billingMode]');
    assert.ok(watcher);
    const compiled = ts.transpileModule(watcher.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    h.run(() => vm.runInContext(compiled, h.context));
    return h;
}
test('disabled invoicing clamps restored invoice mode and explicit mode changes to Pay now', async t => {
    const draft = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(draft.stop);
    draft.storage.set('markit_billing_mode:company', 'invoice');
    const enabled = ref(false), page = connect(enabled, draft.result); t.after(page.stop);
    await draft.mount(); await nextTick();
    assert.equal(draft.result.billingMode.value, 'paynow');
    assert.equal(draft.result.paymentMethod.value, 'Cash');
    assert.equal(draft.storage.get('markit_billing_mode:company'), 'paynow');
    page.context.changeBillingMode('invoice');
    assert.equal(draft.result.billingMode.value, 'paynow'); assert.equal(draft.result.paymentMethod.value, 'Cash');
});
test('turning invoicing off switches the open draft to Pay now while retaining items and custom notes', async t => {
    const draft = composable('composables/useBillingDraft.ts', 'useBillingDraft'); t.after(draft.stop);
    const enabled = ref(true), page = connect(enabled, draft.result); t.after(page.stop);
    await draft.mount();
    page.context.changeBillingMode('invoice');
    draft.result.items.value = [row({ name: 'Retained item', qty: 3 })];
    draft.result.customerNotes.value = 'Retained notes';
    enabled.value = false; await nextTick();
    assert.equal(draft.result.billingMode.value, 'paynow'); assert.equal(draft.result.paymentMethod.value, 'Cash');
    assert.equal(draft.result.items.value[0].name, 'Retained item');
    assert.equal(draft.result.customerNotes.value, 'Retained notes');
    draft.result.billingMode.value = 'invoice';
    assert.equal(draft.result.billingMode.value, 'paynow', 'Restoring or assigning an invoice mode cannot bypass the workflow');
    enabled.value = true; page.context.changeBillingMode('invoice');
    assert.equal(draft.result.billingMode.value, 'invoice'); assert.equal(draft.result.paymentMethod.value, 'Credit');
});
