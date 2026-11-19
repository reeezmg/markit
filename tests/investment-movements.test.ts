import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { computed, ref, reactive } from 'vue';
import ts from 'typescript';
import * as investments from '../utils/investments';

// Exercise the actual setup scripts with local API/browser substitutes.
function setup(name: string, props: any, bindings: Record<string, any> = {}) {
    const filename = `components/Investments/${name}.vue`;
    const { descriptor } = parse(readFileSync(filename, 'utf8'));
    const source = descriptor.scriptSetup!.content;
    const ast = ts.createSourceFile(filename + '.ts', source, ts.ScriptTarget.Latest, true);
    const body = ast.statements.filter(s => !ts.isImportDeclaration(s)).map(s => s.getText(ast)).join('\n');
    const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const scope = {
        ...investments, computed, ref, reactive,
        defineProps: () => props, defineEmits: () => () => {},
        onMounted: () => {}, watch: () => {},
        useAuth: () => ({session: ref({role: 'manager'})}),
        useAccountantApi: () => ({}), useSelectedAccounts: () => ({}),
        ...bindings,
    };
    return new Function(...Object.keys(scope), compiled + `\nreturn {${name === 'LedgerTable' ? 'filtered, opening, closing, balanceColumns, person, from, to, exportCsv' : 'form, kinds, profiles, selected, save'}};`)(...Object.values(scope));
}

const event = (id: string, kind: string, amount: number, extra = {}) => ({
    id, kind, amount, investor_id: 'ravi', investorName: 'Ravi', event_date: '2026-01-02',
    journal_status: 'PUBLISHED', details: {}, ...extra,
});
const events = [
    event('capital', 'CAPITAL_IN', 1000),
    event('loan', 'LOAN_IN', 500),
    event('profit', 'PROFIT_ALLOCATE', 100),
    event('return', 'CAPITAL_OUT', 200),
    event('repayment', 'LOAN_OUT', 150),
    event('reversal', 'REVERSAL', 150, { reversed_id: 'repayment', details: { originalKind: 'LOAN_OUT' } }),
    event('other', 'LOAN_IN', 900, { investor_id: 'other' }),
];

for (const [mode, ids, key, balance] of [
    ['capital', ['capital', 'return'], 'capital', 800],
    ['loans', ['loan', 'repayment', 'reversal'], 'loan', 500],
    ['payouts', ['profit'], 'profit', 100],
] as const) {
    test(`${mode} isolates history, balances and CSV including reversals`, async () => {
        let blob: Blob | undefined;
        const link = { href: '', download: '', click() {} };
        const ledger = setup('LedgerTable', { events, currency: 'INR', mode, investorId: 'ravi' }, {
            URL: { createObjectURL: (value: Blob) => { blob = value; return 'blob:test'; }, revokeObjectURL() {} },
            document: { createElement: () => link },
        });
        ledger.to.value = '2026-12-31';
        assert.deepEqual(ledger.filtered.value.map((e: any) => e.id), ids);
        assert.deepEqual(ledger.balanceColumns.value.map((c: any) => c.key), [key]);
        assert.equal(ledger.closing.value[key], balance);
        ledger.exportCsv();
        const csv = await blob!.text();
        assert.equal(link.download, `${mode}-statement.csv`);
        for (const column of ['Net contributed capital', 'Profit due', 'Outstanding loan principal']) {
            assert.equal(csv.includes(column), column === ledger.balanceColumns.value[0].label);
        }
        assert.equal(csv.includes('Other'), false);
        ledger.from.value = '2026-01-03';
        assert.equal(ledger.filtered.value.length, 0);
        assert.equal(ledger.opening.value[key], balance);
    });
}

test('full investor statement retains all categories and isolated running balances', () => {
    const ledger = setup('LedgerTable', { events, currency: 'INR', investorId: 'ravi' });
    ledger.to.value = '2026-12-31';
    assert.equal(ledger.filtered.value.length, 6);
    assert.equal(ledger.balanceColumns.value.length, 3);
    assert.equal(ledger.closing.value.capital, 800);
    assert.equal(ledger.closing.value.loan, 500);
    assert.equal(ledger.closing.value.profit, 100);
});

for (const [mode, initial, kinds] of [
    ['capital', 'CAPITAL_IN', ['CAPITAL_IN', 'CAPITAL_OUT']],
    ['loans', 'LOAN_IN', ['LOAN_IN', 'LOAN_OUT']],
    ['payouts', 'PROFIT_PAY', []],
] as const) {
    test(`${mode} form offers only its movements and submits the selected investor`, async () => {
        let posted: any;
        const modal = setup('MovementModal', { mode, investorId: 'ravi' }, {
            useAccountantApi: () => ({ get: async () => ({previewHash: 'test-preview',amount:50}), post: async (path: string, body: any) => { posted = { path, body }; } }),
        });
        assert.equal(modal.form.kind, initial);
        assert.deepEqual(modal.kinds.map((k: any) => k.value), kinds);
        modal.form.amount = '50';
        modal.form.counterAccountId = 'bank';
        await modal.save();
        assert.equal(posted.path, '/investors/ravi/events');
        assert.equal(posted.body.kind, initial);
        assert.equal(posted.body.amount, 50);
        assert.equal(posted.body.counterAccountId, 'bank');
    });
}

test('changed investment components and routes compile as Vue SFCs', () => {
    for (const filename of [
        ...['MovementsPage', 'MovementModal', 'LedgerTable', 'InvestorAccountPage', 'OverviewPage', 'DirectoryPage'].map(name => `components/Investments/${name}.vue`),
        'pages/investments/loans/index.vue',
    ]) {
        const { descriptor, errors } = parse(readFileSync(filename, 'utf8'), { filename });
        assert.deepEqual(errors, [], filename);
        const script = descriptor.scriptSetup ? compileScript(descriptor, { id: filename }) : undefined;
        const template = compileTemplate({ source: descriptor.template!.content, filename, id: filename, compilerOptions: { bindingMetadata: script?.bindings } });
        assert.deepEqual(template.errors, [], filename);
    }
});


test('unpaid share recording appears in profile history but never the capital cash statement or balances',()=>{
 const pending=event('unpaid','SHARE_BUY',10000,{journal_status:undefined,journal_id:null,details:{pricePerShare:100,capitalPreview:{shareQuantity:100}}});
 const capital=setup('LedgerTable',{events:[...events,pending],currency:'INR',mode:'capital',investorId:'ravi'});
 capital.to.value='2026-12-31';assert.deepEqual(capital.filtered.value.map((e:any)=>e.id),['capital','return']);assert.equal(capital.closing.value.capital,800);
 const profile=setup('LedgerTable',{events:[...events,pending],currency:'INR',investorId:'ravi'});profile.to.value='2026-12-31';
 const record=profile.filtered.value.find((e:any)=>e.id==='unpaid');assert.equal(record.recorded,true);assert.equal(record.posted,false);assert.equal(profile.closing.value.capital,800);
});
