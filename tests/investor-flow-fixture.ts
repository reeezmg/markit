import { randomUUID } from 'node:crypto';
import { accountantContext } from '../server/utils/accountant/context';
import { investorRouter } from '../server/utils/accountant/investors';
import { investorProfitRouter } from '../server/utils/accountant/investor-profits';
import { accountSettingsRouter } from '../server/utils/accountant/account-settings';

/** In-memory transaction adapter for the real investor and distribution routers.
 * No DDL, database connection, external identity or money movement is involved.
 */
export function createInvestorFlowFixture() {
    const accounts = [
        ['capital', 'Investor capital', 'EQUITY', 'EQUITY'], ['profit', 'Profit payable', 'LIABILITY', 'OTHER_CURRENT_LIABILITY'],
        ['loan', 'Investor loans', 'LIABILITY', 'OTHER_LIABILITY'], ['distribution', 'Profit distributions', 'EQUITY', 'EQUITY'],
        ['bank', 'Business bank', 'ASSET', 'BANK'], ['sales', 'Sales', 'INCOME', 'SALES'], ['expense', 'Expenses', 'EXPENSE', 'OTHER_EXPENSE'],
        ['current-loan', 'Current loan liability', 'LIABILITY', 'OTHER_CURRENT_LIABILITY'],
    ].map(([id, name, category, accountType]) => ({ id, name, category, accountType, code: id === 'distribution' ? 'INV-DISTRIBUTION' : id, companyId: 'a', currency: 'INR', isActive: true, deletedAt: null }));
    let state: any = { investors: [], terms: [], events: [], journals: [], audits: [], users: [], members: [], sequence: 0 };
    let locked = false, failHistory = false;
    const clone = <T>(value: T): T => structuredClone(value);
    const stamp = () => new Date(Date.UTC(2020, 0, 1) + ++state.sequence * 1000).toISOString();
    const day = (value: any) => new Date(value).toISOString().slice(0, 10);
    const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, value]: any) => {
        if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            if ('in' in value) return value.in.includes(row[key]);
            if ('notIn' in value) return !value.notIn.includes(row[key]);
            if ('gte' in value) return new Date(row[key]) >= new Date(value.gte);
        }
        return row[key] === value;
    });
    const audit = (resource: string, resourceId: string, after: any) => state.audits.push({ id: randomUUID(), companyId: 'a', userId: 'tester', resource, resourceId, action: 'configured', after, createdAt: stamp(), deletedAt: null });
    audit('account-defaults', 'investments', { capitalAccountId: 'capital', profitAccountId: 'profit', loanAccountId: 'loan', counterAccountId: 'bank', payoutAccountId: 'bank' });
    audit('account-defaults', 'loans', { bank: 'bank', longTerm: 'loan', shortTerm: 'current-loan', interestExpense: 'expense', feesExpense: 'expense' });
    audit('investor-share-settings', 'a', { totalShares: 1000 });
    audit('investor-profit-settings', 'a', { accountId: 'distribution' });
    const seed = (id: string, status: string, amount: number, accountId: string, expense = false) => state.journals.push({
        id, companyId: 'a', status, journalDate: new Date('2026-01-10'), exchangeRate: 1, deletedAt: null, lines: [
            { accountId: 'bank', side: expense ? 'CREDIT' : 'DEBIT', amount, companyId: 'a', deletedAt: null },
            { accountId, side: expense ? 'DEBIT' : 'CREDIT', amount, companyId: 'a', deletedAt: null },
        ],
    });
    seed('income', 'PUBLISHED', 20000, 'sales'); seed('expense', 'PUBLISHED', 8000, 'expense', true); seed('unposted', 'DRAFT', 99999, 'sales');
    const linked = (companyId: string, id: string) => state.members.filter((m: any) => m.company_id === companyId && m.user_id === id).map((m: any) => ({ ...m, email: state.users.find((u: any) => u.id === id)?.email }));
    const db: any = {
        company: { findUnique: async () => ({ currency: 'INR' }) }, accountantPreference: { findUnique: async () => null },
        accountantTransactionLock: { findFirst: async () => locked ? { lockDate: new Date('2099-01-01'), reason: 'Closed period' } : null },
        accountantAccountingAccount: {
            findMany: async ({ where }: any) => clone(accounts.filter(a => matches(a, where))),
            findFirst: async ({ where }: any) => clone(accounts.find(a => matches(a, where))),
            count: async ({ where }: any) => accounts.filter(a => matches(a, where)).length,
            create: async () => { throw Error('Native investor flow must reuse existing chart accounts'); },
        },
        accountantAudit: {
            findMany: async ({ where }: any) => clone(state.audits.filter((a: any) => matches(a, where)).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))),
            findFirst: async ({ where }: any) => clone(state.audits.filter((a: any) => matches(a, where)).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))[0] || null),
            create: async ({ data }: any) => { const row = { id: randomUUID(), deletedAt: null, createdAt: stamp(), ...clone(data) }; state.audits.push(row); return row; },
        },
        accountantManualJournal: {
            count: async ({ where }: any) => state.journals.filter((j: any) => matches(j, where)).length,
            create: async ({ data }: any) => { const j = { ...clone(data), id: randomUUID(), deletedAt: null, exchangeRate: 1, lines: data.lines.create.map((l: any) => ({ ...clone(l), deletedAt: null })) }; state.journals.push(j); return j; },
            findFirst: async ({ where }: any) => { const j = state.journals.find((j: any) => matches(j, where)); return j ? { ...clone(j), reversals: state.journals.filter((r: any) => r.reversedFromId === j.id) } : null; },
            update: async ({ where, data }: any) => { const j = state.journals.find((j: any) => matches(j, where)); Object.assign(j, clone(data)); return j; },
        },
        $queryRawUnsafe: async (sql: string, companyId: string, ...args: any[]) => {
            if (sql.includes('FROM users WHERE lower(email)')) return clone(state.users.filter((u: any) => u.email.toLowerCase() === companyId));
            if (sql.includes('FROM company_users cu JOIN users')) {
                const memberships = sql.includes('cu.user_id=$2') ? linked(companyId, args[0]) : state.members.filter((m: any) => m.company_id === companyId).flatMap((m: any) => linked(companyId, m.user_id));
                return clone(memberships.map((m: any) => ({ ...m, id: m.user_id, investor_id: state.investors.find((p: any) => p.company_id === companyId && p.legacy_user_id === m.user_id)?.id || null })));
            }
            if (sql.includes('FROM accountant_v2_investor_events e')) {
                if (failHistory && args[0]) { failHistory = false; throw Error('Agreement history could not be loaded'); }
                return clone(state.events.filter((e: any) => e.company_id === companyId && (!args[0] || e.investor_id === args[0]))
                    .map((e: any) => { const j = state.journals.find((j: any) => j.id === e.journal_id); return { ...e, journal_status: j?.status, journal_deleted: j?.deletedAt, entry_number: j?.entryNumber }; })
                    .sort((a: any, b: any) => a.event_date.localeCompare(b.event_date) || a.created_at.localeCompare(b.created_at) || (sql.includes('CASE WHEN e.kind') ? ((['SHARE_BUY','SHARE_REDEEM'].includes(a.kind)?0:a.kind==='REVERSAL'&&['SHARE_BUY','SHARE_REDEEM'].includes(a.details.originalKind)?2:1)-(['SHARE_BUY','SHARE_REDEEM'].includes(b.kind)?0:b.kind==='REVERSAL'&&['SHARE_BUY','SHARE_REDEEM'].includes(b.details.originalKind)?2:1)) : 0) || a.id.localeCompare(b.id)));
            }
            if (sql.includes('FROM accountant_v2_investor_events WHERE')) return clone(state.events.filter((e: any) => e.company_id === companyId && e.request_id === args[0]));
            if (sql.includes('FROM accountant_v2_investors WHERE')) {
                let rows = state.investors.filter((p: any) => p.company_id === companyId);
                if (sql.includes("accounts->>'capital'")) rows = rows.filter((p: any) => Object.values(p.accounts).includes(args[0]));
                else if (sql.includes('legacy_user_id=$2')) rows = rows.filter((p: any) => p.legacy_user_id === args[0]);
                else if (sql.includes('id=$2')) rows = rows.filter((p: any) => p.id === args[0]);
                return clone(rows);
            }
            if (sql.includes('FROM accountant_v2_investor_terms WHERE')) {
                let rows = state.terms.filter((t: any) => t.company_id === companyId);
                if (sql.includes('investor_id=$2')) rows = rows.filter((t: any) => t.investor_id === args[0]);
                if (sql.includes('effective_date<=$2')) rows = rows.filter((t: any) => t.effective_date <= args[0]);
                if (sql.includes('effective_date<=$3')) rows = rows.filter((t: any) => t.effective_date <= args[1]);
                if (sql.includes('effective_date>$3')) rows = rows.filter((t: any) => t.effective_date > args[1] && t.effective_date <= args[2]);
                if (sql.includes('effective_date=$3')) rows = rows.filter((t: any) => t.effective_date === args[1] && t.id !== args[2]);
                if (sql.includes('AND id=$3')) rows = rows.filter((t: any) => t.id === args[1]);
                rows.sort((a: any, b: any) => a.effective_date.localeCompare(b.effective_date) || a.created_at.localeCompare(b.created_at));
                if (sql.includes('ORDER BY effective_date DESC')) rows.reverse();
                if (sql.includes('LIMIT 1')) rows = rows.slice(0, 1);
                return clone(rows);
            }
            if (sql.includes('SELECT a.category::text AS category')) {
                const result = new Map<string, number>();
                for (const j of state.journals.filter((j: any) => j.companyId === companyId && j.status === 'PUBLISHED' && !j.deletedAt && day(j.journalDate) >= args[0] && day(j.journalDate) <= args[1]))
                    for (const l of j.lines) { const a = accounts.find(a => a.id === l.accountId); if (a && ['INCOME', 'EXPENSE'].includes(a.category) && !l.deletedAt) result.set(a.category, (result.get(a.category) || 0) + Math.round(Number(l.amount) * j.exchangeRate * 100) * (l.side === 'CREDIT' ? 1 : -1)); }
                return [...result].map(([category, net]) => ({ category, net: String(net / 100) }));
            }
            throw Error('Unhandled fixture SQL: ' + sql);
        },
        $executeRawUnsafe: async (sql: string, ...args: any[]) => {
            if (sql.includes('pg_advisory_xact_lock')) return 1;
            if (sql.startsWith('INSERT INTO users')) { state.users.push({ id: args[0], email: args[1] }); return 1; }
            const [companyId, id] = args;
            if (sql.startsWith('INSERT INTO company_users')) { state.members.push({ company_id: companyId, user_id: id, name: args[2], phone: args[3], role: 'investor' }); return 1; }
            if (sql.startsWith('INSERT INTO accountant_v2_investors')) { state.investors.push({ company_id: companyId, id, name: args[2], legacy_user_id: args[3], profile: JSON.parse(args[4]), accounts: JSON.parse(args[5]) }); return 1; }
            if (sql.startsWith('UPDATE accountant_v2_investors')) { Object.assign(state.investors.find((p: any) => p.company_id === companyId && p.id === id), { name: args[2], profile: JSON.parse(args[3]), legacy_user_id: args[4], accounts: JSON.parse(args[5]) }); return 1; }
            if (sql.startsWith('INSERT INTO accountant_v2_investor_terms')) { state.terms.push({ id, company_id: companyId, investor_id: args[2], effective_date: args[3], terms: JSON.parse(args[4]), created_at: stamp() }); return 1; }
            if (sql.startsWith('UPDATE accountant_v2_investor_terms')) { Object.assign(state.terms.find((t: any) => t.company_id === companyId && t.id === id && t.investor_id === args[2]), { effective_date: args[3], terms: JSON.parse(args[4]) }); return 1; }
            if (sql.startsWith('DELETE FROM accountant_v2_investor_terms')) { state.terms = state.terms.filter((t: any) => !(t.company_id === companyId && t.investor_id === id && t.id === args[2])); return 1; }
            if (sql.includes('INSERT INTO accountant_v2_investor_events')) {
                if (sql.includes("'REVERSAL'")) {
                    state.events.push({ id, company_id: companyId, investor_id: args[2], event_date: args[3], kind: 'REVERSAL', amount: args[4], journal_id: args[5], request_id: args[6], reversed_id: args[7], details: JSON.parse(args[8]), created_at: stamp() }); return 1;
                }
                if (state.events.some((e: any) => e.company_id === companyId && e.request_id === args[7])) throw Error('Duplicate event request');
                state.events.push({ id, company_id: companyId, investor_id: args[2], event_date: args[3], kind: args[4], amount: args[5], journal_id: args[6], request_id: args[7], reversed_id: sql.includes('reversed_id') ? args[8] : null, details: JSON.parse(args[sql.includes('reversed_id') ? 9 : 8]), created_at: stamp() }); return 1;
            }
            throw Error('Unhandled fixture write: ' + sql);
        },
    };
    async function call(path: string, method = 'GET', body: any = {}, query: any = {}, companyId = 'a', role = 'manager') {
        const backup = clone(state); let result: any;
        const resource = path.startsWith('/account-settings') ? '/account-settings' : path.startsWith('/investor-profits') ? '/investor-profits' : '/investors';
        const router = resource === '/account-settings' ? accountSettingsRouter : resource === '/investors' ? investorRouter : investorProfitRouter;
        try {
            await accountantContext.run({ companyId, userId: 'tester', role, db }, async () => router.dispatch(method, path.slice(resource.length) || '/', { user: { companyId, userId: 'tester', role }, params: {}, query, body }, { json: value => { result = value; return result; }, status() { return this; } }));
            return clone(result);
        } catch (error) { state = backup; throw error; }
    }
    const defaults = { defaults: { investments: { capitalAccountId: 'capital', profitAccountId: 'profit', loanAccountId: 'loan', counterAccountId: 'bank', payoutAccountId: 'bank' } } };
    return { call, accounts, defaults, get state() { return state; }, setLocked(value: boolean) { locked = value; }, failNextHistory() { failHistory = true; } };
}
