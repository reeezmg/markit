import { z } from 'zod';
import { journalDateRange } from './date-range';

export const accountLedgerQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  from: z.string().optional(), to: z.string().optional(),
  search: z.string().trim().max(200).default(''),
  sourceType: z.string().trim().max(100).default(''),
  side: z.enum(['DEBIT', 'CREDIT']).optional(),
  minAmount: z.coerce.number().finite().nonnegative().optional(),
  maxAmount: z.coerce.number().finite().nonnegative().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
}).refine(q => q.minAmount === undefined || q.maxAmount === undefined || q.minAmount <= q.maxAmount,
  { message: 'Minimum amount cannot exceed maximum amount' });

/** Read one account only. Running balances are calculated before display filters. */
export function accountLedgerSql(companyId: string, accountId: string, input: unknown) {
  const q = accountLedgerQuery.parse(input);
  const dates = journalDateRange(q.from, q.to);
  const order = q.order === 'asc' ? 'ASC' : 'DESC';
  return {
    query: q,
    values: [companyId, accountId, dates?.gte?.toISOString() ?? null, dates?.lte?.toISOString() ?? null, q.search,
      q.sourceType, q.side ?? null, q.minAmount ?? null, q.maxAmount ?? null,
      q.pageSize, (q.page - 1) * q.pageSize],
    sql: `WITH posted AS (
      SELECT l.id, l.side::text AS side, l.created_at, l.source_parties,
        round(l.amount * j.exchange_rate, 2) AS amount,
        l.amount AS original_amount, j.currency AS original_currency, j.exchange_rate,
        j.journal_date AS date, j.entry_number, j.reference_number,
        coalesce(nullif(j.source_type, ''), 'MANUAL') AS source_type,
        coalesce(p.name, nullif(l.description, ''), j.notes) AS details
      FROM accountant_v2_manual_journal_lines l
      JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
      LEFT JOIN accountant_v2_accountant_contact p ON p.id=l.party_id AND p.company_id=l.company_id AND p.deleted_at IS NULL
      WHERE l.company_id=$1 AND l.account_id=$2 AND l.deleted_at IS NULL
        AND j.deleted_at IS NULL AND j.status='PUBLISHED'
        AND ($4::timestamp IS NULL OR j.journal_date <= $4::timestamp)
    ), balances AS (
      SELECT *, sum(CASE WHEN side='DEBIT' THEN amount ELSE -amount END)
        OVER (ORDER BY date, created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
      FROM posted
    ), matched AS (
      SELECT * FROM balances
      WHERE ($3::timestamp IS NULL OR date >= $3::timestamp)
        AND ($5::text='' OR strpos(lower(concat_ws(' ',details,reference_number,entry_number,source_parties::text)),lower($5)) > 0)
        AND ($6::text='' OR source_type=$6)
        AND ($7::text IS NULL OR side=$7)
        AND ($8::numeric IS NULL OR amount >= $8::numeric)
        AND ($9::numeric IS NULL OR amount <= $9::numeric)
    ), page AS (
      SELECT * FROM matched ORDER BY date ${order}, created_at ${order}, id ${order} LIMIT $10 OFFSET $11
    )
    SELECT
      (SELECT count(*)::int FROM matched) AS total,
      (SELECT coalesce(sum(amount) FILTER (WHERE side='DEBIT'),0)::text FROM posted) AS "debitTotal",
      (SELECT coalesce(sum(amount) FILTER (WHERE side='CREDIT'),0)::text FROM posted) AS "creditTotal",
      (SELECT coalesce(sum(amount) FILTER (WHERE side='DEBIT'),0)::text FROM matched) AS "filteredDebitTotal",
      (SELECT coalesce(sum(amount) FILTER (WHERE side='CREDIT'),0)::text FROM matched) AS "filteredCreditTotal",
      (SELECT coalesce(jsonb_agg(DISTINCT source_type), '[]'::jsonb) FROM posted) AS "sourceTypes",
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',id,'date',date,'transactionDetails',details,'sourceParties',source_parties,
        'sourceType',source_type,'referenceNumber',reference_number,'journalNumber',entry_number,
        'debit',CASE WHEN side='DEBIT' THEN amount ELSE 0 END,
        'credit',CASE WHEN side='CREDIT' THEN amount ELSE 0 END,
        'balance',abs(balance),'balanceSide',CASE WHEN balance < 0 THEN 'CR' ELSE 'DR' END,
        'originalCurrency',original_currency,'originalAmount',original_amount,'exchangeRate',exchange_rate
      ) ORDER BY date ${order}, created_at ${order}, id ${order}), '[]'::jsonb) FROM page) AS data`,
  };
}

const typeLabels: Record<string, string> = {
  MANUAL: 'Manual Journal', MONEY_RECEIVE: 'Receipt', MONEY_PAY: 'Payment',
  MONEY_REVERSAL: 'Payment reversal', SALES_INVOICE: 'Invoice', SALES_PAYMENT: 'Invoice Payment',
  ADVANCE_PAYMENT: 'Retainer Payment', ADVANCE_APPLICATION: 'Retainer Applied',
  ACCOUNT_TRANSFER: 'Account Transfer', OPENING_BALANCE: 'Opening Balance',
};
export function ledgerTypeLabel(type: string) {
  return typeLabels[type] || type.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export async function readAccountLedger(db: any, companyId: string, account: any, currency: string, input: unknown) {
  const { sql, values, query } = accountLedgerSql(companyId, account.id, input);
  const [result] = await db.$queryRawUnsafe(sql, ...values);
  const debitTotal = Number(result.debitTotal), creditTotal = Number(result.creditTotal);
  const balance = debitTotal - creditTotal;
  const normalSide = ['ASSET', 'EXPENSE'].includes(account.category) ? 'DR' : 'CR';
  return {
    account: { ...account, currency }, total: result.total, page: query.page, pageSize: query.pageSize,
    debitTotal, creditTotal, closingBalance: Math.abs(balance),
    balanceSide: balance === 0 ? normalSide : balance > 0 ? 'DR' : 'CR',
    filteredDebitTotal: Number(result.filteredDebitTotal), filteredCreditTotal: Number(result.filteredCreditTotal),
    sourceTypes: result.sourceTypes.map((value: string) => ({ value, label: ledgerTypeLabel(value) })),
    data: result.data.map((line: any) => ({ ...line, currency, type: ledgerTypeLabel(line.sourceType),
      balanceSide: Number(line.balance) === 0 ? normalSide : line.balanceSide })),
  };
}
