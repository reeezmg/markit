import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { accountantPrisma as db, context, logActivity } from './context';
import { Router, requireAuth, rbac, badRequest } from './router';
import { investorDate, investorEvents, addInvestorEvent } from './investors';
import { cents, assertAccountingDateUnlocked } from './posting';
import { validateProfitDistributionAccount as fundingAccount } from './investment-account-settings';

export const investorProfitRouter = Router();
investorProfitRouter.use(requireAuth, rbac('ACCOUNT', 'READ'));
const query = (sql: string, ...args: any[]): Promise<any[]> =>
    db.$queryRawUnsafe(sql, context().companyId, ...args);
const day = (v: any) => new Date(v).toISOString().slice(0, 10);
const digest = (value: any) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
const periodSchema = z.object({ periodFrom: z.string(), periodTo: z.string() });
const previewSchema = periodSchema.extend({
    distributable: z.coerce.number().positive(),
});
function period(input: unknown) {
    const p = periodSchema.parse(input);
    investorDate(p.periodFrom);
    investorDate(p.periodTo);
    if (p.periodFrom > p.periodTo)
        throw badRequest('Period start must be on or before its end');
    return p;
}
function manager() {
    if (!['admin', 'manager'].includes(context().role))
        throw badRequest(
            'A manager or admin must approve distributions or change settings'
        );
}

export async function investmentSettings() {
    const saved = await db.auditLog.findFirst({
        where: { resource: 'investor-profit-settings', action: 'configured' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    let id = saved?.after?.accountId;
    if (!id) {
        let account = await db.accountingAccount.findFirst({
            where: { code: 'INV-DISTRIBUTION' },
        });
        if (!account)
            account = await db.accountingAccount.create({
                data: {
                    name: 'Investor profit distributions',
                    code: 'INV-DISTRIBUTION',
                    category: 'EQUITY',
                    accountType: 'EQUITY',
                    currency: (await db.company.findUnique()).currency,
                    isSystem: true,
                },
            });
        id = account.id;
    }
    return fundingAccount(id);
}
export async function investmentProfit(input: unknown) {
    const p = period(input);
    const lines = await query(
        `SELECT a.category::text AS category,
 COALESCE(SUM(ROUND(l.amount*j.exchange_rate,2)*CASE WHEN l.side='CREDIT' THEN 1 ELSE -1 END),0)::text AS net
 FROM accountant_v2_manual_journal_lines l
 JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
 WHERE l.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL
 AND a.category IN ('INCOME','EXPENSE') AND j.journal_date>=$2::date AND j.journal_date<($3::date+interval '1 day')
 GROUP BY a.category`,
        p.periodFrom,
        p.periodTo
    );
    const income = cents(lines.find((l) => l.category === 'INCOME')?.net || 0),
        expense = -cents(lines.find((l) => l.category === 'EXPENSE')?.net || 0);
    return {
        ...p,
        income: income / 100,
        expenses: expense / 100,
        profit: (income - expense) / 100,
        currency: (await db.company.findUnique()).currency,
    };
}
export async function previewInvestmentDistribution(input: unknown) {
    const b = previewSchema.parse(input),
        profit = await investmentProfit(b),
        pool = cents(b.distributable);
    if (pool > cents(profit.profit))
        throw badRequest(
            'The amount to share exceeds the posted profit for this period'
        );
    const account = await investmentSettings();
    const profiles = await query(
        'SELECT id,name,profile FROM accountant_v2_investors WHERE company_id=$1 ORDER BY id'
    );
    const terms = await query(
        'SELECT * FROM accountant_v2_investor_terms WHERE company_id=$1 AND effective_date<=$2::date ORDER BY effective_date,id',
        b.periodTo
    );
    const events = await investorEvents();
    const live = events.filter(
        (e) =>
            e.kind === 'PROFIT_ALLOCATE' &&
            e.details.periodFrom <= b.periodTo &&
            e.details.periodTo >= b.periodFrom &&
            !events.some((r) => r.reversed_id === e.id)
    );
    if (live.length)
        throw badRequest(
            'Profit has already been allocated for part of this period. Review allocation history or choose a different period.'
        );
    const rows: any[] = [],
        issues: string[] = [];
    for (const p of profiles) {
        if (p.profile.status !== 'ACTIVE') continue;
        const history = terms.filter((t) => t.investor_id === p.id),
            term = history.at(-1);
        if (!term) {
            issues.push(
                `${p.name}: add a profit-sharing agreement in Ownership first.`
            );
            continue;
        }
        if (history.some((t) => day(t.effective_date) > b.periodFrom)) {
            issues.push(
                `${p.name}: the agreement changes during this period. Split the period at the agreement date, or correct an incorrect agreement in Ownership.`
            );
            continue;
        }
        const share = Number(term.terms.profitPercent);
        if (!Number.isFinite(share) || share < 0 || share > 100)
            throw badRequest('Invalid saved profit-sharing agreement');
        // Round down to the nearest cent. Unassigned shares and rounding remain in the business.
        const amountCents = new Prisma.Decimal(pool)
            .mul(share)
            .div(100)
            .floor()
            .toNumber();
        rows.push({
            investorId: p.id,
            name: p.name,
            profitPercent: share,
            termId: term.id,
            amount: amountCents / 100,
        });
    }
    const shareTotal = rows.reduce((s, r) => s + r.profitPercent, 0),
        total = rows.reduce((s, r) => s + cents(r.amount), 0);
    if (shareTotal > 100.000001 || total > pool)
        throw badRequest('Combined profit shares exceed 100%');
    if (!rows.length && !issues.length)
        issues.push('Add investors and their ownership agreements first.');
    if (!total && !issues.length)
        issues.push('No investor has a payable share of this amount.');
    const snapshot = {
        ...profit,
        distributable: pool / 100,
        accountId: account.id,
        rows,
        issues,
        total: total / 100,
        unassigned: (pool - total) / 100,
        retained: (cents(profit.profit) - total) / 100,
    };
    return { ...snapshot, previewHash: digest(snapshot) };
}
export async function approveInvestmentDistribution(input: unknown) {
    manager();
    const b = previewSchema
        .extend({
            requestId: z.string().uuid(),
            previewHash: z.string().length(64),
            date: z.string(),
            note: z.string().max(2000).default(''),
        })
        .parse(input);
    const canonical = JSON.stringify(b);
    const prior = await db.auditLog.findFirst({
        where: {
            resource: 'investor-profit-batch',
            resourceId: b.requestId,
            action: 'approved',
        },
    });
    if (prior) {
        if (prior.after.request !== canonical)
            throw badRequest(
                'This request was already used with different details'
            );
        return prior.after.result;
    }
    const date = investorDate(b.date);
    if (b.date < b.periodTo)
        throw badRequest('Allocation date must be on or after the period end');
    await assertAccountingDateUnlocked(context().companyId, date);
    const preview = await previewInvestmentDistribution(b);
    if (preview.previewHash !== b.previewHash)
        throw badRequest(
            'Profit, agreements or settings changed. Refresh the preview before approving.'
        );
    if (preview.issues.length) throw badRequest(preview.issues.join(' '));
    const entries: Awaited<ReturnType<typeof addInvestorEvent>>[] = [];
    for (const row of preview.rows.filter((r) => r.amount > 0)) {
        entries.push(
            await addInvestorEvent(
                row.investorId,
                {
                    requestId: randomUUID(),
                    kind: 'PROFIT_ALLOCATE',
                    date: b.date,
                    counterAccountId: preview.accountId,
                    periodFrom: b.periodFrom,
                    periodTo: b.periodTo,
                    companyProfit: preview.profit,
                    distributable: b.distributable,
                    note: b.note,
                    reference: `Distribution ${b.periodFrom} to ${b.periodTo}`,
                },
                { batchId: b.requestId, amount: row.amount }
            )
        );
    }
    const result = {
        id: b.requestId,
        ...preview,
        date: b.date,
        note: b.note,
        entries,
    };
    await logActivity({
        ...context(),
        resource: 'investor-profit-batch',
        resourceId: b.requestId,
        action: 'approved',
        meta: { request: canonical, result },
    });
    return result;
}
investorProfitRouter.get('/profit', async (req, res) =>
    res.json(await investmentProfit(req.query))
);
investorProfitRouter.post('/preview', async (req, res) =>
    res.json(await previewInvestmentDistribution(req.body))
);
investorProfitRouter.post('/approve', async (req, res) =>
    res.status(201).json(await approveInvestmentDistribution(req.body))
);
investorProfitRouter.get('/history', async (_req, res) => {
    const events = await investorEvents();
    const batches = await db.auditLog.findMany({
        where: { resource: 'investor-profit-batch', action: 'approved' },
        orderBy: { createdAt: 'desc' },
    });
    res.json(
        batches.map((b: any) => {
            const batchEvents = events.filter(
                (e) => e.details.batchId === b.resourceId
            );
            return {
                ...b.after.result,
                reversed: batchEvents.filter((e) =>
                    events.some((r) => r.reversed_id === e.id)
                ).length,
            };
        })
    );
});
investorProfitRouter.get('/settings', async (_req, res) => {
    const current = await investmentSettings();
    const owned = await query(
        'SELECT accounts FROM accountant_v2_investors WHERE company_id=$1'
    );
    const ids = owned.flatMap((p) => Object.values(p.accounts));
    const accounts = await db.accountingAccount.findMany({
        where: { category: 'EQUITY', isActive: true, id: { notIn: ids } },
        orderBy: { name: 'asc' },
    });
    res.json({ accountId: current.id, accounts });
});
investorProfitRouter.put('/settings', async (req, res) => {
    manager();
    const { accountId } = z
        .object({ accountId: z.string().min(1) })
        .parse(req.body);
    await fundingAccount(accountId);
    await logActivity({
        ...context(),
        resource: 'investor-profit-settings',
        resourceId: context().companyId,
        action: 'configured',
        meta: { accountId },
    });
    res.json({ accountId });
});
