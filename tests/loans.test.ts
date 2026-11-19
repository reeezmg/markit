import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { accountantContext } from '../server/utils/accountant/context';
import { loanRouter, getLoan, loanEvents, postLoanDue } from '../server/utils/accountant/loans';
import { investorTotals, addInvestorEvent } from '../server/utils/accountant/investors';
import { computeLoanSchedule, validateLoanSchedule, importLoanSchedule, loanMonth, loanPosition, type LoanTerms } from '../utils/loan-schedule';

const terms: LoanTerms = { amount: 100000, annualRate: 12, periods: 12, frequencyMonths: 1, startDate: '2020-01-01', firstDueDate: '2020-02-01', method: 'ANNUITY' };
test('amortization methods preserve exact principal and handle interest-free and month-end dates', () => {
    for (const method of ['ANNUITY', 'EQUAL_PRINCIPAL', 'INTEREST_ONLY'] as const) {
        const rows = computeLoanSchedule({ ...terms, method });
        assert.equal(rows.reduce((s, r) => s + Math.round(r.principal * 100), 0), 10000000);
        assert.equal(rows[0].interest, 1000);
        assert.ok(rows.every(r => r.principal >= 0 && r.interest >= 0));
        if (method === 'INTEREST_ONLY') { assert.equal(rows[0].principal, 0); assert.equal(rows.at(-1)!.principal, 100000); }
    }
    const free = computeLoanSchedule({ ...terms, annualRate: 0 });
    assert.ok(free.every(r => r.interest === 0));
    assert.equal(free.at(-1)!.principal, 8333.37);
    assert.equal(loanMonth('2024-01-31', 1), '2024-02-29');
    assert.equal(loanMonth('2024-01-31', 2), '2024-03-31');
    assert.equal(loanMonth('2024-02-29', 12), '2025-02-28');
    assert.equal(computeLoanSchedule({ ...terms, frequencyMonths: 3, firstDueDate: '2020-04-01' })[0].interest, 3000);
});
test('manual/import schedules reject invalid dates, totals, precision and negative amounts', () => {
    const rows = importLoanSchedule('date,principal,interest\n2020-02-01,100000,1000');
    assert.equal(validateLoanSchedule(terms, rows).length, 1);
    for (const change of [{ date: '2020-02-30' }, { date: '2019-12-01' }, { principal: 1 }, { principal: -100 }, { interest: 0.001 }, { interest: NaN }])
        assert.throws(() => validateLoanSchedule(terms, [{ ...rows[0], ...change }]));
    assert.throws(() => validateLoanSchedule({ ...terms, annualRate: 0 }, rows));
    assert.throws(() => importLoanSchedule('date,principal\n2020-02-01,10'));
});

type State = { loans: any[]; events: any[]; investors: any[]; journals: any[]; investorEvents: any[]; audits: any[] };
function fixture() {
    let state: State = { loans: [], events: [], journals: [], investorEvents: [], audits: [], investors: [{ id: 'investor', company_id: 'a', name: 'Ravi', accounts: { loan: 'long' }, profile: { status: 'ACTIVE' } }] };
    let locked = false, installed = true;
    const accounts = [
        ['bank', 'ASSET', 'BANK'], ['long', 'LIABILITY', 'OTHER_LIABILITY'], ['current', 'LIABILITY', 'OTHER_CURRENT_LIABILITY'],
        ['interest', 'EXPENSE', 'OTHER_EXPENSE'], ['fees', 'EXPENSE', 'OTHER_EXPENSE'],
    ].map(([id, category, accountType]) => ({ id, category, accountType, companyId: 'a', currency: 'INR', isActive: true, deletedAt: null }));
    const matches = (row: any, where: any) => Object.entries(where).every(([key, value]: any) => value?.in ? value.in.includes(row[key]) : row[key] === value);
    const db: any = {
        company: { findUnique: async () => ({ currency: 'INR' }) }, accountantPreference: { findUnique: async () => null },
        accountantAccountingAccount: { findFirst: async ({ where }: any) => accounts.find(a => matches(a, where)), count: async ({ where }: any) => accounts.filter(a => matches(a, where)).length, findMany: async ({ where }: any) => accounts.filter(a => matches(a, where)) },
        accountantTransactionLock: { findFirst: async () => locked ? { lockDate: new Date('2099-01-01'), reason: 'Closed books' } : null },
        accountantManualJournal: {
            count: async () => state.journals.length,
            create: async ({ data }: any) => { const j = { ...data, id: randomUUID(), deletedAt: null, lines: data.lines.create }; state.journals.push(j); return j; },
            findFirst: async ({ where }: any) => state.journals.find(j => matches(j, where)),
            update: async ({ where, data }: any) => { const j = state.journals.find(j => matches(j, where)); Object.assign(j, data); return j; },
        },
        accountantAudit: { create: async ({ data }: any) => { state.audits.push(data); return data; } },
        $queryRawUnsafe: async (sql: string, companyId: string, id: string) => {
            // PostgreSQL rejects an unqualified ORDER BY when both the raw date
            // and its text projection have the output name event_date.
            if (/event_date::text AS event_date/.test(sql))
                assert.match(sql, /ORDER BY e\.event_date,e\.created_at,e\.id/);
            if (sql.includes('to_regclass')) return [{ ready: installed }];
            if (sql.includes('FROM accountant_v2_investor_events WHERE') && sql.includes('request_id')) return state.investorEvents.filter(e => e.company_id === companyId && e.request_id === id);
            if (sql.includes('FROM accountant_v2_investor_events e')) return state.investorEvents.filter(e => e.company_id === companyId && (!id || e.investor_id === id));
            if (sql.includes('FROM accountant_v2_investors WHERE')) return structuredClone(state.investors.filter(p => p.company_id === companyId && (!id || p.id === id)));
            if (sql.includes('FROM accountant_v2_loan_events')) return structuredClone(state.events.filter(e => e.company_id === companyId && (!id || (sql.includes('request_id=$2') ? e.request_id === id : e.loan_id === id))));
            if (sql.includes('FROM accountant_v2_loans WHERE')) return structuredClone(state.loans.filter(l => l.company_id === companyId && (!id || l.id === id)));
            if (sql.includes('JOIN accountant_v2_investors')) return structuredClone(state.loans.filter(l => l.company_id === companyId).map(l => ({ ...l, investor_name: 'Ravi' })));
            throw Error('Unhandled read: ' + sql);
        },
        $executeRawUnsafe: async (sql: string, ...args: any[]) => {
            const [companyId, id] = args;
            if (sql.includes('INSERT INTO accountant_v2_loans')) {
                // Match databases generated from @updatedAt: the column is NOT
                // NULL with no database default; raw inserts must supply it.
                const columns = sql.match(/accountant_v2_loans\(([^)]+)\)/)![1].split(',').map(c => c.trim());
                const values = sql.match(/VALUES\(([^)]+)\)/)![1].split(',').map(v => v.trim());
                assert.equal(values[columns.indexOf('updated_at')], 'CURRENT_TIMESTAMP', 'Raw loan creation must populate updated_at');
                assert.equal(values[columns.indexOf('created_at')], 'CURRENT_TIMESTAMP');
                const timestamp = new Date().toISOString();
                state.loans.push({ company_id: companyId, id, investor_id: args[2], name: args[3], currency: args[4], terms: JSON.parse(args[5]), accounts: JSON.parse(args[6]), schedule: JSON.parse(args[7]), status: 'DRAFT', created_at: timestamp, updated_at: timestamp }); return 1;
            }
            if (sql.includes('INSERT INTO accountant_v2_loan_events')) {
                assert.ok(!state.events.some(e => e.company_id === companyId && e.request_id === args[9]), 'unique request');
                state.events.push({ id, company_id: companyId, loan_id: args[2], event_date: args[3], kind: args[4], principal: args[5], interest: args[6], fees: args[7], journal_id: args[8], request_id: args[9], details: JSON.parse(args[10]) }); return 1;
            }
            if (sql.includes('INSERT INTO accountant_v2_investor_events')) {
                state.investorEvents.push({ id, company_id: companyId, investor_id: args[2], event_date: args[3], kind: args[4], amount: args[5], journal_id: args[6], request_id: args[7], reversed_id: args[8], details: JSON.parse(args[9]), journal_status: 'PUBLISHED' }); return 1;
            }
            if (sql.includes('UPDATE accountant_v2_loans SET status=')) { state.loans.find(l => l.company_id === companyId && l.id === id).status = args[2]; return 1; }
            if (sql.includes('UPDATE accountant_v2_loans SET investor_id=')) {
                Object.assign(state.loans.find(l => l.company_id === companyId && l.id === id), { investor_id: args[2], name: args[3], terms: JSON.parse(args[4]), accounts: JSON.parse(args[5]), schedule: JSON.parse(args[6]) }); return 1;
            }
            throw Error('Unhandled write: ' + sql);
        },
    };
    const run = (fn: () => Promise<any>, companyId = 'a', role = 'manager') => accountantContext.run({ companyId, userId: 'tester', role, db }, fn);
    const dispatch = async (method: string, path: string, body: any = {}, companyId = 'a', role = 'manager') => {
        const backup = structuredClone(state); let result: any;
        try {
            await run(() => loanRouter.dispatch(method, path, { body, params: {}, query: {}, user: { companyId, userId: 'tester', role } }, { json: value => { result = value; }, status() { return this; } }), companyId, role);
            return result;
        } catch (e) { state = backup; throw e; }
    };
    const draft = (extra: any = {}) => ({ requestId: randomUUID(), name: 'Equipment loan', investorId: 'investor', terms: { ...terms, amount: 1000, periods: 3, method: 'EQUAL_PRINCIPAL' }, accounts: { bank: 'bank', longTerm: 'long', shortTerm: 'current', interestExpense: 'interest', feesExpense: 'fees' }, ...extra });
    return { dispatch, run, draft, get state() { return state; }, setLocked: (value: boolean) => { locked = value; }, setInstalled: (value: boolean) => { installed = value; }, accounts };
}

test('loan lifecycle posts balanced due entries, splits repayments, reverses safely and closes', async () => {
    const f = fixture(), input = f.draft(), loan = await f.dispatch('POST', '/', input);
    assert.ok(loan.updated_at, 'A new loan has its required update timestamp');
    assert.equal(loan.updated_at, loan.created_at);
    assert.equal(loan.status, 'OPEN', 'Save records the loan immediately');
    assert.equal(f.state.events.filter(e => e.kind === 'RECEIPT').length, 1);
    assert.equal(f.state.loans[0].status, 'OPEN');
    const n = f.state.journals.length;
    await f.dispatch('POST', '/', input);
    await f.dispatch('POST', `/${loan.id}/post-due`);
    assert.equal(f.state.journals.length, n, 'due processing and save retries are idempotent');
    const events = f.state.events;
    assert.equal(events.filter(e => e.kind === 'INSTALMENT').length, 3);
    assert.equal(events.filter(e => e.kind === 'RECLASS').length, events.filter(e => e.kind === 'RECLASS_REVERSAL').length);
    assert.equal(investorTotals(f.state.investorEvents).loan, 1000, 'scheduled principal is not cash repayment');
    for (const j of f.state.journals) assert.equal(j.lines.filter((l: any) => l.side === 'DEBIT').reduce((s: number, l: any) => s + Math.round(l.amount * 100), 0), j.lines.filter((l: any) => l.side === 'CREDIT').reduce((s: number, l: any) => s + Math.round(l.amount * 100), 0));
    const payment = { requestId: randomUUID(), date: '2021-01-01', bankAccountId: 'bank', allocations: [{ number: 1, principal: 100, interest: 10 }], fees: 5 };
    const paid = await f.dispatch('POST', `/${loan.id}/pay`, payment);
    assert.equal(investorTotals(f.state.investorEvents).loan, 900);
    const journal = f.state.journals.find(j => j.id === paid.journalId);
    assert.equal(journal.lines.find((l: any) => l.accountId === 'bank').amount, 115);
    await f.dispatch('POST', `/${loan.id}/pay`, payment);
    assert.equal(investorTotals(f.state.investorEvents).loan, 900);
    await assert.rejects(f.dispatch('POST', `/${loan.id}/pay`, { ...payment, fees: 6 }), /different data/);
    await assert.rejects(f.dispatch('POST', `/${loan.id}/pay`, { ...payment, requestId: randomUUID(), allocations: [{ number: 1, principal: 500, interest: 0 }] }), /exceeds/);
    await f.dispatch('POST', `/${loan.id}/reverse-payment`, { requestId: randomUUID(), date: '2021-01-02', eventId: paid.id, reason: 'Wrong payment' });
    assert.equal(investorTotals(f.state.investorEvents).loan, 1000);
    const position = loanPosition(loan.schedule, f.state.events, '2021-01-02');
    await f.dispatch('POST', `/${loan.id}/pay`, { ...payment, requestId: randomUUID(), date: '2021-01-03', fees: 0, allocations: position.rows.map(r => ({ number: r.number, principal: r.principalDue, interest: r.interestDue })) });
    assert.equal(f.state.loans[0].status, 'CLOSED');
    assert.equal(investorTotals(f.state.investorEvents).loan, 0);
    const net = (account: string) => f.state.journals.flatMap(j => j.lines).filter(l => l.accountId === account).reduce((s, l) => s + Math.round(l.amount * 100) * (l.side === 'DEBIT' ? 1 : -1), 0);
    assert.equal(net('long'), 0); assert.equal(net('current'), 0);
});

test('loan list and individual history use unambiguous chronological SQL', async () => {
    const f = fixture();
    const loan = await f.dispatch('POST', '/', f.draft());
    const list = await f.dispatch('GET', '/');
    const detail = await f.dispatch('GET', `/${loan.id}`);
    assert.equal(list.data[0].id, loan.id);
    assert.ok(detail.events.length > 0);
    assert.equal(typeof detail.events[0].event_date, 'string');
});

test('early settlement clears liabilities and permanently waives future unearned interest', async () => {
    const f = fixture(), current = new Date().toISOString().slice(0, 10), start = current.slice(0, 7) + '-01';
    const input = f.draft({ terms: { ...terms, amount: 1000, periods: 12, startDate: start, firstDueDate: loanMonth(start, 1) } });
    const loan = await f.dispatch('POST', '/', input);
    await assert.rejects(f.dispatch('POST', `/${loan.id}/pay`, { requestId: randomUUID(), date: current, bankAccountId: 'bank', allocations: [{ number: 1, principal: 1, interest: 0 }] }), /early settlement/);
    const body = { requestId: randomUUID(), date: current, bankAccountId: 'bank', extraInterest: 3.25, fees: 5, note: 'Lender payoff quote' };
    await f.dispatch('POST', `/${loan.id}/settle`, body);
    const count = f.state.journals.length;
    await f.dispatch('POST', `/${loan.id}/settle`, body);
    assert.equal(f.state.journals.length, count);
    assert.equal(f.state.loans[0].status, 'CLOSED');
    const position = loanPosition(loan.schedule, f.state.events, '2099-01-01');
    assert.equal(position.principal, 0); assert.equal(position.interestDue, 0); assert.equal(position.futureInterest, 0);
    const net = (id: string) => f.state.journals.flatMap(j => j.lines).filter(l => l.accountId === id).reduce((s, l) => s + Math.round(l.amount * 100) * (l.side === 'DEBIT' ? 1 : -1), 0);
    assert.equal(net('long'), 0); assert.equal(net('current'), 0); assert.equal(net('interest'), 325); assert.equal(net('fees'), 500);
});

test('tenant/role/account/date protections and failed transactions preserve all records', async () => {
    const f = fixture(), loan = await f.dispatch('POST', '/', f.draft());
    await assert.rejects(f.dispatch('GET', `/${loan.id}`, {}, 'b'), /not found/);
    await assert.rejects(f.dispatch('GET', '/', {}, 'a', 'user'), /Accountant access/);
    await assert.rejects(f.dispatch('POST', `/${loan.id}/validate`, { requestId: randomUUID(), date: terms.startDate }, 'a', 'accountant'), /manager or admin/);
    f.setLocked(true);
    const before = f.state.journals.length;
    await assert.rejects(f.dispatch('POST', '/', f.draft()), /locked/);
    assert.equal(f.state.journals.length, before); assert.equal(f.state.loans.length, 1);
    f.setLocked(false);
    await assert.rejects(f.dispatch('POST', '/', f.draft({ accounts: { bank: 'foreign', longTerm: 'long', shortTerm: 'current', interestExpense: 'interest', feesExpense: 'fees' } })), /active accounts/);
    const count = f.state.journals.length;
    await assert.rejects(f.dispatch('PUT', `/${loan.id}`, f.draft()), /draft/);
    await assert.rejects(f.dispatch('POST', `/${loan.id}/cancel`, { reason: 'Wrong' }), /draft/);
    await f.run(async () => { await assert.rejects(addInvestorEvent('investor', { requestId: randomUUID(), date: '2021-01-01', kind: 'LOAN_OUT', amount: 1, counterAccountId: 'bank' }), /loan balance/); });
    assert.equal(f.state.journals.length, count);
    f.setInstalled(false);
    assert.equal((await f.dispatch('GET', '/')).ready, false);
    await assert.rejects(f.dispatch('POST', '/', f.draft()), /installation is pending/);
});

test('accountants save loans directly and earlier unposted drafts complete on save', async () => {
    const f = fixture(), input = f.draft();
    const added = await f.dispatch('POST', '/', input, 'a', 'accountant');
    assert.equal(added.status, 'OPEN');
    // An earlier unposted draft, represented entirely in the in-memory fixture.
    f.state.loans[0].status = 'DRAFT'; f.state.events.length = 0; f.state.journals.length = 0; f.state.investorEvents.length = 0;
    const completion = { ...input, requestId: randomUUID() };
    const completed = await f.dispatch('PUT', `/${added.id}`, completion, 'a', 'accountant');
    await f.dispatch('PUT', `/${added.id}`, completion, 'a', 'accountant');
    assert.equal(completed.status, 'OPEN');
    assert.equal(f.state.events.filter(e => e.kind === 'RECEIPT').length, 1);
    assert.equal(investorTotals(f.state.investorEvents).loan, 1000);
});

test('loans use their own liability account without requiring or changing the investor mapping', async () => {
    const f = fixture();
    f.state.investors[0].accounts = {};
    const loan = await f.dispatch('POST', '/', f.draft());
    assert.equal(loan.accounts.longTerm, 'long');
    assert.deepEqual(f.state.investors[0].accounts, {});
    f.state.investors[0].accounts = { loan: 'historic-mapping' };
    const another = await f.dispatch('POST', '/', f.draft());
    assert.equal(another.accounts.longTerm, 'long');
    assert.equal(f.state.investors[0].accounts.loan, 'historic-mapping');
});

test('loan UI components compile and all schema models deny generated CRUD', () => {
    for (const name of ['LoanForm', 'LoanPaymentModal', 'LoansPage', 'LoanAccountPage', 'LoanHistoryPage', 'LoanRepaymentsPage', 'LoanSettingsPage']) {
        const filename = `components/Investments/${name}.vue`, { descriptor, errors } = parse(readFileSync(filename, 'utf8'), { filename });
        assert.deepEqual(errors, []); const script = compileScript(descriptor, { id: name });
        assert.deepEqual(compileTemplate({ source: descriptor.template!.content, filename, id: name, compilerOptions: { bindingMetadata: script.bindings } }).errors, []);
    }
    const model = readFileSync('schema.zmodel', 'utf8');
    for (const name of ['AccountantLoan', 'AccountantLoanEvent']) assert.match(model.split(`model ${name} {`)[1].split('\n}')[0], /@@deny\('all', true\)/);
});
