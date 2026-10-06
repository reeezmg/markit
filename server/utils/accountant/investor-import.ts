import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { accountantPrisma as db, context, logActivity } from './context';
import {
    createInvestor,
    investorDate,
    writeInvestorJournal,
} from './investors';
import { cents, assertAccountingDateUnlocked } from './posting';
import { badRequest } from './router';

export type InvestorImportMapping = {
    counterAccountId: string;
    existingJournalId?: string;
};
export async function planInvestorImport(through: string) {
    investorDate(through);
    const sources = await db.$queryRawUnsafe(
        `SELECT i.id,i."userId",COALESCE(cu.name,cu.user_id) AS name,
        i.direction::text,i.amount,i.payment_mode::text,i.status::text,i.note,i.created_at,
        e.id AS imported_event_id FROM investments i
        LEFT JOIN company_users cu ON cu.company_id=i.company_id AND cu.user_id=i."userId"
        LEFT JOIN accountant_v2_investor_events e ON e.company_id=i.company_id AND e.legacy_id=i.id
        WHERE i.company_id=$1 AND i.created_at<($2::date+interval '1 day') ORDER BY i.created_at,i.id`,
        context().companyId,
        through
    );
    return {
        sources,
        accounts: await db.accountingAccount.findMany({
            where: {
                isActive: true,
                category: { in: ['ASSET', 'LIABILITY', 'EQUITY'] },
            },
            select: { id: true, name: true, category: true, accountType: true },
        }),
        mappings: Object.fromEntries(
            sources
                .filter(
                    (s: any) => s.status === 'COMPLETED' && !s.imported_event_id
                )
                .map((s: any) => [s.id, { counterAccountId: '' }])
        ),
    };
}
/** Runs inside runAccountant; callers roll back the entire transaction for preview. */
export async function importInvestors(
    through: string,
    mappings: Record<string, InvestorImportMapping>,
    timeZone = 'UTC'
) {
    investorDate(through);
    const localDate = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    mappings = z
        .record(
            z
                .object({
                    counterAccountId: z.string().min(1),
                    existingJournalId: z.string().min(1).optional(),
                })
                .strict()
        )
        .parse(mappings);
    const c = context().companyId;
    // Also locks out legacy writers while the immutable snapshot is taken.
    await db.$executeRawUnsafe(
        'LOCK TABLE investments IN SHARE ROW EXCLUSIVE MODE'
    );
    const sources = await db.$queryRawUnsafe(
        `SELECT i.*,COALESCE(cu.name,cu.user_id) AS investor_name FROM investments i
   LEFT JOIN company_users cu ON cu.company_id=i.company_id AND cu.user_id=i."userId"
   WHERE i.company_id=$1 AND i.created_at<($2::date+interval '1 day') ORDER BY i.created_at,i.id`,
        c,
        through
    );
    const imported = await db.$queryRawUnsafe(
        'SELECT * FROM accountant_v2_investor_events WHERE company_id=$1 AND legacy_id IS NOT NULL',
        c
    );
    const report: any = {
        created: 0,
        reused: 0,
        pending: 0,
        contributed: 0,
        returned: 0,
        rows: [],
    };
    for (const old of imported) {
        if (
            new Date(old.event_date).toISOString().slice(0, 10) <= through &&
            !sources.some((s: any) => s.id === old.legacy_id)
        )
            throw badRequest(
                `Previously imported source missing: ${old.legacy_id}`
            );
    }
    for (const row of sources) {
        const { investor_name, ...source } = row;
        const fingerprint = JSON.stringify(source),
            previous = imported.find((e: any) => e.legacy_id === row.id);
        if (previous) {
            if ((previous.details.timeZone || 'UTC') !== timeZone)
                throw badRequest(`Import timezone changed: ${row.id}`);
            if (previous.details.fingerprint !== fingerprint)
                throw badRequest(`Imported investment changed: ${row.id}`);
            if (
                mappings[row.id] &&
                JSON.stringify(previous.details.mapping) !==
                    JSON.stringify(mappings[row.id])
            )
                throw badRequest(`Import mapping changed: ${row.id}`);
            report.reused++;
            continue;
        }
        if (!investor_name)
            throw badRequest(
                `Investment ${row.id} has no company-linked investor`
            );
        if (
            !['COMPLETED', 'PENDING'].includes(row.status) ||
            !['IN', 'OUT'].includes(row.direction) ||
            cents(row.amount) <= 0
        )
            throw badRequest(`Invalid old investment ${row.id}`);
        let [p] = await db.$queryRawUnsafe(
            'SELECT * FROM accountant_v2_investors WHERE company_id=$1 AND legacy_user_id=$2',
            c,
            row.userId
        );
        if (!p) p = await createInvestor({ name: investor_name }, row.userId);
        const id = randomUUID(),
            date = investorDate(localDate.format(new Date(row.created_at))),
            amount = Number(row.amount),
            incoming = row.direction === 'IN',
            kind = incoming ? 'CAPITAL_IN' : 'CAPITAL_OUT';
        let journal: any = null;
        const mapping = mappings[row.id];
        if (row.status === 'COMPLETED') {
            if (!mapping?.counterAccountId)
                throw badRequest(
                    `Completed investment ${row.id} requires an explicit counterpart mapping`
                );
            const counter = await db.accountingAccount.findFirst({
                where: { id: mapping.counterAccountId, isActive: true },
            });
            if (!counter || Object.values(p.accounts).includes(counter.id))
                throw badRequest(`Invalid counterpart for ${row.id}`);
            if (!['EQUITY', 'LIABILITY', 'ASSET'].includes(counter.category))
                throw badRequest(
                    'Historical capital counterparts must be asset, liability or equity accounts'
                );
            const existing = await db.manualJournal.findMany({
                where: { sourceId: row.id },
                include: { lines: true, reversals: true },
            });
            if (existing.length && !mapping.existingJournalId)
                throw badRequest(
                    `Investment ${row.id} already has journals; supply its existingJournalId and equity counterpart for reclassification`
                );
            if (mapping.existingJournalId) {
                const j = await db.manualJournal.findFirst({
                    where: { id: mapping.existingJournalId },
                    include: { lines: true, reversals: true },
                });
                if (
                    !j ||
                    j.sourceId !== row.id ||
                    j.status !== 'PUBLISHED' ||
                    j.reversals.length ||
                    counter.category !== 'EQUITY' ||
                    Number(j.exchangeRate) !== 1 ||
                    j.currency !== (await db.company.findUnique()).currency ||
                    new Date(j.journalDate).toISOString().slice(0, 10) !==
                        date.toISOString().slice(0, 10) ||
                    !j.lines.some(
                        (l: any) =>
                            l.accountId === counter.id &&
                            l.side === (incoming ? 'CREDIT' : 'DEBIT') &&
                            cents(l.amount) === cents(amount)
                    )
                )
                    throw badRequest(
                        `Existing journal does not verify source/date/capital amount for ${row.id}`
                    );
                if (existing.some((other: any) => other.id !== j.id))
                    throw badRequest(
                        `Multiple existing source journals for ${row.id}; reconcile before import`
                    );
            }
            if (['CASH', 'BANK'].includes(counter.accountType))
                await assertAccountingDateUnlocked(c, date, 'BANKING');
            journal = await writeInvestorJournal(
                p,
                id,
                date,
                amount,
                [
                    {
                        accountId: counter.id,
                        side: incoming ? 'DEBIT' : 'CREDIT',
                        amount,
                    },
                    {
                        accountId: p.accounts.capital,
                        side: incoming ? 'CREDIT' : 'DEBIT',
                        amount,
                    },
                ],
                row.note || 'Imported investment',
                row.id,
                'LEGACY_INVESTOR'
            );
            report[incoming ? 'contributed' : 'returned'] += cents(amount);
        } else report.pending++;
        await db.$executeRawUnsafe(
            `INSERT INTO accountant_v2_investor_events(id,company_id,investor_id,event_date,kind,amount,journal_id,legacy_id,request_id,details)
     VALUES($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10::jsonb)`,
            id,
            c,
            p.id,
            date,
            kind,
            amount,
            journal?.id || null,
            row.id,
            `legacy:${row.id}`,
            JSON.stringify({
                fingerprint,
                timeZone,
                source,
                mapping: mapping || null,
                note: row.note,
                paymentMode: row.payment_mode,
                legacyStatus: row.status,
            })
        );
        await logActivity({
            ...context(),
            action: 'imported',
            resource: 'investor-history',
            resourceId: row.id,
            meta: { eventId: id, journalId: journal?.id || null },
        });
        report.created++;
        report.rows.push({
            sourceId: row.id,
            investorId: p.id,
            journalId: journal?.id || null,
            status: row.status,
        });
    }
    report.contributed /= 100;
    report.returned /= 100;
    return report;
}
