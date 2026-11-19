import { timingSafeEqual } from 'node:crypto';
import { createError, defineEventHandler, getHeader, setHeader } from 'h3';
import { runAccountant, context } from '../../utils/accountant/context';
import { getLoan, loansAvailable, postLoanDue } from '../../utils/accountant/loans';

/** Call daily with the existing CRON_SECRET. Never creates or alters database objects. */
export default defineEventHandler(async event => {
    const secret = process.env.CRON_SECRET || '', supplied = Buffer.from(getHeader(event, 'authorization') || ''), expected = Buffer.from('Bearer ' + secret);
    if (secret.length < 16 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    setHeader(event, 'Cache-Control', 'no-store');
    // Availability and discovery use the configured Prisma connection; mutations
    // resolve the same schema and company advisory lock as interactive accounting.
    const discovery = await runAccountant({ companyId: '__loan_probe__', userId: 'loan-scheduler', role: 'admin' }, async () => {
        if (!await loansAvailable()) return { ready: false, loans: [] };
        return { ready: true, loans: await context().db.$queryRawUnsafe("SELECT id,company_id FROM accountant_v2_loans WHERE status='OPEN' ORDER BY company_id,id") };
    }, { readOnly: true });
    if (!discovery.ready) return { ready: false, results: [] };
    const loans: any[] = discovery.loans;
    const results: any[] = [];
    for (const loan of loans) {
        try {
            await runAccountant({ companyId: loan.company_id, userId: 'loan-scheduler', role: 'admin' }, async () => {
                await postLoanDue(await getLoan(loan.id), new Date().toISOString().slice(0, 10));
            }, { transactionTimeoutMs: 120000 });
            results.push({ id: loan.id, ok: true });
        } catch (error: any) { results.push({ id: loan.id, ok: false, message: error.statusMessage || 'Loan posting failed; review date locks and account configuration' }); }
    }
    return { ready: true, results };
});
