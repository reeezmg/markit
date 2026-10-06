import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { accountantPrisma as db, context, logActivity } from './context';
import { Router, requireAuth, rbac, badRequest, notFound } from './router';
import { ensureDefaults } from './accounts';
import { accountDefaults } from './account-settings';
import {
    cents,
    validatePosting,
    assertAccountingDateUnlocked,
} from './posting';

export const investorRouter = Router();
investorRouter.use(requireAuth, rbac('ACCOUNT', 'WRITE'));
const query = (sql: string, ...args: any[]): Promise<any[]> =>
    db.$queryRawUnsafe(sql, context().companyId, ...args);
const execute = (sql: string, ...args: any[]) =>
    db.$executeRawUnsafe(sql, context().companyId, ...args);
export function investorDate(value: string) {
    const date = new Date(value + 'T00:00:00.000Z');
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
    )
        throw badRequest('Select a valid date');
    return date;
}
const day = (d: any) => new Date(d).toISOString().slice(0, 10);
const profileSchema = z.object({
    name: z.string().trim().min(1).max(150),
    email: z.string().email().or(z.literal('')).default(''),
    phone: z.string().max(50).default(''),
    status: z.enum(['ACTIVE', 'EXITED']).default('ACTIVE'),
    note: z.string().max(4000).default(''),
    documents: z
        .array(
            z.object({
                name: z.string().trim().min(1).max(150),
                url: z
                    .string()
                    .url()
                    .refine(
                        (v) => /^https?:\/\//.test(v),
                        'Use an HTTP or HTTPS document link'
                    ),
            })
        )
        .max(30)
        .default([]),
});
const termSchema = z.object({
    date: z.string(),
    ownershipPercent: z.coerce.number().min(0).max(100),
    profitPercent: z.coerce.number().min(0).max(100),
    shares: z.coerce.number().nonnegative().max(1e12).default(0),
    totalShares: z.coerce.number().nonnegative().max(1e12).default(0),
    shareClass: z.string().max(100).default('Ordinary'),
    note: z.string().trim().min(1).max(2000),
});
export async function investor(id: string) {
    const [row] = await query(
        'SELECT * FROM accountant_v2_investors WHERE company_id=$1 AND id=$2',
        id
    );
    if (!row) throw notFound('Investor');
    return row;
}
async function linkedCompanyUser(userId: string) {
    const [user] = await query(
        'SELECT cu.user_id,cu.name,cu.phone,cu.role::text,u.email FROM company_users cu JOIN users u ON u.id=cu.user_id WHERE cu.company_id=$1 AND cu.user_id=$2 AND cu.deleted=false AND cu.status=true AND u.cleanup=false',
        userId
    );
    if (!user) throw badRequest('Select an active user in this company');
    return user;
}
async function resolveInvestorUser(input: any) {
    const userId = z.string().optional().parse(input.userId);
    if (userId) return linkedCompanyUser(userId);
    const fresh = z
        .object({
            name: z.string().trim().min(1).max(150),
            email: z.string().trim().email(),
            phone: z.string().max(50).default(''),
        })
        .parse(input.newUser);
    const email = fresh.email.toLowerCase();
    // Serialize identity creation across companies as well as the company accounting lock.
    await db.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `investor-user:${email}`
    );
    const existing = await context().db.$queryRawUnsafe(
        'SELECT id FROM users WHERE lower(email)=$1',
        email
    );
    if (existing.length) return linkedCompanyUser(existing[0].id);
    const id = randomUUID();
    const password = createHash('sha512').update(randomBytes(48)).digest('hex');
    await context().db.$executeRawUnsafe(
        'INSERT INTO users(id,email,password) VALUES($1,$2,$3)',
        id,
        email,
        password
    );
    await execute(
        "INSERT INTO company_users(company_id,user_id,name,phone,role,code) VALUES($1,$2,$3,$4,'investor',(SELECT COALESCE(MAX(code),0)+1 FROM company_users WHERE company_id=$1))",
        id,
        fresh.name,
        fresh.phone || null
    );
    await logActivity({
        ...context(),
        resource: 'investor-user',
        resourceId: id,
        action: 'created',
        meta: { name: fresh.name, role: 'investor' },
    });
    return linkedCompanyUser(id);
}
export async function resolveInvestorAccountSelections(input: unknown, current?: Record<string, string>) {
    const selected = z.object({
        capitalAccountId: z.string().optional(),
        profitAccountId: z.string().optional(),
        loanAccountId: z.string().optional(),
    }).parse(input);
    const defaults = (await accountDefaults()).investments || {};
    const accounts: Record<string, string> = {};
    for (const [key, category, accountType] of [
        ['capital', 'EQUITY', 'EQUITY'],
        ['profit', 'LIABILITY', 'OTHER_CURRENT_LIABILITY'],
        ['loan', 'LIABILITY', 'OTHER_LIABILITY'],
    ]) {
        const field = `${key}AccountId` as keyof typeof selected;
        const accountId = selected[field] === undefined && current ? current[key] : selected[field] || defaults[field];
        if (!accountId) {
            if (key === 'capital') throw badRequest('Choose an investor equity account or configure the company investment default');
            continue;
        }
        const account = await db.accountingAccount.findFirst({ where: { id: accountId, isActive: true, category, accountType } });
        if (!account) throw badRequest(`Select an active ${key} account of the correct type in this company`);
        accounts[key] = account.id;
    }
    return accounts;
}

export async function createInvestor(
    input: unknown,
    legacyUserId: string | null = null
) {
    const user = await linkedCompanyUser(
        legacyUserId ||
            z.object({ userId: z.string().min(1) }).parse(input).userId
    );
    const b = profileSchema.parse({
            ...(input as any),
            name: (input as any).name || user.name,
            email: (input as any).email || user.email,
            phone: (input as any).phone || user.phone || '',
        }),
        id = randomUUID(),
        currency = (await db.company.findUnique()).currency;
    const accounts: Record<string, string> = {};
    const selected = legacyUserId ? null : await resolveInvestorAccountSelections(input);
    for (const [key, label, category, accountType] of [
        ['capital', 'Capital', 'EQUITY', 'EQUITY'],
        ['profit', 'Profit payable', 'LIABILITY', 'OTHER_CURRENT_LIABILITY'],
        ['loan', 'Investor loan', 'LIABILITY', 'OTHER_LIABILITY'],
    ]) {
        if (selected) {
            const accountId = selected[key];
            if (!accountId) continue;
            accounts[key] = accountId;
            continue;
        }
        // Legacy import retains its historical account creation contract.
        const account = await db.accountingAccount.create({
            data: {
                name: `${b.name} · ${label} · ${id.slice(0, 8)}`,
                category,
                accountType,
                currency,
                isSystem: true,
            },
        });
        accounts[key] = account.id;
    }
    await execute(
        'INSERT INTO accountant_v2_investors(id,company_id,name,legacy_user_id,profile,accounts) VALUES($2,$1,$3,$4,$5::jsonb,$6::jsonb)',
        id,
        b.name,
        user.user_id,
        JSON.stringify(b),
        JSON.stringify(accounts)
    );
    await logActivity({
        ...context(),
        resource: 'investor',
        resourceId: id,
        action: 'created',
        meta: b,
    });
    return investor(id);
}
async function termsAt(id: string, date: string) {
    const [row] = await query(
        'SELECT * FROM accountant_v2_investor_terms WHERE company_id=$1 AND investor_id=$2 AND effective_date<=$3::date ORDER BY effective_date DESC LIMIT 1',
        id,
        date
    );
    return row;
}
export async function investorEvents(id?: string) {
    return query(
        `SELECT e.*,j.entry_number,j.status::text AS journal_status,j.deleted_at AS journal_deleted
   FROM accountant_v2_investor_events e LEFT JOIN accountant_v2_manual_journals j ON j.id=e.journal_id AND j.company_id=e.company_id
   WHERE e.company_id=$1 ${
       id ? 'AND e.investor_id=$2' : ''
   } ORDER BY e.event_date,e.created_at,e.id`,
        ...(id ? [id] : [])
    );
}
export function investorTotals(events: any[]) {
    const total = {
        contributed: 0,
        returned: 0,
        capital: 0,
        allocated: 0,
        paid: 0,
        payable: 0,
        loan: 0,
    };
    for (const e of events) {
        if (e.journal_status !== 'PUBLISHED' || e.journal_deleted) continue;
        const n = cents(e.amount) * (e.kind === 'REVERSAL' ? -1 : 1),
            kind = e.kind === 'REVERSAL' ? e.details.originalKind : e.kind;
        if (kind === 'CAPITAL_IN') total.contributed += n;
        if (kind === 'CAPITAL_OUT') total.returned += n;
        if (kind === 'PROFIT_ALLOCATE') total.allocated += n;
        if (kind === 'PROFIT_PAY') total.paid += n;
        if (kind === 'LOAN_IN') total.loan += n;
        if (kind === 'LOAN_OUT') total.loan -= n;
    }
    total.capital = total.contributed - total.returned;
    total.payable = total.allocated - total.paid;
    return Object.fromEntries(
        Object.entries(total).map(([k, v]) => [k, v / 100])
    );
}
const entrySchema = z.object({
    requestId: z.string().uuid(),
    date: z.string(),
    kind: z.enum([
        'CAPITAL_IN',
        'CAPITAL_OUT',
        'PROFIT_ALLOCATE',
        'PROFIT_PAY',
        'LOAN_IN',
        'LOAN_OUT',
    ]),
    amount: z.coerce.number().positive().optional(),
    counterAccountId: z.string().min(1),
    reference: z.string().max(150).default(''),
    note: z.string().max(2000).default(''),
    periodFrom: z.string().optional(),
    periodTo: z.string().optional(),
    companyProfit: z.coerce.number().optional(),
    distributable: z.coerce.number().positive().optional(),
});
export async function writeInvestorJournal(
    p: any,
    id: string,
    date: Date,
    amount: number,
    lines: any[],
    note: string,
    reference: string,
    sourceType = 'INVESTOR'
) {
    const c = context().companyId;
    const tagged = lines.map((l) => ({
        ...l,
        companyId: c,
        sourceParties: { investor: { id: p.id, name: p.name } },
        description: p.name,
    }));
    await validatePosting(tagged, date, c);
    return db.manualJournal.create({
        data: {
            companyId: c,
            entryNumber: `INV-${String(
                (await db.manualJournal.count({})) + 1
            ).padStart(6, '0')}`,
            journalDate: date,
            currency: (await db.company.findUnique()).currency,
            total: amount,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            createdById: context().userId,
            isSystemGenerated: true,
            sourceType,
            sourceId: id,
            notes: note,
            referenceNumber: reference || null,
            lines: { create: tagged },
        },
    });
}
export async function addInvestorEvent(
    id: string,
    input: unknown,
    allocation?: { batchId: string; amount: number }
) {
    const p = await investor(id),
        b = entrySchema.parse(input),
        date = investorDate(b.date),
        canonical = JSON.stringify(b);
    const [existing] = await query(
        'SELECT * FROM accountant_v2_investor_events WHERE company_id=$1 AND request_id=$2',
        b.requestId
    );
    if (existing) {
        if (
            existing.investor_id !== id ||
            existing.details.request !== canonical
        )
            throw badRequest('Request ID already used with different data');
        return existing;
    }
    if (p.profile.status === 'EXITED')
        throw badRequest('Reactivate this investor before recording movements');
    let amount = b.amount,
        snapshot: any = null;
    if (b.kind === 'PROFIT_ALLOCATE') {
        if (!['admin', 'manager'].includes(context().role))
            throw badRequest(
                'A manager or admin must approve profit allocations'
            );
        if (
            !b.periodFrom ||
            !b.periodTo ||
            !b.distributable ||
            b.companyProfit === undefined
        )
            throw badRequest(
                'Enter the profit period, company profit and approved distributable amount'
            );
        investorDate(b.periodFrom);
        investorDate(b.periodTo);
        cents(b.companyProfit);
        cents(b.distributable);
        if (b.periodFrom > b.periodTo || b.periodTo > b.date)
            throw badRequest(
                'Profit period must end on or before the allocation date'
            );
        const term = await termsAt(id, b.periodTo);
        if (!term)
            throw badRequest(
                'Record profit-sharing terms effective for this period first'
            );
        // A changed agreement within a period needs explicit split allocations.
        const changes = await query(
            'SELECT id FROM accountant_v2_investor_terms WHERE company_id=$1 AND investor_id=$2 AND effective_date>$3::date AND effective_date<=$4::date',
            id,
            b.periodFrom,
            b.periodTo
        );
        if (changes.length)
            throw badRequest(
                'Split the profit period at each agreement change'
            );
        const prior = (await investorEvents(id)).filter(
            (e) =>
                e.kind === 'PROFIT_ALLOCATE' &&
                e.details.periodFrom <= b.periodTo! &&
                e.details.periodTo >= b.periodFrom!
        );
        const events = await investorEvents(id);
        if (prior.some((e) => !events.some((r) => r.reversed_id === e.id)))
            throw badRequest('An allocation already covers this period');
        amount =
            Math.round(
                (cents(b.distributable) * term.terms.profitPercent) / 100
            ) / 100;
        snapshot = { ...term.terms, termId: term.id };
        if (allocation) {
            if (
                cents(allocation.amount) <= 0 ||
                cents(allocation.amount) > cents(amount)
            )
                throw badRequest('Invalid rounded allocation');
            amount = allocation.amount;
        }
    }
    if (!amount || cents(amount) <= 0)
        throw badRequest('Enter a positive amount');
    const counter = await db.accountingAccount.findFirst({
        where: { id: b.counterAccountId, isActive: true },
    });
    if (!counter)
        throw badRequest(
            'Choose an active counterpart account in this company'
        );
    if (
        b.kind === 'PROFIT_ALLOCATE'
            ? counter.category !== 'EQUITY'
            : !['CASH', 'BANK'].includes(counter.accountType)
    )
        throw badRequest(
            b.kind === 'PROFIT_ALLOCATE'
                ? 'Choose the equity account funding the distribution'
                : 'Choose a cash or bank account'
        );
    const key = b.kind.startsWith('CAPITAL')
            ? 'capital'
            : b.kind.startsWith('PROFIT')
            ? 'profit'
            : 'loan',
        purpose = p.accounts[key];
    if (!purpose) throw badRequest(`This investor has no ${key} account linked; configure that account before posting`);
    const investorAccounts = await query(
        "SELECT id FROM accountant_v2_investors WHERE company_id=$1 AND (accounts->>'capital'=$2 OR accounts->>'profit'=$2 OR accounts->>'loan'=$2)",
        counter.id
    );
    if (investorAccounts.length)
        throw badRequest(
            'Choose a counterpart outside dedicated investor accounts'
        );
    const balance = investorTotals(
        (await investorEvents(id)).filter((e) => day(e.event_date) <= b.date)
    );
    if (b.kind === 'PROFIT_PAY' && cents(amount) > cents(balance.payable))
        throw badRequest(
            'Payment exceeds allocated unpaid profit on this date'
        );
    if (b.kind === 'LOAN_OUT' && cents(amount) > cents(balance.loan))
        throw badRequest('Repayment exceeds the loan balance on this date');
    const incoming = ['CAPITAL_IN', 'LOAN_IN', 'PROFIT_ALLOCATE'].includes(
        b.kind
    );
    if (b.kind !== 'PROFIT_ALLOCATE')
        await assertAccountingDateUnlocked(
            context().companyId,
            date,
            'BANKING'
        );
    const eventId = randomUUID(),
        j = await writeInvestorJournal(
            p,
            eventId,
            date,
            amount,
            [
                {
                    accountId: counter.id,
                    side: incoming ? 'DEBIT' : 'CREDIT',
                    amount,
                },
                {
                    accountId: purpose,
                    side: incoming ? 'CREDIT' : 'DEBIT',
                    amount,
                },
            ],
            b.note,
            b.reference
        );
    await execute(
        `INSERT INTO accountant_v2_investor_events(id,company_id,investor_id,event_date,kind,amount,journal_id,request_id,details)
   VALUES($2,$1,$3,$4::date,$5,$6,$7,$8,$9::jsonb)`,
        eventId,
        id,
        b.date,
        b.kind,
        amount,
        j.id,
        b.requestId,
        JSON.stringify({
            ...b,
            request: canonical,
            terms: snapshot,
            ...(allocation ? { batchId: allocation.batchId } : {}),
        })
    );
    await assertInvestorBalances(id);
    return { id: eventId, journalId: j.id };
}
async function assertInvestorBalances(id: string) {
    const running: any[] = [];
    for (const e of await investorEvents(id)) {
        running.push(e);
        const t = investorTotals(running);
        if (cents(t.payable) < 0 || cents(t.loan) < 0)
            throw badRequest(
                'This change would leave profit payable or investor loan negative in the ledger'
            );
    }
}
investorRouter.get('/', async (req, res) => {
    const asOf = String(
        req.query.asOf || new Date().toISOString().slice(0, 10)
    );
    investorDate(asOf);
    const profiles = await query(
        'SELECT * FROM accountant_v2_investors WHERE company_id=$1 ORDER BY name'
    );
    const events = (await investorEvents()).filter(
        (e) => day(e.event_date) <= asOf
    );
    res.json({
        currency: (await db.company.findUnique()).currency,
        asOf,
        data: await Promise.all(
            profiles.map(async (p) => ({
                ...p,
                terms: (await termsAt(p.id, asOf))?.terms || null,
                ...investorTotals(events.filter((e) => e.investor_id === p.id)),
            }))
        ),
    });
});
investorRouter.get('/options', async (_req, res) => {
    await ensureDefaults(context().companyId);
    res.json(
        await db.accountingAccount.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
        })
    );
});
investorRouter.get('/users', async (_req, res) => {
    res.json(
        await query(`SELECT cu.user_id AS id,cu.name,cu.phone,cu.role::text,u.email,p.id AS investor_id
        FROM company_users cu JOIN users u ON u.id=cu.user_id
        LEFT JOIN accountant_v2_investors p ON p.company_id=cu.company_id AND p.legacy_user_id=cu.user_id
        WHERE cu.company_id=$1 AND cu.deleted=false AND cu.status=true AND u.cleanup=false ORDER BY cu.name,u.email`)
    );
});
investorRouter.post('/', async (req, res) => {
    const user = await resolveInvestorUser(req.body);
    const [existing] = await query(
        'SELECT id FROM accountant_v2_investors WHERE company_id=$1 AND legacy_user_id=$2',
        user.user_id
    );
    if (existing) throw badRequest('This user already has an investor profile');
    res.status(201).json(
        await createInvestor({
            ...req.body,
            userId: user.user_id,
            name: req.body.name || user.name,
        })
    );
});
investorRouter.get('/ledger', async (_req, res) => {
    const profiles = await query(
        'SELECT id,name FROM accountant_v2_investors WHERE company_id=$1'
    );
    res.json({
        currency: (await db.company.findUnique()).currency,
        events: (await investorEvents()).map((e) => ({
            ...e,
            investorName:
                profiles.find((p) => p.id === e.investor_id)?.name || '',
        })),
    });
});
async function companyShareSettings() {
    const saved = await db.auditLog.findFirst({
        where: { resource: 'investor-share-settings', action: 'configured' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { totalShares: Number(saved?.after?.totalShares || 0) };
}
investorRouter.get('/share-settings', async (_req, res) => {
    res.json(await companyShareSettings());
});
investorRouter.put('/share-settings', async (req, res) => {
    if (!['admin', 'manager'].includes(context().role))
        throw badRequest('Only managers and admins can change company shares');
    const settings = z
        .object({
            totalShares: z.coerce.number().finite().nonnegative().max(1e12),
        })
        .parse(req.body);
    await logActivity({
        ...context(),
        resource: 'investor-share-settings',
        resourceId: context().companyId,
        action: 'configured',
        meta: settings,
    });
    res.json(settings);
});
investorRouter.get('/:id', async (req, res) =>
    res.json({
        investor: await investor(req.params.id),
        terms: await query(
            'SELECT * FROM accountant_v2_investor_terms WHERE company_id=$1 AND investor_id=$2 ORDER BY effective_date DESC',
            req.params.id
        ),
        events: await investorEvents(req.params.id),
    })
);
investorRouter.put('/:id', async (req, res) => {
    const current = await investor(req.params.id);
    let userId = current.legacy_user_id;
    if (!userId) userId = (await resolveInvestorUser(req.body)).user_id;
    else if (req.body.userId && req.body.userId !== userId)
        throw badRequest(
            'An existing investor cannot be reassigned to another user'
        );
    const b = profileSchema.parse(req.body);
    const changingAccounts = ['capitalAccountId', 'profitAccountId', 'loanAccountId'].some(key => key in req.body);
    const accounts = changingAccounts ? await resolveInvestorAccountSelections(req.body, current.accounts) : current.accounts;
    if (changingAccounts) {
        const totals = investorTotals(await investorEvents(current.id));
        for (const [key, balance] of [['capital', totals.capital], ['profit', totals.payable], ['loan', totals.loan]] as const) {
            if (accounts[key] !== current.accounts[key] && cents(balance) !== 0)
                throw badRequest(`The ${key} account has an outstanding investor balance; settle or reclassify it before changing its account`);
        }
    }
    await execute(
        'UPDATE accountant_v2_investors SET name=$3,profile=$4::jsonb,legacy_user_id=$5,accounts=$6::jsonb WHERE company_id=$1 AND id=$2',
        req.params.id,
        b.name,
        JSON.stringify(b),
        userId,
        JSON.stringify(accounts)
    );
    await logActivity({
        ...context(),
        resource: 'investor',
        resourceId: req.params.id,
        action: 'profile-updated',
        meta: { ...b, accountSelections: { before: current.accounts, after: accounts } },
    });
    res.json({ id: req.params.id });
});
async function validateAgreementTotals() {
    const terms = await query(
        'SELECT * FROM accountant_v2_investor_terms WHERE company_id=$1 ORDER BY effective_date,created_at'
    );
    for (const date of [...new Set(terms.map((t) => day(t.effective_date)))]) {
        const current = new Map<string, any>();
        for (const t of terms)
            if (day(t.effective_date) <= date)
                current.set(t.investor_id, t.terms);
        for (const key of ['ownershipPercent', 'profitPercent'])
            if (
                [...current.values()].reduce((s, t) => s + t[key], 0) >
                100.000001
            )
                throw badRequest(
                    `Combined ${
                        key === 'ownershipPercent'
                            ? 'ownership'
                            : 'profit share'
                    } exceeds 100% on ${date}`
                );
    }
}
async function saveAgreement(req: any, res: any) {
    if (!['admin', 'manager'].includes(context().role))
        throw badRequest(
            'Only managers and admins can change ownership agreements'
        );
    await investor(req.params.id);
    const [original] = req.params.termId
        ? await query(
              'SELECT * FROM accountant_v2_investor_terms WHERE company_id=$1 AND investor_id=$2 AND id=$3',
              req.params.id,
              req.params.termId
          )
        : [];
    if (req.params.termId && !original) throw notFound('Agreement');
    const b = termSchema.parse(req.body);
    investorDate(b.date);
    const settings = original?.terms.totalShares
        ? { totalShares: Number(original.terms.totalShares) }
        : await companyShareSettings();
    if (b.shares > 0 || b.totalShares > 0) {
        if (!settings.totalShares)
            throw badRequest(
                'Set total company shares in Investments settings first'
            );
        if (
            req.body.totalShares !== undefined &&
            b.totalShares !== settings.totalShares
        )
            throw badRequest(
                'Company shares changed. Reopen the agreement to use the current setting'
            );
        b.totalShares = settings.totalShares;
    }
    if (b.shares > b.totalShares)
        throw badRequest('Shares held cannot exceed total company shares');
    if (
        b.totalShares &&
        Math.abs((b.shares / b.totalShares) * 100 - b.ownershipPercent) > 0.0001
    )
        throw badRequest(
            'Ownership percentage must agree with shares held / total company shares'
        );
    const events = await investorEvents(req.params.id);
    if (
        events.some(
            (e) =>
                e.kind === 'PROFIT_ALLOCATE' &&
                (e.details.periodTo >= b.date ||
                    (original &&
                        e.details.periodTo >= day(original.effective_date)))
        )
    )
        throw badRequest(
            'Terms cannot change a period already used by an allocation; add a later agreement'
        );
    const [duplicate] = await query(
        'SELECT id FROM accountant_v2_investor_terms WHERE company_id=$1 AND investor_id=$2 AND effective_date=$3::date AND id::text<>$4',
        req.params.id,
        b.date,
        original?.id || ''
    );
    if (duplicate)
        throw badRequest(
            'An agreement already exists on this effective date. Edit that agreement or choose another date'
        );
    const termId = original?.id || randomUUID();
    if (original)
        await execute(
            'UPDATE accountant_v2_investor_terms SET effective_date=$4::date,terms=$5::jsonb WHERE company_id=$1 AND investor_id=$3 AND id=$2',
            termId,
            req.params.id,
            b.date,
            JSON.stringify(b)
        );
    else
        await execute(
            'INSERT INTO accountant_v2_investor_terms(id,company_id,investor_id,effective_date,terms) VALUES($2,$1,$3,$4::date,$5::jsonb)',
            termId,
            req.params.id,
            b.date,
            JSON.stringify(b)
        );
    await validateAgreementTotals();
    await logActivity({
        ...context(),
        resource: 'investor',
        resourceId: req.params.id,
        action: original ? 'terms-edited' : 'terms-added',
        meta: original
            ? {
                  termId,
                  before: {
                      ...original.terms,
                      date: day(original.effective_date),
                  },
                  after: b,
              }
            : b,
    });
    res.json({ id: termId });
}
investorRouter.post('/:id/terms', saveAgreement);
investorRouter.put('/:id/terms/:termId', saveAgreement);
investorRouter.delete('/:id/terms/:termId', async (req, res) => {
    if (!['admin', 'manager'].includes(context().role))
        throw badRequest(
            'Only managers and admins can delete ownership agreements'
        );
    await investor(req.params.id);
    const [original] = await query(
        'SELECT * FROM accountant_v2_investor_terms WHERE company_id=$1 AND investor_id=$2 AND id=$3',
        req.params.id,
        req.params.termId
    );
    if (!original) throw notFound('Agreement');
    const events = await investorEvents(req.params.id);
    if (
        events.some(
            (e) =>
                e.kind === 'PROFIT_ALLOCATE' &&
                e.details.periodTo >= day(original.effective_date)
        )
    )
        throw badRequest(
            'This agreement is protected by posted profit allocations and cannot be deleted'
        );
    await execute(
        'DELETE FROM accountant_v2_investor_terms WHERE company_id=$1 AND investor_id=$2 AND id=$3',
        req.params.id,
        req.params.termId
    );
    // Removing a later reduction can restore an earlier percentage above the company limit.
    await validateAgreementTotals();
    await logActivity({
        ...context(),
        resource: 'investor',
        resourceId: req.params.id,
        action: 'terms-deleted',
        meta: {
            termId: original.id,
            before: { ...original.terms, date: day(original.effective_date) },
        },
    });
    res.json({ id: original.id });
});
investorRouter.post('/:id/events', async (req, res) =>
    res.status(201).json(await addInvestorEvent(req.params.id, req.body))
);
investorRouter.post('/:id/reverse/:eventId', async (req, res) => {
    const p = await investor(req.params.id),
        b = z
            .object({
                date: z.string(),
                reason: z.string().trim().min(1).max(1000),
            })
            .parse(req.body),
        date = investorDate(b.date);
    const events = await investorEvents(p.id),
        original = events.find((e) => e.id === req.params.eventId);
    if (!original || !original.journal_id || original.kind === 'REVERSAL')
        throw badRequest('Choose a posted original entry');
    const existing = events.find((e) => e.reversed_id === original.id);
    if (existing) {
        res.json(existing);
        return;
    }
    if (original.details.linkedJournal)
        throw badRequest(
            'Reverse an adopted existing journal through its original source, then reconcile its investor link'
        );
    if (b.date < day(original.event_date))
        throw badRequest('Reversal cannot precede the original');
    for (const d of [date, new Date(original.event_date)]) {
        await assertAccountingDateUnlocked(context().companyId, d);
        await assertAccountingDateUnlocked(context().companyId, d, 'BANKING');
    }
    const journal = await db.manualJournal.findFirst({
        where: { id: original.journal_id },
        include: { lines: true, reversals: true },
    });
    if (!journal || journal.reversals.length)
        throw badRequest('Journal is missing or already reversed');
    const eventId = randomUUID(),
        j = await writeInvestorJournal(
            p,
            eventId,
            date,
            Number(original.amount),
            journal.lines.map((l: any) => ({
                accountId: l.accountId,
                amount: Number(l.amount),
                side: l.side === 'DEBIT' ? 'CREDIT' : 'DEBIT',
            })),
            b.reason,
            '',
            'INVESTOR_REVERSAL'
        );
    await db.manualJournal.update({
        where: { id: j.id },
        data: { reversedFromId: journal.id },
    });
    await execute(
        `INSERT INTO accountant_v2_investor_events(id,company_id,investor_id,event_date,kind,amount,journal_id,request_id,reversed_id,details)
   VALUES($2,$1,$3,$4::date,'REVERSAL',$5,$6,$7,$8,$9::jsonb)`,
        eventId,
        p.id,
        b.date,
        Number(original.amount),
        j.id,
        eventId,
        original.id,
        JSON.stringify({ originalKind: original.kind, note: b.reason })
    );
    await assertInvestorBalances(p.id);
    res.json({ id: eventId });
});
