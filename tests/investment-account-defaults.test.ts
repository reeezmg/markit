import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountantContext } from '../server/utils/accountant/context';
import { accountSettingsRouter, ensureInvestmentAccountDefaults } from '../server/utils/accountant/account-settings';
import { resolveInvestorAccountSelections } from '../server/utils/accountant/investors';

function fixture() {
    const accounts: any[] = [], audits: any[] = [];
    let sequence = 0;
    const match = (row: any, where: any) => Object.entries(where).every(([key, value]) => row[key] === value);
    const db: any = {
        company: { findUnique: async () => ({ currency: 'INR' }) }, accountantPreference: { findUnique: async () => null },
        accountantAccountingAccount: {
            findMany: async ({ where }: any) => accounts.filter(a => match(a, where)),
            findFirst: async ({ where }: any) => accounts.find(a => match(a, where)),
            create: async ({ data }: any) => { const account = { id: `account-${++sequence}`, isActive: true, deletedAt: null, ...data }; accounts.push(account); return account; },
        },
        accountantAudit: {
            findMany: async ({ where }: any) => audits.filter(a => match(a, where)).slice().reverse(),
            create: async ({ data }: any) => { const audit = { id: `audit-${++sequence}`, deletedAt: null, ...data }; audits.push(audit); return audit; },
        },
    };
    const run = <T>(fn: () => Promise<T>, companyId = 'a') => accountantContext.run({ companyId, userId: 'tester', role: 'manager', db }, fn);
    const configure = (group: string, after: any) => audits.push({ companyId: 'a', deletedAt: null, resource: 'account-defaults', resourceId: group, action: 'configured', after });
    return { accounts, audits, run, configure };
}

test('missing investor and loan defaults are created once in the company currency without journals', async () => {
    const f = fixture();
    const defaults = await f.run(ensureInvestmentAccountDefaults);
    assert.equal(f.accounts.length, 7);
    assert.equal(defaults.loans.longTerm, defaults.investments.loanAccountId);
    assert.equal(defaults.loans.bank, defaults.investments.counterAccountId);
    assert.ok(f.accounts.every(a => a.currency === 'INR' && a.companyId === 'a'));
    const count = f.audits.length;
    assert.deepEqual(await f.run(ensureInvestmentAccountDefaults), defaults);
    assert.equal(f.accounts.length, 7); assert.equal(f.audits.length, count);
    const other = await f.run(ensureInvestmentAccountDefaults, 'b');
    assert.notEqual(other.investments.capitalAccountId, defaults.investments.capitalAccountId);
});

test('company setup accounts and custom defaults are reused; existing mappings stay selected', async () => {
    const f = fixture();
    const original = await f.run(ensureInvestmentAccountDefaults);
    const custom = { ...f.accounts.find(a => a.code === '3000'), id: 'custom-equity', code: 'CUSTOM' };
    f.accounts.push(custom);
    f.configure('investments', { ...original.investments, capitalAccountId: custom.id });
    const count = f.accounts.length;
    const defaults = await f.run(ensureInvestmentAccountDefaults);
    assert.equal(defaults.investments.capitalAccountId, custom.id);
    assert.equal(f.accounts.length, count);
    assert.equal((await f.run(() => resolveInvestorAccountSelections({}, { capital: original.investments.capitalAccountId }))).capital, original.investments.capitalAccountId);
});

test('investor save fills every missing purpose and rejects unavailable standard codes and invalid defaults', async () => {
    const f = fixture();
    const selected = await f.run(() => resolveInvestorAccountSelections({}));
    assert.deepEqual(Object.keys(selected).sort(), ['capital', 'loan', 'profit']);
    const capital = f.accounts.find(a => a.id === selected.capital);
    capital.isActive = false;
    f.configure('investments', {});
    await assert.rejects(f.run(ensureInvestmentAccountDefaults), /Standard account 3000 is unavailable/);
    capital.isActive = true;
    f.configure('investments', { capitalAccountId: selected.profit });
    await assert.rejects(f.run(ensureInvestmentAccountDefaults), /Fix the company Investor equity default/);
});

test('initialization endpoint retains authentication and accounting permissions', async () => {
    const f = fixture(); let response: any;
    const res: any = { json: (value: any) => { response = value; } };
    await f.run(() => accountSettingsRouter.dispatch('POST', '/investment-defaults', { user: { companyId: 'a', userId: 'tester', role: 'accountant' }, body: {}, query: {}, params: {} }, res));
    assert.ok(response.defaults.loans.interestExpense);
    await assert.rejects(f.run(() => accountSettingsRouter.dispatch('POST', '/investment-defaults', { user: { companyId: 'a', userId: 'tester', role: 'staff' }, body: {}, query: {}, params: {} }, res)));
});
