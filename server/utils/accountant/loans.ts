import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { accountantPrisma as db, context, logActivity } from './context';
import { Router, requireAuth, rbac, badRequest, notFound } from './router';
import { investor, investorDate, writeInvestorJournal } from './investors';
import { cents, assertAccountingDateUnlocked } from './posting';
import { computeLoanSchedule, validateLoanSchedule, loanMonth, loanNextDay, loanPosition, type LoanScheduleRow } from '../../../utils/loan-schedule';

export const loanRouter = Router();
loanRouter.use(requireAuth, rbac('ACCOUNT', 'WRITE'));
const query = (sql: string, ...args: any[]): Promise<any[]> => db.$queryRawUnsafe(sql, context().companyId, ...args);
const execute = (sql: string, ...args: any[]) => db.$executeRawUnsafe(sql, context().companyId, ...args);
const today = () => new Date().toISOString().slice(0, 10);
const day = (value: any) => new Date(value).toISOString().slice(0, 10);
function date(value: string) {
    const d = investorDate(value);
    if (value > today()) throw badRequest('Posting dates cannot be in the future');
    return d;
}
function manager() {
    if (!['admin', 'manager'].includes(context().role)) throw badRequest('A manager or admin must validate or cancel a loan');
}
export async function loansAvailable() {
    const [row] = await db.$queryRawUnsafe("SELECT to_regclass('accountant_v2_loans') IS NOT NULL AND to_regclass('accountant_v2_loan_events') IS NOT NULL AS ready");
    return Boolean(row.ready);
}
async function ready() {
    if (!await loansAvailable()) throw badRequest('Loan management database installation is pending');
}
const rowSchema = z.object({ number: z.number().int().optional(), date: z.string(), principal: z.coerce.number().nonnegative(), interest: z.coerce.number().nonnegative() });
const termsSchema = z.object({
    amount: z.coerce.number().positive().max(1e10), annualRate: z.coerce.number().min(0).max(100),
    periods: z.coerce.number().int().min(1).max(600), frequencyMonths: z.union([z.literal(1), z.literal(3), z.literal(12)]),
    startDate: z.string(), firstDueDate: z.string(), method: z.enum(['ANNUITY', 'EQUAL_PRINCIPAL', 'INTEREST_ONLY', 'MANUAL']),
});
const accountsSchema = z.object({ bank: z.string().min(1), longTerm: z.string().min(1), shortTerm: z.string().min(1),
    interestExpense: z.string().min(1), feesExpense: z.string().min(1) });
const draftSchema = z.object({ requestId: z.string().uuid(), name: z.string().trim().min(1).max(150),
    investorId: z.string().min(1), terms: termsSchema, accounts: accountsSchema,
    schedule: z.array(rowSchema).max(600).optional(), note: z.string().max(2000).default('') });
const actionSchema = z.object({ requestId: z.string().uuid(), date: z.string() });
const paymentSchema = actionSchema.extend({ bankAccountId: z.string().min(1), fees: z.coerce.number().nonnegative().default(0),
    note: z.string().max(2000).default(''), allocations: z.array(z.object({ number: z.number().int().positive(),
        principal: z.coerce.number().nonnegative(), interest: z.coerce.number().nonnegative() })).min(1).max(600) });
function scheduleFor(b: z.infer<typeof draftSchema>): LoanScheduleRow[] {
    try {
        return b.terms.method === 'MANUAL'
            ? validateLoanSchedule(b.terms, (b.schedule || []).map((r, i) => ({ ...r, number: i + 1 })))
            : computeLoanSchedule(b.terms);
    } catch (error: any) { throw badRequest(error.message); }
}
async function account(id: string, category: string, types?: string[]) {
    const a = await db.accountingAccount.findFirst({ where: { id, isActive: true } });
    if (!a || a.category !== category || (types && !types.includes(a.accountType))) throw badRequest('Choose active accounts of the required type in this company');
    const currency = (await db.company.findUnique()).currency;
    if (a.currency !== currency) throw badRequest('Loan accounts must use the company base currency');
    return a;
}
async function validateAccounts(accounts: any, investorId: string) {
    const p = await investor(investorId);
    if (p.profile.status !== 'ACTIVE') throw badRequest('Choose an active investor');
    if (new Set(Object.values(accounts)).size !== Object.values(accounts).length - (accounts.interestExpense === accounts.feesExpense ? 1 : 0))
        throw badRequest('Bank, long-term liability, current liability and expense accounts must be distinct');
    await account(accounts.bank, 'ASSET', ['CASH', 'BANK']);
    await account(accounts.longTerm, 'LIABILITY', ['OTHER_LIABILITY']);
    await account(accounts.shortTerm, 'LIABILITY', ['OTHER_CURRENT_LIABILITY']);
    await account(accounts.interestExpense, 'EXPENSE');
    await account(accounts.feesExpense, 'EXPENSE');
    return p;
}
export async function getLoan(id: string) {
    const [loan] = await query('SELECT * FROM accountant_v2_loans WHERE company_id=$1 AND id=$2', id);
    if (!loan) throw notFound('Loan');
    return loan;
}
export async function loanEvents(id: string) {
    return query('SELECT e.*,e.event_date::text AS event_date FROM accountant_v2_loan_events e WHERE e.company_id=$1 AND e.loan_id=$2 ORDER BY e.event_date,e.created_at,e.id', id);
}
function chronological(events: any[], value: string) {
    if (events.some(e => e.event_date > value)) throw badRequest('Choose a date on or after the latest loan entry');
}
async function retry(requestId: string, loanId: string, canonical: string) {
    const [event] = await query('SELECT * FROM accountant_v2_loan_events WHERE company_id=$1 AND request_id=$2', requestId);
    if (event && (event.loan_id !== loanId || event.details.request !== canonical)) throw badRequest('Request ID was already used with different data');
    return event;
}
async function post(loan: any, kind: string, value: string, requestId: string, lines: any[], amounts: any, details: any = {}) {
    const eventId = randomUUID(), p = await investor(loan.investor_id);
    const amount = lines.filter(l => l.side === 'DEBIT').reduce((s, l) => s + cents(l.amount), 0) / 100;
    const journal = await writeInvestorJournal(p, eventId, investorDate(value), amount, lines,
        details.note || `${loan.name}: ${kind.toLowerCase()}`, loan.name, 'LOAN');
    await execute(`INSERT INTO accountant_v2_loan_events(id,company_id,loan_id,event_date,kind,principal,interest,fees,journal_id,request_id,details)
        VALUES($2,$1,$3,$4::date,$5,$6,$7,$8,$9,$10,$11::jsonb)`, eventId, loan.id, value, kind,
        amounts.principal || 0, amounts.interest || 0, amounts.fees || 0, journal.id, requestId, JSON.stringify(details));
    // Investor principal totals must reflect actual cash movements, never scheduled charges.
    if (amounts.principal && ['RECEIPT', 'PAYMENT', 'SETTLEMENT', 'PAYMENT_REVERSAL'].includes(kind)) {
        const originalKind = kind === 'RECEIPT' ? 'LOAN_IN' : 'LOAN_OUT';
        await execute(`INSERT INTO accountant_v2_investor_events(id,company_id,investor_id,event_date,kind,amount,journal_id,request_id,reversed_id,details)
            VALUES($2,$1,$3,$4::date,$5,$6,$7,$8,$9,$10::jsonb)`, eventId, loan.investor_id, value,
            kind === 'PAYMENT_REVERSAL' ? 'REVERSAL' : originalKind, amounts.principal, journal.id, `loan:${requestId}`,
            kind === 'PAYMENT_REVERSAL' ? details.originalId : null,
            JSON.stringify({ loanId: loan.id, originalKind, note: details.note || loan.name }));
    }
    return { id: eventId, journalId: journal.id };
}
const line = (accountId: string, side: string, amount: number) => ({ accountId, side, amount });
async function reclassify(loan: any, value: string, key: string) {
    const amount = loan.schedule.filter((r: any) => r.date > value && r.date <= loanMonth(value, 12))
        .reduce((s: number, r: any) => s + cents(r.principal), 0) / 100;
    if (!amount) return;
    await post(loan, 'RECLASS', value, key, [line(loan.accounts.longTerm, 'DEBIT', amount), line(loan.accounts.shortTerm, 'CREDIT', amount)],
        { principal: amount }, { reverseDate: loanNextDay(value) });
}
async function reverseReclass(loan: any, original: any, value: string) {
    await post(loan, 'RECLASS_REVERSAL', value, `loan:${loan.id}:reclass-reverse:${original.id}`,
        [line(loan.accounts.shortTerm, 'DEBIT', Number(original.principal)), line(loan.accounts.longTerm, 'CREDIT', Number(original.principal))],
        { principal: Number(original.principal) }, { originalId: original.id });
}
/** Process chronologically; future entries never affect today's books. Safe to retry. */
export async function postLoanDue(loan: any, through: string) {
    date(through);
    if (loan.status !== 'OPEN') return;
    const events = await loanEvents(loan.id);
    chronological(events, through);
    const pending = loan.schedule.filter((r: any) => r.date <= through && !events.some(e => e.kind === 'INSTALMENT' && e.details.number === r.number));
    const reversals = events.filter(e => e.kind === 'RECLASS' && e.details.reverseDate <= through && !events.some(r => r.kind === 'RECLASS_REVERSAL' && r.details.originalId === e.id));
    const timeline = [...pending.map((row: any) => ({ date: row.date, row })), ...reversals.map(original => ({ date: original.details.reverseDate, original }))]
        .sort((a, b) => a.date.localeCompare(b.date) || ('original' in a ? -1 : 1));
    for (const item of timeline) {
        if ('original' in item) { await reverseReclass(loan, item.original, item.date); continue; }
        const row = item.row, lines: ReturnType<typeof line>[] = [];
        if (row.principal) lines.push(line(loan.accounts.longTerm, 'DEBIT', row.principal));
        if (row.interest) lines.push(line(loan.accounts.interestExpense, 'DEBIT', row.interest));
        lines.push(line(loan.accounts.shortTerm, 'CREDIT', (cents(row.principal) + cents(row.interest)) / 100));
        await post(loan, 'INSTALMENT', row.date, `loan:${loan.id}:instalment:${row.number}`, lines, row, { number: row.number });
        await reclassify(loan, row.date, `loan:${loan.id}:reclass:${row.number}`);
        // Newly generated reversals must also catch up, before the next instalment.
        const current = await loanEvents(loan.id);
        const recent = current.find(e => e.request_id === `loan:${loan.id}:reclass:${row.number}`);
        if (recent && recent.details.reverseDate <= through) await reverseReclass(loan, recent, recent.details.reverseDate);
    }
}
async function setStatus(loan: any, status: string) {
    await execute('UPDATE accountant_v2_loans SET status=$3,updated_at=CURRENT_TIMESTAMP WHERE company_id=$1 AND id=$2', loan.id, status);
}
async function recordLoan(loan: any, requestId: string) {
    if (loan.status !== 'DRAFT') return loan;
    await validateAccounts(loan.accounts, loan.investor_id);
    await assertAccountingDateUnlocked(context().companyId, date(loan.terms.startDate), 'BANKING');
    await post(loan, 'RECEIPT', loan.terms.startDate, requestId,
        [line(loan.accounts.bank, 'DEBIT', loan.terms.amount), line(loan.accounts.longTerm, 'CREDIT', loan.terms.amount)],
        { principal: loan.terms.amount }, { request: JSON.stringify({ requestId, date: loan.terms.startDate }) });
    await setStatus(loan, 'OPEN'); loan.status = 'OPEN';
    await reclassify(loan, loan.terms.startDate, `loan:${loan.id}:reclass:initial`);
    await postLoanDue(loan, today());
    return getLoan(loan.id);
}

loanRouter.get('/', async (_req, res) => {
    const available = await loansAvailable(), currency = (await db.company.findUnique()).currency;
    if (!available) return res.json({ ready: false, currency, data: [] });
    const loans = await query('SELECT l.*,i.name AS investor_name FROM accountant_v2_loans l JOIN accountant_v2_investors i ON i.company_id=l.company_id AND i.id=l.investor_id WHERE l.company_id=$1 ORDER BY l.created_at DESC');
    const events = await query('SELECT e.*,e.event_date::text AS event_date FROM accountant_v2_loan_events e WHERE e.company_id=$1 ORDER BY e.event_date,e.created_at,e.id');
    res.json({ ready: true, currency, data: loans.map(loan => ({ ...loan, position: loanPosition(loan.schedule, events.filter(e => e.loan_id === loan.id), today()) })) });
});
loanRouter.get('/options', async (_req, res) => res.json({
    currency: (await db.company.findUnique()).currency,
    investors: await query("SELECT id,name,accounts FROM accountant_v2_investors WHERE company_id=$1 AND profile->>'status'='ACTIVE' ORDER BY name"),
    accounts: await db.accountingAccount.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
}));
loanRouter.post('/preview', async (req, res) => {
    const b = draftSchema.parse(req.body); res.json({ schedule: scheduleFor(b) });
});
loanRouter.post('/', async (req, res) => {
    await ready();
    const b = draftSchema.parse(req.body), schedule = scheduleFor(b);
    const [existing] = await query('SELECT * FROM accountant_v2_loans WHERE company_id=$1 AND id=$2', b.requestId);
    const request = JSON.stringify(b);
    if (existing) {
        if (existing.terms.request !== request) throw badRequest('Request ID already used with different data');
        return res.json(await recordLoan(existing, b.requestId));
    }
    await validateAccounts(b.accounts, b.investorId);
    const currency = (await db.company.findUnique()).currency;
    // Prisma's @updatedAt is client-managed and does not populate raw SQL inserts.
    await execute(`INSERT INTO accountant_v2_loans(id,company_id,investor_id,name,currency,terms,accounts,schedule,created_at,updated_at)
        VALUES($2,$1,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, b.requestId, b.investorId, b.name, currency,
        JSON.stringify({ ...b.terms, note: b.note, request }), JSON.stringify(b.accounts), JSON.stringify(schedule));
    res.status(201).json(await recordLoan(await getLoan(b.requestId), b.requestId));
});
loanRouter.get('/:id', async (req, res) => {
    await ready(); const loan = await getLoan(req.params.id), events = await loanEvents(loan.id);
    const p = await investor(loan.investor_id);
    res.json({ ...loan, investor_name: p.name, events, position: loanPosition(loan.schedule, events, today()) });
});
loanRouter.put('/:id', async (req, res) => {
    await ready(); const loan = await getLoan(req.params.id), b = draftSchema.parse(req.body);
    if (loan.status !== 'DRAFT') {
        if (loan.terms.completedRequest === JSON.stringify(b)) return res.json(loan);
        throw badRequest('Only draft loans can be edited');
    }
    const schedule = scheduleFor(b); await validateAccounts(b.accounts, b.investorId);
    await execute(`UPDATE accountant_v2_loans SET investor_id=$3,name=$4,terms=$5::jsonb,accounts=$6::jsonb,schedule=$7::jsonb,updated_at=CURRENT_TIMESTAMP
        WHERE company_id=$1 AND id=$2`, loan.id, b.investorId, b.name, JSON.stringify({ ...b.terms, note: b.note, request: loan.terms.request, completedRequest: JSON.stringify(b) }), JSON.stringify(b.accounts), JSON.stringify(schedule));
    res.json(await recordLoan(await getLoan(loan.id), b.requestId));
});
loanRouter.post('/:id/validate', async (req, res) => {
    manager(); await ready();
    const loan = await getLoan(req.params.id), b = actionSchema.parse(req.body), canonical = JSON.stringify(b);
    if (await retry(b.requestId, loan.id, canonical)) return res.json(await getLoan(loan.id));
    if (loan.status !== 'DRAFT') throw badRequest('Only a draft loan can be validated');
    if (b.date !== loan.terms.startDate) throw badRequest('Validation must use the borrowing date');
    await validateAccounts(loan.accounts, loan.investor_id);
    await assertAccountingDateUnlocked(context().companyId, date(b.date), 'BANKING');
    await post(loan, 'RECEIPT', b.date, b.requestId, [line(loan.accounts.bank, 'DEBIT', loan.terms.amount), line(loan.accounts.longTerm, 'CREDIT', loan.terms.amount)],
        { principal: loan.terms.amount }, { request: canonical });
    await setStatus(loan, 'OPEN'); loan.status = 'OPEN';
    await reclassify(loan, b.date, `loan:${loan.id}:reclass:initial`);
    await postLoanDue(loan, today());
    res.json(await getLoan(loan.id));
});
loanRouter.post('/:id/post-due', async (req, res) => {
    await ready(); const loan = await getLoan(req.params.id);
    if (loan.status !== 'OPEN') throw badRequest('Only open loans have due entries');
    await postLoanDue(loan, today()); res.json({ id: loan.id });
});
loanRouter.post('/:id/pay', async (req, res) => {
    await ready(); const loan = await getLoan(req.params.id), b = paymentSchema.parse(req.body), canonical = JSON.stringify(b);
    const existing = await retry(b.requestId, loan.id, canonical); if (existing) return res.json(existing);
    if (loan.status !== 'OPEN') throw badRequest('Choose an open loan');
    date(b.date); chronological(await loanEvents(loan.id), b.date);
    await account(b.bankAccountId, 'ASSET', ['CASH', 'BANK']);
    await assertAccountingDateUnlocked(context().companyId, investorDate(b.date), 'BANKING');
    await postLoanDue(loan, b.date);
    const events = await loanEvents(loan.id), position = loanPosition(loan.schedule, events, b.date);
    if (new Set(b.allocations.map(a => a.number)).size !== b.allocations.length) throw badRequest('Each instalment can appear only once');
    let principal = 0, interest = 0;
    for (const allocation of b.allocations) {
        const row = position.rows.find(r => r.number === allocation.number);
        if (!row || row.date > b.date) throw badRequest('Use early settlement to pay future principal');
        const p = cents(allocation.principal), i = cents(allocation.interest);
        if (p > cents(row.principalDue) || i > cents(row.interestDue)) throw badRequest('Payment exceeds the unpaid instalment principal or interest');
        principal += p; interest += i;
    }
    const fees = cents(b.fees), total = principal + interest + fees;
    if (principal + interest <= 0) throw badRequest('Enter principal or interest to repay');
    const lines = [line(loan.accounts.shortTerm, 'DEBIT', (principal + interest) / 100)];
    if (fees) lines.push(line(loan.accounts.feesExpense, 'DEBIT', fees / 100));
    lines.push(line(b.bankAccountId, 'CREDIT', total / 100));
    const result = await post(loan, 'PAYMENT', b.date, b.requestId, lines, { principal: principal / 100, interest: interest / 100, fees: fees / 100 },
        { allocations: b.allocations, request: canonical, note: b.note });
    const after = loanPosition(loan.schedule, await loanEvents(loan.id), b.date);
    if (!after.principal && !after.interestDue && !after.futureInterest) await setStatus(loan, 'CLOSED');
    res.json(result);
});
loanRouter.post('/:id/settle', async (req, res) => {
    manager(); await ready(); const loan = await getLoan(req.params.id);
    const b = actionSchema.extend({ bankAccountId: z.string().min(1), extraInterest: z.coerce.number().nonnegative().default(0), fees: z.coerce.number().nonnegative().default(0), note: z.string().trim().min(1).max(2000) }).parse(req.body);
    const canonical = JSON.stringify(b), existing = await retry(b.requestId, loan.id, canonical); if (existing) return res.json(existing);
    if (loan.status !== 'OPEN') throw badRequest('Choose an open loan');
    date(b.date); chronological(await loanEvents(loan.id), b.date);
    await account(b.bankAccountId, 'ASSET', ['CASH', 'BANK']);
    await assertAccountingDateUnlocked(context().companyId, investorDate(b.date), 'BANKING');
    await postLoanDue(loan, b.date);
    let events = await loanEvents(loan.id);
    for (const event of events.filter(e => e.kind === 'RECLASS' && !events.some(r => r.kind === 'RECLASS_REVERSAL' && r.details.originalId === e.id)))
        await reverseReclass(loan, event, b.date);
    events = await loanEvents(loan.id);
    const position = loanPosition(loan.schedule, events, b.date), duePrincipal = position.rows.filter(r => r.date <= b.date).reduce((s, r) => s + cents(r.principalDue), 0);
    const futurePrincipal = cents(position.principal) - duePrincipal, dueInterest = cents(position.interestDue), extraInterest = cents(b.extraInterest), fees = cents(b.fees);
    const total = duePrincipal + futurePrincipal + dueInterest + extraInterest + fees, lines: ReturnType<typeof line>[] = [];
    if (!total) throw badRequest('No outstanding balance to settle');
    if (duePrincipal + dueInterest) lines.push(line(loan.accounts.shortTerm, 'DEBIT', (duePrincipal + dueInterest) / 100));
    if (futurePrincipal) lines.push(line(loan.accounts.longTerm, 'DEBIT', futurePrincipal / 100));
    if (extraInterest) lines.push(line(loan.accounts.interestExpense, 'DEBIT', extraInterest / 100));
    if (fees) lines.push(line(loan.accounts.feesExpense, 'DEBIT', fees / 100));
    lines.push(line(b.bankAccountId, 'CREDIT', total / 100));
    const result = await post(loan, 'SETTLEMENT', b.date, b.requestId, lines, { principal: position.principal, interest: (dueInterest + extraInterest) / 100, fees: fees / 100 },
        { request: canonical, note: b.note, waivedFutureInterest: position.futureInterest,
            allocations: position.rows.map(r => ({ number: r.number, principal: r.principalDue, interest: r.date <= b.date ? r.interestDue : 0 })) });
    await setStatus(loan, 'CLOSED'); res.json(result);
});
loanRouter.post('/:id/reverse-payment', async (req, res) => {
    manager(); await ready(); const loan = await getLoan(req.params.id);
    const b = actionSchema.extend({ eventId: z.string().uuid(), reason: z.string().trim().min(1).max(1000) }).parse(req.body), canonical = JSON.stringify(b);
    const existing = await retry(b.requestId, loan.id, canonical); if (existing) return res.json(existing);
    const events = await loanEvents(loan.id), original = events.find(e => e.id === b.eventId);
    if (!original || original.kind !== 'PAYMENT' || events.some(e => e.kind === 'PAYMENT_REVERSAL' && e.details.originalId === original.id)) throw badRequest('Choose an unreversed regular repayment');
    if (events.some(e => ['PAYMENT', 'SETTLEMENT'].includes(e.kind) && !events.some(r => r.kind === 'PAYMENT_REVERSAL' && r.details.originalId === e.id) && events.indexOf(e) > events.indexOf(original))) throw badRequest('Reverse later payments first');
    chronological(events, b.date); date(b.date);
    for (const value of [b.date, original.event_date]) {
        await assertAccountingDateUnlocked(context().companyId, investorDate(value));
        await assertAccountingDateUnlocked(context().companyId, investorDate(value), 'BANKING');
    }
    const journal = await db.manualJournal.findFirst({ where: { id: original.journal_id }, include: { lines: true } });
    if (!journal || journal.status !== 'PUBLISHED') throw badRequest('Original journal is missing');
    const result = await post(loan, 'PAYMENT_REVERSAL', b.date, b.requestId,
        journal.lines.map((l: any) => line(l.accountId, l.side === 'DEBIT' ? 'CREDIT' : 'DEBIT', Number(l.amount))),
        { principal: Number(original.principal), interest: Number(original.interest), fees: Number(original.fees) },
        { request: canonical, originalId: original.id, note: b.reason });
    await db.manualJournal.update({ where: { id: result.journalId }, data: { reversedFromId: journal.id } });
    await setStatus(loan, 'OPEN'); res.json(result);
});
loanRouter.post('/:id/cancel', async (req, res) => {
    manager(); await ready(); const loan = await getLoan(req.params.id);
    const b = z.object({ reason: z.string().trim().min(1).max(1000) }).parse(req.body);
    if (loan.status !== 'DRAFT') throw badRequest('Only unposted drafts can be cancelled; settle an active loan');
    await setStatus(loan, 'CANCELLED');
    await logActivity({ ...context(), resource: 'loan', resourceId: loan.id, action: 'cancelled', meta: b });
    res.json({ id: loan.id });
});
