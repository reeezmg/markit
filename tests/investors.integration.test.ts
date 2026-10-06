import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const url = new URL(process.env.DATABASE_URL!),
    schema = `investor_test_${randomUUID().replaceAll('-', '')}`;
const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 15000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
    }),
    client = await pool.connect();
let database: any;
async function sql(s: string) {
    await client.query('BEGIN');
    try {
        await client.query(`SET LOCAL search_path TO "${schema}"`);
        const r = await client.query(s);
        await client.query('COMMIT');
        return r;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    }
}
try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await sql(`CREATE TABLE companies(id text PRIMARY KEY,currency text DEFAULT 'INR');INSERT INTO companies(id) VALUES('a'),('b');
 CREATE TABLE users(id text PRIMARY KEY,email text UNIQUE,password text,cleanup boolean DEFAULT false);
 CREATE TABLE company_users(company_id text,user_id text,name text,phone text,role text DEFAULT 'user',status boolean DEFAULT true,deleted boolean DEFAULT false,code integer,PRIMARY KEY(company_id,user_id));
 CREATE TABLE investments(id text PRIMARY KEY,company_id text,"userId" text,direction text,amount numeric(12,2),payment_mode text,status text,note text,created_at timestamp,updated_at timestamp);
 INSERT INTO users VALUES('old-user','legacy@example.test','unused',false);
 INSERT INTO company_users(company_id,user_id,name) VALUES('a','old-user','Legacy investor');
 INSERT INTO investments VALUES('old-in','a','old-user','IN',400,'CASH','COMPLETED','Original note','2026-01-01','2026-01-01'),('old-out','a','old-user','OUT',50,'BANK','COMPLETED',null,'2026-02-01','2026-02-01'),('old-pending','a','old-user','IN',20,'CASH','PENDING',null,'2026-03-01','2026-03-01');`);
    await sql(
        readFileSync(
            new URL(
                '../prisma/migrations/20260926120000_accountant_v2/migration.sql',
                import.meta.url
            ),
            'utf8'
        )
    );
    await sql(
        'ALTER TABLE accountant_v2_manual_journal_lines ADD COLUMN distributor_id text, ADD COLUMN source_parties jsonb'
    );
    await sql(
        readFileSync(
            new URL(
                '../prisma/migrations/20260930120000_investors/migration.sql',
                import.meta.url
            ),
            'utf8'
        )
    );
    url.searchParams.set('schema', schema);
    url.searchParams.set('statement_cache_size', '0');
    url.searchParams.set('pgbouncer', 'true');
    process.env.DATABASE_URL = url.toString();
    database = (await import('../server/prisma')).prisma;
    const { runAccountant } = await import(
        '../server/utils/accountant/context'
    );
    const { investorRouter } = await import(
        '../server/utils/accountant/investors'
    );
    const { importInvestors, planInvestorImport } = await import(
        '../server/utils/accountant/investor-import'
    );
    const call = (
        method: string,
        path: string,
        body: any = {},
        companyId = 'a',
        role = 'manager',
        query: any = {}
    ) =>
        runAccountant({ companyId, userId: 'tester', role }, async () => {
            if (method === 'POST' && path === '/' && body.capitalAccountId === undefined) {
                const options: any[] = [];
                for (const [key, category, accountType] of [
                    ['capital', 'EQUITY', 'EQUITY'],
                    ['profit', 'LIABILITY', 'OTHER_CURRENT_LIABILITY'],
                    ['loan', 'LIABILITY', 'OTHER_LIABILITY'],
                ]) options.push(await database.accountantAccountingAccount.create({ data: {
                    companyId, name: `Existing ${key} ${randomUUID()}`, category, accountType, currency: 'INR',
                } }));
                body = { ...body,
                    capitalAccountId: options.find((a: any) => a.accountType === 'EQUITY')?.id,
                    profitAccountId: options.find((a: any) => a.accountType === 'OTHER_CURRENT_LIABILITY')?.id,
                    loanAccountId: options.find((a: any) => a.accountType === 'OTHER_LIABILITY')?.id,
                };
            }
            if (
                method === 'POST' &&
                path === '/' &&
                !body.userId &&
                !body.newUser
            )
                body = {
                    ...body,
                    newUser: {
                        name: body.name,
                        email: `${randomUUID()}@example.test`,
                    },
                };
            let result: any;
            const res = {
                json(v: any) {
                    result = v;
                    return res;
                },
                status() {
                    return res;
                },
            };
            await investorRouter.dispatch(
                method,
                path,
                {
                    user: { companyId, userId: 'tester', role },
                    body,
                    query,
                    params: {},
                },
                res
            );
            return result;
        });
    const accounts = await call('GET', '/options'),
        account = (type: string) =>
            accounts.find((a: any) => a.accountType === type).id;
    const plan = await runAccountant(
        { companyId: 'a', userId: 'tester', role: 'admin' },
        () => planInvestorImport('2026-03-31')
    );
    assert.equal(plan.sources.length, 3);
    assert.equal(Object.keys(plan.mappings).length, 2);
    assert.equal(
        (await sql('SELECT * FROM accountant_v2_investors')).rowCount,
        0,
        'Plan is read-only'
    );
    const existingCapital = await database.accountantAccountingAccount.create({ data: { companyId: 'a', name: 'Existing fresh equity', category: 'EQUITY', accountType: 'EQUITY', currency: 'INR' } });
    const beforeFresh = (await sql('SELECT * FROM accountant_v2_accounting_accounts')).rowCount;
    const fresh = await call('POST', '/', {
        name: 'Fresh investor',
        newUser: { name: 'Fresh investor', email: 'fresh@example.test' },
        capitalAccountId: existingCapital.id,
    });
    assert.equal(fresh.accounts.capital, existingCapital.id);
    assert.equal(Object.keys(fresh.accounts).length, 1);
    assert.equal((await sql('SELECT * FROM accountant_v2_accounting_accounts')).rowCount, beforeFresh, 'Profile creation reuses existing equity without creating chart accounts');
    await assert.rejects(call('POST', '/', { name: 'Invalid cash capital', capitalAccountId: account('CASH') }));
    if (process.env.INVESTOR_LINK_ONLY === '1') {
        await assert.rejects(call('POST', '/', { name: 'Missing equity', capitalAccountId: '' }));
        await assert.rejects(call('POST', '/', { name: 'Other company equity', capitalAccountId: existingCapital.id }, 'b'));
        const receipt = await call('POST', `/${fresh.id}/events`, {
            requestId: randomUUID(), date: '2026-04-02', kind: 'CAPITAL_IN',
            amount: 125, counterAccountId: account('CASH'),
        });
        const posted = (await sql(`SELECT account_id,side,amount::text FROM accountant_v2_manual_journal_lines WHERE journal_id='${receipt.journalId}'`)).rows;
        assert.equal(posted.find(l => l.account_id === existingCapital.id)?.side, 'CREDIT');
        assert.equal(posted.find(l => l.account_id === account('CASH'))?.side, 'DEBIT');
        assert.ok(posted.every(l => Number(l.amount) === 125));
        await assert.rejects(call('POST', `/${fresh.id}/events`, {
            requestId: randomUUID(), date: '2026-04-02', kind: 'LOAN_IN',
            amount: 50, counterAccountId: account('CASH'),
        }), /no loan account linked/);
        assert.equal((await sql('SELECT * FROM accountant_v2_accounting_accounts')).rowCount, beforeFresh);
        console.log('Investor linking passed: existing equity reused, no chart accounts created, cash receipt balanced, missing/invalid/cross-company equity and unmapped loan rejected.');
    } else {
    assert.ok(fresh.legacy_user_id);
    assert.equal(
        (await call('GET', '/users')).find(
            (u: any) => u.id === fresh.legacy_user_id
        ).role,
        'investor'
    );
    await call('PUT', `/${fresh.id}`, {
        name: 'Fresh investor',
        status: 'EXITED',
    });
    await assert.rejects(
        call('POST', '/', { name: 'Duplicate', userId: fresh.legacy_user_id })
    );
    await assert.rejects(
        call(
            'POST',
            '/',
            { name: 'Cross company', userId: fresh.legacy_user_id },
            'b'
        )
    );
    await sql(
        "INSERT INTO users VALUES('manager-user','manager@example.test','unchanged',false); INSERT INTO company_users(company_id,user_id,name,role) VALUES('a','manager-user','Existing manager','manager')"
    );
    const managerProfile = await call('POST', '/', {
        name: 'Existing manager',
        userId: 'manager-user',
    });
    assert.equal(
        (await call('GET', '/users')).find((u: any) => u.id === 'manager-user')
            .role,
        'manager'
    );
    await call('PUT', `/${managerProfile.id}`, {
        name: 'Existing manager',
        status: 'EXITED',
    });
    const p = await call('POST', '/', { name: 'Investor One' });
    assert.ok(p.accounts.capital && p.accounts.profit && p.accounts.loan);
    await assert.rejects(call('GET', `/${p.id}`, {}, 'b'));
    await assert.rejects(call('GET', '/', {}, 'a', 'user'));
    await assert.rejects(
        call('POST', '/', {
            name: 'Bad document',
            documents: [{ name: 'Unsafe', url: 'javascript:alert(1)' }],
        })
    );
    const term = {
        date: '2026-01-01',
        ownershipPercent: 20,
        profitPercent: 15,
        shares: 20,
        totalShares: 100,
        note: 'Agreed terms',
    };
    await assert.rejects(call('POST', `/${p.id}/terms`, term));
    await call('PUT', '/share-settings', { totalShares: 100 });
    await call('POST', `/${p.id}/terms`, term);
    await assert.rejects(
        call('POST', `/${p.id}/terms`, {
            ...term,
            date: '2026-01-02',
            ownershipPercent: 30,
        })
    );
    await assert.rejects(
        call(
            'POST',
            `/${p.id}/terms`,
            { ...term, date: '2026-01-02' },
            'a',
            'accountant'
        )
    );
    const second = await call('POST', '/', { name: 'Investor Two' });
    await assert.rejects(
        call('POST', `/${second.id}/terms`, {
            ...term,
            ownershipPercent: 90,
            shares: 90,
        })
    );
    assert.equal(
        (await call('GET', `/${second.id}`)).terms.length,
        0,
        'Invalid aggregate ownership rolls back'
    );
    const post = (
        kind: string,
        amount: number,
        date = '2026-04-02',
        extra: any = {}
    ) => ({
        requestId: randomUUID(),
        kind,
        amount,
        date,
        counterAccountId: account('BANK'),
        ...extra,
    });
    const contribution = post('CAPITAL_IN', 500);
    const added = await call('POST', `/${p.id}/events`, contribution);
    assert.equal(
        (await call('POST', `/${p.id}/events`, contribution)).id,
        added.id
    );
    await assert.rejects(
        call('POST', `/${p.id}/events`, { ...contribution, amount: 501 })
    );
    await assert.rejects(
        call('POST', `/${p.id}/events`, post('CAPITAL_IN', 1.001))
    );
    await assert.rejects(
        call('POST', `/${p.id}/events`, post('CAPITAL_IN', 1, '2026-02-30'))
    );
    const foreign = await call('GET', '/options', {}, 'b');
    await assert.rejects(
        call(
            'POST',
            `/${p.id}/events`,
            post('CAPITAL_IN', 1, '2026-04-02', {
                counterAccountId: foreign[0].id,
            })
        )
    );
    await call('POST', `/${p.id}/events`, post('CAPITAL_OUT', 50));
    const allocation = post('PROFIT_ALLOCATE', 99, '2026-04-02', {
        counterAccountId: account('EQUITY'),
        periodFrom: '2026-01-01',
        periodTo: '2026-03-31',
        companyProfit: 2000,
        distributable: 1000,
    });
    await assert.rejects(
        call('POST', `/${p.id}/events`, allocation, 'a', 'accountant')
    );
    const profit = await call('POST', `/${p.id}/events`, allocation);
    let detail = await call('GET', `/${p.id}`);
    assert.equal(
        Number(detail.events.find((e: any) => e.id === profit.id).amount),
        150,
        'Allocation uses saved 15% agreement, not request amount'
    );
    await assert.rejects(
        call('POST', `/${p.id}/events`, {
            ...allocation,
            requestId: randomUUID(),
        })
    );
    await assert.rejects(
        call('POST', `/${p.id}/terms`, { ...term, date: '2026-02-01' })
    );
    await assert.rejects(
        call('POST', `/${p.id}/events`, post('PROFIT_PAY', 151))
    );
    const payout = await call(
        'POST',
        `/${p.id}/events`,
        post('PROFIT_PAY', 100)
    );
    let listed = (
        await call('GET', '/', {}, 'a', 'manager', { asOf: '2026-04-02' })
    ).data.find((r: any) => r.id === p.id);
    assert.equal(listed.capital, 450);
    assert.equal(listed.payable, 50);
    assert.equal(listed.paid, 100);
    assert.equal(
        (
            await call('GET', '/', {}, 'a', 'manager', { asOf: '2026-01-01' })
        ).data.find((r: any) => r.id === p.id).capital,
        0
    );
    await assert.rejects(
        call('POST', `/${p.id}/reverse/${profit.id}`, {
            date: '2026-04-03',
            reason: 'Cannot undo paid entitlement',
        })
    );
    await call('POST', `/${p.id}/reverse/${payout.id}`, {
        date: '2026-04-03',
        reason: 'Wrong payout',
    });
    await call('POST', `/${p.id}/reverse/${profit.id}`, {
        date: '2026-04-03',
        reason: 'Wrong distribution',
    });
    listed = (
        await call('GET', '/', {}, 'a', 'manager', { asOf: '2026-04-03' })
    ).data.find((r: any) => r.id === p.id);
    assert.equal(listed.payable, 0);
    assert.equal(listed.paid, 0);
    await assert.rejects(call('POST', `/${p.id}/events`, post('LOAN_OUT', 10)));
    await call('POST', `/${p.id}/events`, post('LOAN_IN', 100));
    await call('POST', `/${p.id}/events`, post('LOAN_OUT', 40));
    const importCall = (m: any) =>
        runAccountant({ companyId: 'a', userId: 'tester', role: 'admin' }, () =>
            importInvestors('2026-03-31', m)
        );
    await assert.rejects(
        importCall({}),
        'Import never guesses historical counterpart'
    );
    assert.equal(
        (
            await sql(
                "SELECT * FROM accountant_v2_investors WHERE legacy_user_id='old-user'"
            )
        ).rowCount,
        0,
        'Failed import rolls back profiles and accounts'
    );
    const mappings = {
        'old-in': { counterAccountId: account('EQUITY') },
        'old-out': { counterAccountId: account('EQUITY') },
    };
    const previewRollback = Error('rollback');
    await assert.rejects(
        runAccountant(
            { companyId: 'a', userId: 'tester', role: 'admin' },
            async () => {
                const r = await importInvestors('2026-03-31', mappings);
                assert.equal(r.created, 3);
                throw previewRollback;
            }
        )
    );
    assert.equal(
        (
            await sql(
                'SELECT * FROM accountant_v2_investor_events WHERE legacy_id IS NOT NULL'
            )
        ).rowCount,
        0,
        'Preview rolls back'
    );
    const imported = await importCall(mappings);
    assert.equal(imported.created, 3);
    assert.equal(imported.pending, 1);
    assert.equal(
        (await importCall(mappings)).created,
        0,
        'Repeat import creates no journals'
    );
    const legacy = (await call('GET', '/')).data.find(
        (r: any) => r.legacy_user_id === 'old-user'
    );
    assert.equal(legacy.capital, 350);
    assert.equal(legacy.terms, null);
    await assert.rejects(
        sql("UPDATE investments SET amount=500 WHERE id='old-in'"),
        'Imported source updates blocked'
    );
    await assert.rejects(
        sql("DELETE FROM investments WHERE id='old-in'"),
        'Imported source deletes blocked'
    );
    await sql(
        "INSERT INTO investments VALUES('unimported','a','old-user','IN',5,'CASH','PENDING',null,'2026-05-01','2026-05-01');UPDATE investments SET amount=6 WHERE id='unimported'"
    );
    assert.equal(
        Number(
            (await sql("SELECT amount FROM investments WHERE id='unimported'"))
                .rows[0].amount
        ),
        6,
        'Guard allows unrelated old rows to update'
    );
    await assert.rejects(
        importCall({
            ...mappings,
            'old-in': { counterAccountId: account('BANK') },
        })
    );
    await sql(
        "INSERT INTO investments VALUES('old-reclass','a','old-user','IN',25,'BANK','COMPLETED',null,'2026-03-02','2026-03-02')"
    );
    const existing = await database.accountantManualJournal.create({
        data: {
            companyId: 'a',
            entryNumber: 'HISTORIC-CAPITAL',
            notes: 'Previously recorded capital',
            journalDate: new Date('2026-03-02'),
            currency: 'INR',
            total: 25,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            isSystemGenerated: true,
            sourceType: 'OLD_CAPITAL',
            sourceId: 'old-reclass',
            lines: {
                create: [
                    {
                        companyId: 'a',
                        accountId: account('BANK'),
                        side: 'DEBIT',
                        amount: 25,
                    },
                    {
                        companyId: 'a',
                        accountId: account('EQUITY'),
                        side: 'CREDIT',
                        amount: 25,
                    },
                ],
            },
        },
    });
    await assert.rejects(
        importCall({
            ...mappings,
            'old-reclass': { counterAccountId: account('BANK') },
        }),
        'Existing capital may not replay the bank movement'
    );
    const bankBefore = (
        await database.accountantManualJournalLine.findMany({
            where: { companyId: 'a', accountId: account('BANK') },
        })
    ).length;
    const reclassMap = {
        ...mappings,
        'old-reclass': {
            counterAccountId: account('EQUITY'),
            existingJournalId: existing.id,
        },
    };
    assert.equal((await importCall(reclassMap)).created, 1);
    assert.equal(
        (
            await database.accountantManualJournalLine.findMany({
                where: { companyId: 'a', accountId: account('BANK') },
            })
        ).length,
        bankBefore,
        'Reclassification does not create cash/bank lines'
    );
    assert.equal((await importCall(reclassMap)).created, 0);
    assert.equal(
        (await call('GET', '/')).data.find(
            (r: any) => r.legacy_user_id === 'old-user'
        ).capital,
        375
    );
    const { investorProfitRouter } = await import(
        '../server/utils/accountant/investor-profits'
    );
    const profitCall = (
        method: string,
        path: string,
        body: any = {},
        companyId = 'a',
        role = 'manager',
        query: any = {}
    ) =>
        runAccountant(
            { companyId, userId: 'tester', role },
            async () => {
                let result: any;
                const res = {
                    json(v: any) {
                        result = v;
                        return res;
                    },
                    status() {
                        return res;
                    },
                };
                await investorProfitRouter.dispatch(
                    method,
                    path,
                    {
                        user: { companyId, userId: 'tester', role },
                        body,
                        query,
                        params: {},
                    },
                    res
                );
                return result;
            },
            { transactionTimeoutMs: 120000 }
        );
    const book = async (
        amount: number,
        type: string,
        date = '2026-05-01',
        status = 'PUBLISHED',
        exchangeRate = 1
    ) =>
        database.accountantManualJournal.create({
            data: {
                companyId: 'a',
                entryNumber: randomUUID(),
                journalDate: new Date(date),
                currency: 'INR',
                exchangeRate,
                total: amount,
                status,
                notes: 'Profit test',
                lines: {
                    create: [
                        {
                            companyId: 'a',
                            accountId: account(type),
                            side: type === 'INCOME' ? 'CREDIT' : 'DEBIT',
                            amount,
                        },
                        {
                            companyId: 'a',
                            accountId: account('BANK'),
                            side: type === 'INCOME' ? 'DEBIT' : 'CREDIT',
                            amount,
                        },
                    ],
                },
            },
        });
    await book(500, 'INCOME', '2026-05-01', 'PUBLISHED', 2);
    await book(200, 'EXPENSE');
    await book(9000, 'INCOME', '2026-05-01', 'DRAFT');
    await book(700, 'INCOME', '2026-06-01');
    const period = { periodFrom: '2026-05-01', periodTo: '2026-05-31' },
        distribution = { ...period, distributable: 500 };
    const pnl = await profitCall('GET', '/profit', {}, 'a', 'manager', period);
    assert.equal(pnl.income, 1000);
    assert.equal(pnl.expenses, 200);
    assert.equal(
        pnl.profit,
        800,
        'Profit respects base currency, dates and drafts'
    );
    assert.equal(
        (await profitCall('GET', '/profit', {}, 'b', 'manager', period)).profit,
        0,
        'Profit is company scoped'
    );
    await assert.rejects(profitCall('GET', '/profit', {}, 'a', 'user', period));
    await assert.rejects(
        profitCall('POST', '/preview', { ...distribution, distributable: 801 })
    );
    assert.equal(
        (await profitCall('POST', '/preview', distribution)).issues.length,
        2,
        'Missing agreements are explicit blockers'
    );
    await call('POST', `/${second.id}/terms`, {
        ...term,
        date: '2026-04-01',
        ownershipPercent: 30,
        shares: 30,
        profitPercent: 35,
    });
    await call('POST', `/${legacy.id}/terms`, {
        ...term,
        date: '2026-01-01',
        ownershipPercent: 50,
        shares: 50,
        profitPercent: 50,
    });
    const settings = await profitCall('GET', '/settings');
    assert.ok(
        settings.accounts.some((a: any) => a.code === 'INV-DISTRIBUTION')
    );
    await assert.rejects(
        profitCall(
            'PUT',
            '/settings',
            { accountId: account('EQUITY') },
            'a',
            'accountant'
        )
    );
    await assert.rejects(
        profitCall('PUT', '/settings', { accountId: p.accounts.capital })
    );
    let preview = await profitCall('POST', '/preview', distribution);
    assert.equal(preview.rows.length, 3);
    assert.equal(preview.total, 500);
    assert.equal(preview.retained, 300);
    assert.equal(preview.issues.length, 0);
    const stale = {
        ...distribution,
        date: '2026-06-01',
        requestId: randomUUID(),
        previewHash: preview.previewHash,
    };
    await book(1, 'INCOME');
    await assert.rejects(
        profitCall('POST', '/approve', stale),
        'Changed profit rejects a stale preview'
    );
    preview = await profitCall('POST', '/preview', distribution);
    const approval = {
        ...stale,
        requestId: randomUUID(),
        previewHash: preview.previewHash,
    };
    await assert.rejects(
        profitCall('POST', '/approve', approval, 'a', 'accountant')
    );
    // Fail a later investor's account validation after earlier posts; everything must roll back.
    const last = preview.rows.at(-1),
        lastProfile = (await call('GET', `/${last.investorId}`)).investor;
    await database.accountantAccountingAccount.update({
        where: { id: lastProfile.accounts.profit },
        data: { isActive: false },
    });
    const journalsBefore = await database.accountantManualJournal.count({
        where: { companyId: 'a' },
    });
    await assert.rejects(profitCall('POST', '/approve', approval));
    assert.equal(
        await database.accountantManualJournal.count({
            where: { companyId: 'a' },
        }),
        journalsBefore,
        'Batch failure is atomic'
    );
    await database.accountantAccountingAccount.update({
        where: { id: lastProfile.accounts.profit },
        data: { isActive: true },
    });
    const approved = await profitCall('POST', '/approve', approval);
    assert.equal(approved.entries.length, 3);
    assert.equal(approved.total, 500);
    assert.equal(
        (await profitCall('POST', '/approve', approval)).id,
        approved.id,
        'Approval retry does not post again'
    );
    await assert.rejects(
        profitCall('POST', '/approve', { ...approval, note: 'Changed' })
    );
    await assert.rejects(
        profitCall('POST', '/preview', distribution),
        'Company-wide period cannot be allocated twice'
    );
    assert.equal((await profitCall('GET', '/history')).length, 1);
    assert.equal((await profitCall('GET', '/history', {}, 'b')).length, 0);
    const ledger = await call('GET', '/ledger');
    assert.ok(
        ledger.events.some(
            (e: any) => e.details.batchId === approved.id && e.investorName
        )
    );
    assert.equal((await call('GET', '/ledger', {}, 'b')).events.length, 0);
    const june = {
        periodFrom: '2026-06-01',
        periodTo: '2026-06-30',
        distributable: 0.03,
    };
    const rounded = await profitCall('POST', '/preview', june);
    assert.ok(rounded.total <= 0.03);
    assert.equal(rounded.unassigned, 0.01, 'Rounding stays in the business');
    await call('POST', `/${p.id}/terms`, {
        ...term,
        date: '2026-06-15',
        note: 'New agreement',
    });
    assert.ok(
        (await profitCall('POST', '/preview', june)).issues.some((s: string) =>
            s.includes('changes during')
        )
    );
    await assert.rejects(
        call('PUT', '/share-settings', { totalShares: 200 }, 'a', 'accountant')
    );
    await assert.rejects(call('PUT', '/share-settings', { totalShares: -1 }));
    assert.equal(
        (await call('GET', '/share-settings', {}, 'b')).totalShares,
        0
    );
    await call('PUT', '/share-settings', { totalShares: 200 });
    await assert.rejects(
        call('POST', `/${p.id}/terms`, { ...term, date: '2026-07-01' })
    );
    await call('POST', `/${p.id}/terms`, {
        ...term,
        totalShares: undefined,
        shares: 40,
        date: '2026-07-01',
    });
    const snapshots = (await call('GET', `/${p.id}`)).terms;
    assert.equal(
        snapshots.find((t: any) =>
            new Date(t.effective_date).toISOString().startsWith('2026-07-01')
        ).terms.totalShares,
        200
    );
    assert.equal(
        snapshots.find((t: any) =>
            new Date(t.effective_date).toISOString().startsWith('2026-01-01')
        ).terms.totalShares,
        100
    );
    await call('POST', `/${p.id}/terms`, {
        ...term,
        totalShares: 0,
        shares: 0,
        date: '2026-08-01',
    });
    const editable = snapshots.find((t: any) =>
        new Date(t.effective_date).toISOString().startsWith('2026-07-01')
    );
    const originalTerm = snapshots.find((t: any) =>
        new Date(t.effective_date).toISOString().startsWith('2026-01-01')
    );
    const correction = {
        ...editable.terms,
        date: '2026-07-02',
        note: 'Correct effective date',
    };
    await assert.rejects(
        call('PUT', `/${p.id}/terms/${editable.id}`, correction, 'b')
    );
    await assert.rejects(
        call('PUT', `/${second.id}/terms/${editable.id}`, correction)
    );
    await assert.rejects(
        call(
            'PUT',
            `/${p.id}/terms/${editable.id}`,
            correction,
            'a',
            'accountant'
        )
    );
    await assert.rejects(
        call('PUT', `/${p.id}/terms/${originalTerm.id}`, {
            ...originalTerm.terms,
            date: '2026-09-01',
        })
    );
    await assert.rejects(
        call('PUT', `/${p.id}/terms/${editable.id}`, {
            ...correction,
            date: '2026-04-01',
        })
    );
    await assert.rejects(
        call('PUT', `/${p.id}/terms/${editable.id}`, {
            ...correction,
            date: '2026-08-01',
        })
    );
    await assert.rejects(
        call('PUT', `/${p.id}/terms/${editable.id}`, {
            ...correction,
            profitPercent: 99,
        })
    );
    await call('PUT', '/share-settings', { totalShares: 400 });
    await call('PUT', `/${p.id}/terms/${editable.id}`, correction);
    const corrected = (await call('GET', `/${p.id}`)).terms.find(
        (t: any) => t.id === editable.id
    );
    assert.equal(
        new Date(corrected.effective_date).toISOString().slice(0, 10),
        '2026-07-02'
    );
    assert.equal(
        corrected.terms.totalShares,
        200,
        'Editing retains the historical company total'
    );
    const audit = await sql(
        "SELECT after FROM accountant_v2_accountant_audit WHERE company_id='a' AND action='terms-edited'"
    );
    assert.equal(audit.rows.at(-1).after.before.date, '2026-07-01');
    assert.equal(audit.rows.at(-1).after.after.date, '2026-07-02');
    await assert.rejects(
        call('DELETE', `/${p.id}/terms/${editable.id}`, {}, 'b')
    );
    await assert.rejects(call('DELETE', `/${second.id}/terms/${editable.id}`));
    await assert.rejects(
        call('DELETE', `/${p.id}/terms/${editable.id}`, {}, 'a', 'accountant')
    );
    await assert.rejects(call('DELETE', `/${p.id}/terms/${originalTerm.id}`));
    await call('DELETE', `/${p.id}/terms/${editable.id}`);
    assert.ok(
        !(await call('GET', `/${p.id}`)).terms.some(
            (t: any) => t.id === editable.id
        )
    );
    const deletedAudit = await sql(
        "SELECT after FROM accountant_v2_accountant_audit WHERE company_id='a' AND action='terms-deleted'"
    );
    assert.equal(deletedAudit.rows.at(-1).after.termId, editable.id);
    assert.equal(deletedAudit.rows.at(-1).after.before.date, '2026-07-02');
    const reduction = await call('POST', `/${p.id}/terms`, {
        ...term,
        shares: 0,
        totalShares: 0,
        ownershipPercent: 0,
        profitPercent: 0,
        date: '2026-09-01',
    });
    await call('POST', `/${second.id}/terms`, {
        ...term,
        shares: 0,
        totalShares: 0,
        ownershipPercent: 50,
        profitPercent: 50,
        date: '2026-09-01',
    });
    await assert.rejects(
        call('DELETE', `/${p.id}/terms/${reduction.id}`),
        /exceeds 100%/
    );
    assert.ok(
        (await call('GET', `/${p.id}`)).terms.some(
            (t: any) => t.id === reduction.id
        ),
        'Failed deletion rolls back'
    );
    await sql(
        `INSERT INTO accountant_v2_transaction_locks(id,company_id,module,lock_date,reason,is_locked,updated_at,locked_by_id) VALUES('lock','a','BANKING','2099-01-01','Closed',true,now(),'tester')`
    );
    await assert.rejects(
        call('POST', `/${p.id}/events`, post('CAPITAL_IN', 100))
    );
    await assert.rejects(
        call('POST', `/${p.id}/reverse/${added.id}`, {
            date: '2026-04-03',
            reason: 'Locked',
        })
    );
    assert.equal(
        (
            await sql(
                "SELECT journal_id FROM accountant_v2_manual_journal_lines GROUP BY journal_id HAVING sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END)<>0"
            )
        ).rowCount,
        0
    );
    console.log(
        'Investor integration passed: book profit and exchange rates, batch previews/approval/rollback/retries, ownership, capital/loans, payouts, reversals, scope, locks, imports and balanced journals.'
    );
    }
} finally {
    await database?.$disconnect();
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
    await pool.end();
}
