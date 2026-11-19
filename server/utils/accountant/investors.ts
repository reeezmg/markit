import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { shareDues, shareDueTotals, isShareTrade } from './investor-share-dues';
import { capitalPosition, calculateCapital } from './investor-capital';
import { accountantPrisma as db, context, logActivity } from './context';
import { Router, requireAuth, rbac, badRequest, notFound } from './router';
import { accountDefaults, ensureInvestmentAccountDefaults } from './account-settings';
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
const ownershipSchema = z.object({
    effectiveDate: z.string(), ownershipPercent: z.coerce.number().finite().min(0).max(100), profitPercent: z.coerce.number().finite().min(0).max(100),
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
    let defaults = (await accountDefaults()).investments || {};
    if (['capital', 'profit', 'loan'].some(key => !(selected[`${key}AccountId` as keyof typeof selected] || (selected[`${key}AccountId` as keyof typeof selected] === undefined && current?.[key]) || defaults[`${key}AccountId`]))) {
        defaults = (await ensureInvestmentAccountDefaults()).investments;
    }
    const accounts: Record<string, string> = {};
    for (const [key, category, accountType] of [
        ['capital', 'EQUITY', 'EQUITY'],
        ['profit', 'LIABILITY', 'OTHER_CURRENT_LIABILITY'],
        ['loan', 'LIABILITY', 'OTHER_LIABILITY'],
    ]) {
        const field = `${key}AccountId` as keyof typeof selected;
        const accountId = selected[field] === undefined && current ? current[key] || defaults[field] : selected[field] || defaults[field];
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
   } ORDER BY e.event_date,e.created_at,CASE WHEN e.kind IN ('SHARE_BUY','SHARE_REDEEM') THEN 0 WHEN e.kind='REVERSAL' AND e.details->>'originalKind' IN ('SHARE_BUY','SHARE_REDEEM') THEN 2 ELSE 1 END,e.id`,
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
    counterAccountId: z.string().default(''),
    reference: z.string().max(150).default(''),
    note: z.string().max(2000).default(''),
    adjustShares: z.boolean().optional(),
    pricePerShare: z.coerce.number().finite().positive().optional(),
    shareQuantity: z.coerce.number().finite().positive().optional(),
    previewHash: z.string().optional(),
    paymentStatus: z.enum(['PAID','DUE','PARTIAL']).optional(),
    paidAmount: z.coerce.number().finite().nonnegative().optional(),
    settleTradeId: z.string().uuid().optional(),
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
    const isCapital = ['CAPITAL_IN', 'CAPITAL_OUT'].includes(b.kind);
    if (!isCapital && (b.settleTradeId || b.paymentStatus || b.adjustShares || b.pricePerShare !== undefined || b.shareQuantity !== undefined)) throw badRequest('Only capital movements can change shares');
    const capitalPreview = isCapital ? await previewCapital(id, b) : null;
    if (capitalPreview && ((capitalPreview.pricePerShare !== null && !b.previewHash) || (b.previewHash && b.previewHash !== capitalPreview.previewHash)))
        throw badRequest('Capital calculation changed. Refresh the preview before saving');
    if (capitalPreview) amount = capitalPreview.amount;
    if (capitalPreview?.pricePerShare != null) return recordShareTrade(p,b,canonical,capitalPreview);

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
                'Set investor percentages or buy shares before allocating profit'
            );
        // Changed ownership within a period needs explicit split allocations.
        const changes = await query(
            'SELECT id FROM accountant_v2_investor_terms WHERE company_id=$1 AND investor_id=$2 AND effective_date>$3::date AND effective_date<=$4::date',
            id,
            b.periodFrom,
            b.periodTo
        );
        if (changes.length)
            throw badRequest(
                'Split the profit period at each ownership change'
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
        (await investorEvents(id)).filter((e) => day(e.event_date) <= b.date &&
            (b.kind !== 'LOAN_OUT' || !e.details?.loanId))
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
    const shareChange = capitalPreview?.shareDelta ? await applyCapitalTerms(id, b.date, capitalPreview, eventId) : null;
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
            ...(capitalPreview ? { capitalPreview, shareChange } : {}),
            ...(allocation ? { batchId: allocation.batchId } : {}),
        })
    );
    await assertInvestorBalances(id);
    return { id: eventId, journalId: j.id };
}
async function assertInvestorBalances(id: string) {
    const running: any[] = [], tradeBalances=new Map<string,{total:number;paid:number;cancelled:boolean}>();
    for (const e of await investorEvents(id)) {
        running.push(e);
        if(isShareTrade(e)) tradeBalances.set(e.id,{total:cents(e.amount),paid:0,cancelled:false});
        if(e.details?.settleTradeId && e.journal_status==='PUBLISHED' && !e.journal_deleted){
            const due=tradeBalances.get(e.details.settleTradeId);
            if(!due) throw badRequest('Share settlement precedes its trade');
            due.paid+=cents(e.amount)*(e.kind==='REVERSAL'?-1:1);
            if(due.paid<0 || due.paid>due.total || (due.cancelled && due.paid!==0)) throw badRequest('Share settlement would overpay a trade or invalidate its payment history');
        }
        if(e.reversed_id && tradeBalances.has(e.reversed_id)){
            const due=tradeBalances.get(e.reversed_id)!;
            if(due.paid!==0) throw badRequest('Reverse capital payments before cancelling a trade');
            due.cancelled=true;
        }
        const t = investorTotals(running);
        if (cents(t.payable) < 0 || cents(t.loan) < 0)
            throw badRequest(
                'This change would leave profit payable or investor loan negative in the ledger'
            );
        if (cents(investorTotals(running.filter(e => !e.details?.loanId)).loan) < 0)
            throw badRequest('This change would leave the earlier unassigned loan balance negative');
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
            profiles.map(async (p) => {
                const terms = (await termsAt(p.id, asOf))?.terms || null;
                const totals = investorTotals(events.filter((e) => e.investor_id === p.id));
                return { ...p, terms, ...totals, ...capitalPosition(terms, totals.capital), ...shareDueTotals(events.filter(e=>e.investor_id===p.id)) };
            })
        ),
    });
});
investorRouter.get('/options', async (_req, res) => {
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
    if (req.body.initialAgreement) throw badRequest('Agreements have been removed; enter profile percentages or buy shares');
    const options = z.object({ requestId: z.string().uuid().optional() }).parse(req.body);
    const canonical = JSON.stringify(req.body);
    if (options.requestId) {
        const prior = await db.auditLog.findFirst({ where: { resource: 'investor-create', resourceId: options.requestId, action: 'created' } });
        if (prior) {
            if (prior.after.request !== canonical) throw badRequest('Request ID already used with different investor details');
            return res.json(await investor(prior.after.investorId));
        }
    }
    const user = await resolveInvestorUser(req.body);
    const [existing] = await query(
        'SELECT id FROM accountant_v2_investors WHERE company_id=$1 AND legacy_user_id=$2',
        user.user_id
    );
    if (existing) throw badRequest('This user already has an investor profile');
    const created = await createInvestor({
            ...req.body,
            userId: user.user_id,
            name: req.body.name || user.name,
        });
    await saveProfileOwnership(created.id, req.body, true);
    if (options.requestId) await logActivity({ ...context(), resource: 'investor-create', resourceId: options.requestId, action: 'created', meta: { request: canonical, investorId: created.id } });
    res.status(201).json(created);
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
    const totalShares = Number(saved?.after?.totalShares || 0);
    return { totalShares, includeShares: saved?.after?.includeShares ?? totalShares > 0 };
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
            includeShares: z.boolean().optional(),
        })
        .parse(req.body);
    settings.includeShares ??= settings.totalShares > 0;
    if (settings.includeShares && !settings.totalShares) throw badRequest('Enter total company shares when shares are included');
    const previous = await companyShareSettings();
    const allTerms = await allInvestorTerms();
    const today = new Date().toISOString().slice(0, 10), active = new Map<string, any>();
    for (const t of allTerms) if (day(t.effective_date) <= today) active.set(t.investor_id, t);
    const dependentTerms = [...active.values(), ...allTerms.filter(t => day(t.effective_date) > today)];
    if (settings.totalShares !== previous.totalShares && dependentTerms.some(t => Number(t.terms.totalShares) > 0))
        throw badRequest('Company share total is fixed while investor holdings depend on it');
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
    await saveProfileOwnership(req.params.id, req.body);
    res.json({ id: req.params.id });
});
async function allInvestorTerms(): Promise<any[]> {
    return query('SELECT * FROM accountant_v2_investor_terms WHERE company_id=$1 ORDER BY effective_date,created_at');
}
function shareEconomics(terms: any) {
    return JSON.stringify(['trackingMode','shares','totalShares','ownershipPercent','profitPercent','shareClass'].map(k => terms?.[k] ?? null));
}
function liveShareChanges(events: any[]) {
    return events.filter(e => e.kind !== 'REVERSAL' && e.details?.shareChange && !events.some(r => r.reversed_id === e.id));
}
async function previewCapital(id: string, input: any) {
    await investor(id);
    const b = z.object({ date: z.string(), kind: z.enum(['CAPITAL_IN', 'CAPITAL_OUT']), amount: z.coerce.number().finite().positive().optional(), pricePerShare: z.coerce.number().finite().positive().optional(), shareQuantity: z.coerce.number().finite().positive().optional(), adjustShares: z.boolean().optional(), settleTradeId: z.string().uuid().optional(), paymentStatus: z.enum(['PAID','DUE','PARTIAL']).optional(), paidAmount: z.coerce.number().finite().nonnegative().optional() }).parse(input);
    investorDate(b.date);
    b.adjustShares ??= false;
    if (b.amount !== undefined && new Prisma.Decimal(b.amount).decimalPlaces() > 2) throw badRequest('Capital amounts support two decimal places');
    const [settings, allTerms, events] = await Promise.all([companyShareSettings(), allInvestorTerms(), investorEvents(id)]);
    const ownTerms = allTerms.filter(t => t.investor_id === id);
    const active = ownTerms.filter(t => day(t.effective_date) <= b.date).at(-1);
    if (!b.settleTradeId && liveShareChanges(events).some(e => day(e.event_date) > b.date))
        throw badRequest('Backdated capital would affect later share calculations; correct dependent movements first');
    if (b.pricePerShare === undefined && (b.shareQuantity !== undefined || b.paymentStatus || b.paidAmount !== undefined)) throw badRequest('Payment confirmation and share quantity require a new priced share transaction');
    if (b.settleTradeId) {
        if (b.pricePerShare !== undefined || b.shareQuantity !== undefined || b.paymentStatus || b.adjustShares) throw badRequest('Settling a due cannot move shares again');
        const due = shareDues(events,b.date).find(t=>t.id===b.settleTradeId);
        if (!due || due.cancelled) throw badRequest('Choose an existing share due in this investor account on this date');
        if (due.capitalKind !== b.kind) throw badRequest('Settlement direction must match the share transaction');
        if (!b.amount || cents(b.amount) > cents(due.due)) throw badRequest('Payment exceeds the outstanding share due on this date');
    }
    if (settings.includeShares && !b.settleTradeId && b.pricePerShare === undefined) throw badRequest('Enter a price per share for this purchase or redemption');
    if (b.adjustShares && b.pricePerShare === undefined) throw badRequest('Enter the price for this transaction; agreement prices are no longer used');
    if (b.pricePerShare !== undefined) {
        if (!['admin', 'manager'].includes(context().role)) throw badRequest('Only managers and admins can adjust shares');
        if (!settings.includeShares) throw badRequest('Share tracking is switched off');
    }
    let calculation;
    try { calculation = calculateCapital(active?.terms, investorTotals(events.filter(e => day(e.event_date) <= b.date)).capital, b.kind, b.amount, settings.totalShares, b.pricePerShare, b.shareQuantity); }
    catch (e: any) { throw badRequest(e.message); }
    cents(calculation.amount);
    let paidNow: number | null = null;
    if (b.pricePerShare !== undefined) {
        if (!b.paymentStatus) throw badRequest('Confirm whether this share transaction has been paid');
        paidNow = Number(b.paymentStatus === 'PAID' ? calculation.amount : b.paymentStatus === 'DUE' ? 0 : b.paidAmount ?? -1);
        cents(paidNow);
        if (paidNow < 0 || paidNow > calculation.amount || (b.paymentStatus === 'PARTIAL' && (paidNow <= 0 || paidNow >= calculation.amount))) throw badRequest('Enter a partial payment greater than zero and less than the trade value');
        if (b.paidAmount !== undefined && b.paymentStatus !== 'PARTIAL' && b.paidAmount !== paidNow) throw badRequest('Payment confirmation does not match the amount paid');
    }
    if (paidNow != null) calculation.after.capital = (cents(calculation.before.capital) + (b.kind === 'CAPITAL_IN' ? 1 : -1) * cents(paidNow)) / 100;
    cents(calculation.after.capital);
    if (calculation.shareDelta) {
        if (ownTerms.some(t => day(t.effective_date) > b.date) || events.some(e => day(e.event_date) > b.date && (['CAPITAL_IN', 'CAPITAL_OUT'].includes(e.kind) || ['CAPITAL_IN', 'CAPITAL_OUT'].includes(e.details?.originalKind))))
            throw badRequest('Correct later ownership changes or capital movements before changing shares on this date');
        if (events.some(e => e.kind === 'PROFIT_ALLOCATE' && e.details.periodTo >= b.date))
            throw badRequest('Shares cannot change a period already used by a profit allocation');
        if (active?.terms?.trackingMode === 'PERCENTAGE' && (active.terms.ownershipPercent || active.terms.profitPercent)) throw badRequest('This investor has percentage holdings; clear them in the profile before buying shares');
        const candidate = { id: active && day(active.effective_date) === b.date ? active.id : '__preview__', investor_id: id, effective_date: b.date, created_at: new Date().toISOString(), terms: calculation.afterTerms };
        await validateOwnershipTotals([...allTerms.filter(t => t.id !== candidate.id), candidate].sort((a,b) => day(a.effective_date).localeCompare(day(b.effective_date))));
    }
    const previewHash = createHash('sha256').update(JSON.stringify({ id, b: {date:b.date,kind:b.kind,amount:calculation.amount,pricePerShare:b.pricePerShare ?? null,shareQuantity:b.shareQuantity ?? null,adjustShares:!!b.adjustShares,settleTradeId:b.settleTradeId ?? null,paymentStatus:b.paymentStatus ?? null,paidNow}, settings, allTerms, events })).digest('hex');
    return { ...calculation, paidNow, dueAfter:paidNow == null ? null : calculation.amount - paidNow, beforeTerms: active?.terms || {trackingMode:'SHARES',shares:0,totalShares:settings.totalShares,ownershipPercent:0,profitPercent:0,shareClass:'Ordinary',note:'Before first purchase'}, termId: active?.id || null, previewHash, includeShares: settings.includeShares };
}
investorRouter.get('/:id/capital-preview', async (req, res) => {
    res.json(await previewCapital(req.params.id, { ...req.query, adjustShares: req.query.adjustShares === 'true' }));
});
investorRouter.get('/:id/share-dues', async (req,res) => {
    await investor(req.params.id);
    const asOf = String(req.query.asOf || new Date().toISOString().slice(0,10)); investorDate(asOf);
    res.json({asOf,trades:shareDues(await investorEvents(req.params.id),asOf)});
});
async function recordShareTrade(p: any, b: any, canonical: string, preview: any) {
    await assertAccountingDateUnlocked(context().companyId,investorDate(b.date));
    const id=randomUUID(), kind=b.kind === 'CAPITAL_IN' ? 'SHARE_BUY' : 'SHARE_REDEEM';
    const shareChange=await applyCapitalTerms(p.id,b.date,preview,id);
    await execute('INSERT INTO accountant_v2_investor_events(id,company_id,investor_id,event_date,kind,amount,journal_id,request_id,details) VALUES($2,$1,$3,$4::date,$5,$6,$7,$8,$9::jsonb)',id,p.id,b.date,kind,preview.amount,null,b.requestId,
        JSON.stringify({...b,request:canonical,capitalPreview:preview,shareChange}));
    let payment: any = null;
    if (preview.paidNow > 0) payment=await addInvestorEvent(p.id,{requestId:randomUUID(),date:b.date,kind:b.kind,amount:preview.paidNow,settleTradeId:id,counterAccountId:b.counterAccountId,reference:b.reference,note:b.note});
    await assertInvestorBalances(p.id);
    return {id,journalId:payment?.journalId || null,paymentId:payment?.id || null,paid:preview.paidNow,due:preview.dueAfter};
}
async function applyCapitalTerms(id: string, date: string, preview: any, eventId: string) {
    const terms = await allInvestorTerms();
    const sameDay = terms.find(t => t.investor_id === id && day(t.effective_date) === date);
    const termId = sameDay?.id || randomUUID();
    const afterTerms = { ...preview.afterTerms, date, shareEventId: eventId };
    if (sameDay) await execute('UPDATE accountant_v2_investor_terms SET effective_date=$4::date,terms=$5::jsonb WHERE company_id=$1 AND investor_id=$3 AND id=$2', termId, id, date, JSON.stringify(afterTerms));
    else await execute('INSERT INTO accountant_v2_investor_terms(id,company_id,investor_id,effective_date,terms) VALUES($2,$1,$3,$4::date,$5::jsonb)', termId, id, date, JSON.stringify(afterTerms));
    await validateOwnershipTotals();
    const change = { termId, beforeTerms: preview.beforeTerms, afterTerms };
    await logActivity({ ...context(), resource: 'investor', resourceId: id, action: 'capital-shares-changed', meta: { eventId, date, ...change } });
    return change;
}
async function validateOwnershipTotals(candidateTerms?: any[]) {
    const terms = candidateTerms || await allInvestorTerms();
    for (const date of [...new Set(terms.map((t) => day(t.effective_date)))]) {
        const current = new Map<string, any>();
        for (const t of terms)
            if (day(t.effective_date) <= date)
                current.set(t.investor_id, t.terms);
        const shareTerms = [...current.values()].filter(t => Number(t.totalShares) > 0);
        const denominators = new Set(shareTerms.map(t => Number(t.totalShares)));
        if (denominators.size > 1) throw badRequest('Active investor holdings must use the same fixed company share total');
        if (shareTerms.length && shareTerms.reduce((sum, t) => sum.plus(t.shares), new Prisma.Decimal(0)).gt(shareTerms[0].totalShares))
            throw badRequest(`Available company shares exceeded on ${date}`);
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
async function saveProfileOwnership(id: string, input: any, creating = false) {
    if (!creating && input.ownershipPercent === undefined && input.profitPercent === undefined) return;
    const settings = await companyShareSettings();
    const date = input.effectiveDate || new Date().toISOString().slice(0, 10);
    investorDate(date);
    const current = await termsAt(id, date);
    if (settings.includeShares) {
        if (input.ownershipPercent !== undefined || input.profitPercent !== undefined) throw badRequest('Buy or redeem shares to change ownership in share mode');
        if (creating) await writeOwnership(id,date,{trackingMode:'SHARES',shares:0,totalShares:settings.totalShares,ownershipPercent:0,profitPercent:0,shareClass:'Ordinary',note:'Investor created'});
        return;
    }
    if (!creating && input.ownershipPercent === undefined && input.profitPercent === undefined) return;
    const b = ownershipSchema.parse({...input,ownershipPercent:input.ownershipPercent ?? 0,profitPercent:input.profitPercent ?? 0,effectiveDate:date});
    if (current?.terms && Number(current.terms.shares) > 0) throw badRequest('Redeem existing shares before replacing them with percentages');
    if (current?.terms?.trackingMode === 'PERCENTAGE' && current.terms.ownershipPercent === b.ownershipPercent && current.terms.profitPercent === b.profitPercent) return;
    if (!['admin','manager'].includes(context().role) && (b.ownershipPercent || b.profitPercent || !creating)) throw badRequest('Only managers and admins can change investor percentages');
    const events = await investorEvents(id), all = await allInvestorTerms();
    if (events.some(e => e.kind === 'PROFIT_ALLOCATE' && e.details.periodTo >= date)) throw badRequest('Percentages cannot change a period already used by a profit allocation');
    if (all.some(t => t.investor_id === id && day(t.effective_date) > date)) throw badRequest('Correct later ownership changes before changing percentages on this date');
    await writeOwnership(id,date,{trackingMode:'PERCENTAGE',shares:0,totalShares:0,ownershipPercent:b.ownershipPercent,profitPercent:b.profitPercent,note:'Profile percentages'});
}
async function writeOwnership(id: string, date: string, terms: any) {
    const previous = await termsAt(id,date);
    const sameDay = previous && day(previous.effective_date) === date;
    const termId = sameDay ? previous.id : randomUUID();
    if (sameDay) await execute('UPDATE accountant_v2_investor_terms SET effective_date=$4::date,terms=$5::jsonb WHERE company_id=$1 AND investor_id=$3 AND id=$2',termId,id,date,JSON.stringify({...terms,date}));
    else await execute('INSERT INTO accountant_v2_investor_terms(id,company_id,investor_id,effective_date,terms) VALUES($2,$1,$3,$4::date,$5::jsonb)',termId,id,date,JSON.stringify({...terms,date}));
    await validateOwnershipTotals();
    await logActivity({...context(),resource:'investor',resourceId:id,action:'ownership-updated',meta:{date,before:previous?.terms || null,after:terms}});
}
const retiredAgreement = () => { throw badRequest('Agreements have been removed. Use profile percentages or buy/redeem shares'); };
investorRouter.post('/:id/terms', retiredAgreement);
investorRouter.put('/:id/terms/:termId', retiredAgreement);
investorRouter.delete('/:id/terms/:termId', retiredAgreement);
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
    if (!original || (!original.journal_id && !isShareTrade(original)) || original.kind === 'REVERSAL')
        throw badRequest('Choose a posted original entry');
    if (original.details.loanId)
        throw badRequest('Manage this loan repayment from Loans so its schedule and balances remain consistent');
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
    let reversedSharePreview: any = null;
    if (isShareTrade(original) || (['CAPITAL_IN', 'CAPITAL_OUT'].includes(original.kind) && !original.details.settleTradeId)) {
        if (isShareTrade(original) && shareDues(events).find(t=>t.id===original.id)?.paid) throw badRequest('Reverse this trade capital payments before cancelling its shares');
        const laterShares = liveShareChanges(events).filter(e => e.id !== original.id && events.indexOf(e) > events.indexOf(original));
        if (laterShares.length) throw badRequest('Correct dependent share movements before reversing this capital');
        if (original.details.shareChange) {
            if (!['admin', 'manager'].includes(context().role)) throw badRequest('Only managers and admins can reverse share changes');
            const change = original.details.shareChange;
            const current = await termsAt(p.id, b.date);
            const ownTerms = (await allInvestorTerms()).filter(t => t.investor_id === p.id);
            if (shareEconomics(current?.terms) !== shareEconomics(change.afterTerms) || ownTerms.some(t => day(t.effective_date) > b.date) || events.slice(events.indexOf(original) + 1).some(e => ['CAPITAL_IN', 'CAPITAL_OUT','SHARE_BUY','SHARE_REDEEM'].includes(e.kind) && !e.details?.settleTradeId && !events.some(r => r.reversed_id === e.id)))
                throw badRequest('Correct later capital movements or ownership changes before reversing this share change');
            if (events.some(e => e.kind === 'PROFIT_ALLOCATE' && e.details.periodTo >= day(original.event_date)))
                throw badRequest('Share change is protected by posted profit allocations');
            reversedSharePreview = { beforeTerms: current.terms, afterTerms: change.beforeTerms };
        }
    }
    if (isShareTrade(original)) {
        const eventId=randomUUID();
        const shareChange=await applyCapitalTerms(p.id,b.date,reversedSharePreview,eventId);
        await execute(`INSERT INTO accountant_v2_investor_events(id,company_id,investor_id,event_date,kind,amount,journal_id,request_id,reversed_id,details) VALUES($2,$1,$3,$4::date,'REVERSAL',$5,$6,$7,$8,$9::jsonb)`,eventId,p.id,b.date,Number(original.amount),null,eventId,original.id,JSON.stringify({originalKind:original.kind,note:b.reason,shareChange}));
        await assertInvestorBalances(p.id);res.json({id:eventId});return;
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
    const shareChange = reversedSharePreview ? await applyCapitalTerms(p.id, b.date, reversedSharePreview, eventId) : null;
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
        JSON.stringify({ originalKind: original.kind, note: b.reason, ...(original.details.settleTradeId ? {settleTradeId:original.details.settleTradeId} : {}), ...(shareChange ? { shareChange } : {}) })
    );
    await assertInvestorBalances(p.id);
    res.json({ id: eventId });
});
