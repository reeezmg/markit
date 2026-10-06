import { reportSections } from './report-query';
import { createError } from 'h3';

type Queryable = { query: (sql: string, args?: any[]) => Promise<any> };
export const reportNumber = (value: any) => Math.round(Number(value || 0) * 100) / 100 + 0;
export function reportWindow(query: Record<string, any>) {
  const parse = (value: any) => {
    if (typeof value === 'string' && value.startsWith('"')) {
      try {
        return JSON.parse(value);
      } catch {
        throw createError({ statusCode: 400, statusMessage: 'Invalid date' });
      }
    }
    return value;
  };
  const from = new Date(parse(query.startDate || query.from || 0)),
    to = new Date(parse(query.endDate || query.to || Date.now()));
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to)
    throw createError({ statusCode: 400, statusMessage: 'Select a valid date range' });
  return { from, to };
}

/** Read only. Posted journals are the sole source of financial totals. */
export async function accountingReport(db: Queryable, companyIds: string[], from: Date, to: Date) {
  if (!companyIds.length)
    throw createError({ statusCode: 403, statusMessage: 'Company access required' });
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to)
    throw createError({ statusCode: 400, statusMessage: 'Invalid date range' });
  const args = [companyIds, from.toISOString(), to.toISOString()];
  const sections = await reportSections(
    db,
    [
      "SELECT id,name,COALESCE(currency,'INR') AS currency FROM companies WHERE id=ANY($1::text[])",
      `SELECT a.id,a.company_id,a.name,a.code,a.account_type::text AS type,a.category::text AS category,
  COALESCE(sum(CASE WHEN j.journal_date<$2 THEN CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END ELSE 0 END),0)::text AS opening,
  COALESCE(sum(CASE WHEN j.journal_date>=$2 AND l.side='DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE 0 END),0)::text AS debit,
  COALESCE(sum(CASE WHEN j.journal_date>=$2 AND l.side='CREDIT' THEN round(l.amount*j.exchange_rate,2) ELSE 0 END),0)::text AS credit
 FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
 WHERE j.company_id=ANY($1::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL AND j.journal_date<=$3
 GROUP BY a.id,a.company_id,a.name,a.code,a.account_type,a.category ORDER BY a.code NULLS LAST,a.name,a.id`,
      `SELECT j.id,round(sum(CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END),2)::text AS amount
 FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
 WHERE j.company_id=ANY($1::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL AND a.account_type IN ('CASH','BANK') AND j.journal_date BETWEEN $2 AND $3 GROUP BY j.id`,
      `SELECT j.journal_date::date::text AS date,
  COALESCE(sum(CASE WHEN a.account_type IN ('INCOME','OTHER_INCOME') THEN CASE l.side WHEN 'CREDIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END ELSE 0 END),0)::text AS sales,
  COALESCE(sum(CASE WHEN a.account_type IN ('EXPENSE','OTHER_EXPENSE') THEN CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END ELSE 0 END),0)::text AS expenses,
  COALESCE(sum(CASE WHEN a.account_type='COST_OF_GOODS_SOLD' THEN CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END ELSE 0 END),0)::text AS cogs
 FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
 WHERE j.company_id=ANY($1::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL AND j.journal_date BETWEEN $2 AND $3
 AND a.category IN ('INCOME','EXPENSE') GROUP BY j.journal_date::date ORDER BY j.journal_date::date`,
    ],
    args
  );
  const companies = sections[0].rows;
  if (companies.length !== new Set(companyIds).size)
    throw createError({ statusCode: 404, statusMessage: 'Company not found' });
  if (new Set(companies.map((c: any) => c.currency)).size !== 1)
    throw createError({
      statusCode: 400,
      statusMessage: 'Select companies with the same base currency',
    });

  const rows = sections[1].rows;
  const accounts = rows.map((r: any) => ({
    ...r,
    opening: reportNumber(r.opening),
    debit: reportNumber(r.debit),
    credit: reportNumber(r.credit),
    movement: reportNumber(Number(r.debit) - Number(r.credit)),
    closing: reportNumber(Number(r.opening) + Number(r.debit) - Number(r.credit)),
  }));
  const sum = (match: (r: any) => boolean, field: string) =>
    reportNumber(accounts.filter(match).reduce((n: number, r: any) => n + r[field], 0));
  const group = (types: string[]) => {
    const match = (r: any) => types.includes(r.type);
    return {
      opening: sum(match, 'opening'),
      debit: sum(match, 'debit'),
      credit: sum(match, 'credit'),
      delta: sum(match, 'movement'),
      closing: sum(match, 'closing'),
    };
  };
  const cash = group(['CASH']),
    bank = group(['BANK']),
    receivable = group(['ACCOUNTS_RECEIVABLE']),
    payable = group(['ACCOUNTS_PAYABLE']),
    stock = group(['STOCK']);
  const sales = -sum((r: any) => r.type === 'INCOME', 'movement'),
    otherIncome = -sum((r: any) => r.type === 'OTHER_INCOME', 'movement');
  const cogs = sum((r: any) => r.type === 'COST_OF_GOODS_SOLD', 'movement'),
    expenses = sum((r: any) => ['EXPENSE', 'OTHER_EXPENSE'].includes(r.type), 'movement');
  const gross = reportNumber(sales - cogs),
    net = reportNumber(gross + otherIncome - expenses);
  const pnl = {
    totalSales: sales,
    otherIncome,
    totalCOGS: cogs,
    totalProfitBeforeExpense: gross,
    netProfitBeforeExpense: gross,
    totalExpenses: expenses,
    netProfit: net,
    marginPct: sales ? reportNumber((net / sales) * 100) : 0,
    overallMarginPercent: sales ? reportNumber((gross / sales) * 100) : 0,
  };
  const assets = sum((r: any) => r.category === 'ASSET', 'closing'),
    liabilities = -sum((r: any) => r.category === 'LIABILITY', 'closing'),
    equity = -sum((r: any) => r.category === 'EQUITY', 'closing');
  const retainedResult = -sum((r: any) => ['INCOME', 'EXPENSE'].includes(r.category), 'closing');
  const moneyFlow = sections[2].rows;
  const received = reportNumber(
      moneyFlow.reduce((n: number, r: any) => n + Math.max(0, Number(r.amount)), 0)
    ),
    paid = reportNumber(
      moneyFlow.reduce((n: number, r: any) => n + Math.max(0, -Number(r.amount)), 0)
    );
  const series = sections[3].rows.map((r: any) => ({
    date: r.date,
    sales: reportNumber(r.sales),
    expenses: reportNumber(r.expenses),
    profit: reportNumber(Number(r.sales) - Number(r.expenses) - Number(r.cogs)),
  }));
  return {
    basis: 'posted-accounting',
    currency: companies[0].currency,
    companies,
    window: { from: from.toISOString(), to: to.toISOString() },
    accounts,
    pnl,
    balances: {
      cash,
      bank,
      receivable,
      payable,
      stock,
      total: {
        opening: reportNumber(cash.opening + bank.opening),
        closing: reportNumber(cash.closing + bank.closing),
        delta: reportNumber(cash.delta + bank.delta),
      },
    },
    balanceSheet: {
      assets,
      liabilities,
      equity,
      retainedResult,
      netAssets: reportNumber(assets - liabilities),
      difference: reportNumber(assets - liabilities - equity - retainedResult),
    },
    cashFlow: { received, paid, net: reportNumber(received - paid) },
    timeSeries: series,
  };
}

/** Compare recorded tax movements, not eligibility or a statutory filing result. */
export async function taxAccountingReport(db: Queryable, companyId: string, from: Date, to: Date) {
  const { rows } = await db.query(
    `WITH roles AS (SELECT 'output' AS role,accounts->>'outputTax' AS id FROM accountant_v2_erp_settings WHERE company_id=$1
 UNION SELECT 'input',accounts->>'inputTax' FROM accountant_v2_erp_settings WHERE company_id=$1
 UNION SELECT 'output',accounts->>'outputTax' FROM accountant_v2_erp_sources WHERE company_id=$1
 UNION SELECT 'input',accounts->>'inputTax' FROM accountant_v2_erp_sources WHERE company_id=$1
 UNION SELECT 'input',account_id FROM accountant_v2_distributor_mappings WHERE company_id=$1 AND role='tax'
 UNION SELECT 'input',accounts->>'tax' FROM accountant_v2_distributor_sources WHERE company_id=$1), tax AS (
 SELECT r.role, SUM(CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END) AS amount
 FROM roles r JOIN accountant_v2_manual_journal_lines l ON l.account_id=r.id AND l.company_id=$1
 JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 WHERE j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL AND j.journal_date BETWEEN $2 AND $3
 GROUP BY r.role
 ) SELECT COALESCE(c.currency,'INR') AS currency,
 COALESCE((SELECT amount FROM tax WHERE role='input'),0)::text AS input,
 COALESCE((SELECT -amount FROM tax WHERE role='output'),0)::text AS output
 FROM companies c WHERE c.id=$1`,
    [companyId, from.toISOString(), to.toISOString()]
  );
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Company not found' });
  return {
    basis: 'posted-accounting',
    inputTax: reportNumber(rows[0].input),
    outputTax: reportNumber(rows[0].output),
    currency: rows[0].currency,
  };
}

export async function accountingMoneyActivity(db: Queryable, ids: string[], from: Date, to: Date) {
  const rows = (
    await db.query(
      `SELECT a.id,a.name,a.account_type::text AS type,
  CASE WHEN COALESCE(parent.source_type,j.source_type)='ACCOUNT_TRANSFER' THEN 'transfer' ELSE 'money' END AS kind,
  CASE WHEN l.distributor_id IS NOT NULL THEN 'SUPPLIER' WHEN l.source_parties ? 'user' THEN 'EMPLOYEE' WHEN l.source_parties ? 'client' THEN 'CUSTOMER' ELSE COALESCE(audit."after"->'sourceRow'->>'party_type','OTHER') END AS party,
  l.side,round(l.amount*j.exchange_rate,2)::text AS amount
 FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
 JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
 LEFT JOIN accountant_v2_manual_journals parent ON parent.id=j.reversed_from_id AND parent.company_id=j.company_id
 LEFT JOIN accountant_v2_accountant_audit audit ON audit.company_id=j.company_id AND audit.resource='transaction-history-import' AND audit.action='imported' AND audit."after"->>'journalId'=COALESCE(parent.id,j.id)
 WHERE j.company_id=ANY($1::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL AND j.journal_date BETWEEN $2 AND $3
 AND (a.account_type IN ('CASH','BANK') OR COALESCE(parent.source_type,j.source_type)='ACCOUNT_TRANSFER') AND (COALESCE(parent.source_type,j.source_type) IN ('ACCOUNT_TRANSFER','MONEY_RECEIVE','MONEY_PAY','LEGACY_MONEY_RECEIVE','LEGACY_MONEY_PAY') OR audit.id IS NOT NULL)`,
      [ids, from.toISOString(), to.toISOString()]
    )
  ).rows;
  const transfers = new Map<string, any>(),
    transactions = { cash: { debit: 0, credit: 0, net: 0 }, bank: { debit: 0, credit: 0, net: 0 } },
    byPartyIn: Record<string, number> = {},
    byPartyOut: Record<string, number> = {};
  for (const r of rows) {
    const amount = reportNumber(r.amount),
      sign = r.side === 'DEBIT' ? 1 : -1;
    if (r.kind === 'transfer') {
      const item = transfers.get(r.id) || {
        name: r.name,
        type: r.type,
        debit: 0,
        credit: 0,
        net: 0,
      };
      item[r.side === 'DEBIT' ? 'debit' : 'credit'] = reportNumber(
        item[r.side === 'DEBIT' ? 'debit' : 'credit'] + amount
      );
      item.net = reportNumber(item.net + sign * amount);
      transfers.set(r.id, item);
    } else {
      const group = r.type === 'CASH' ? transactions.cash : transactions.bank;
      group[r.side === 'DEBIT' ? 'debit' : 'credit'] = reportNumber(
        group[r.side === 'DEBIT' ? 'debit' : 'credit'] + amount
      );
      group.net = reportNumber(group.net + sign * amount);
      const parties = r.side === 'DEBIT' ? byPartyIn : byPartyOut;
      parties[r.party] = reportNumber((parties[r.party] || 0) + amount);
    }
  }
  const incoming = reportNumber(Object.values(byPartyIn).reduce((a, b) => a + b, 0)),
    outgoing = reportNumber(Object.values(byPartyOut).reduce((a, b) => a + b, 0));
  const transferTotal = (type: string) =>
    [...transfers.values()]
      .filter((r) => r.type === type)
      .reduce(
        (n, r) => ({
          debit: reportNumber(n.debit + r.debit),
          credit: reportNumber(n.credit + r.credit),
          net: reportNumber(n.net + r.net),
        }),
        { debit: 0, credit: 0, net: 0 }
      );
  return {
    transfers: { cash: transferTotal('CASH'), bank: transferTotal('BANK') },
    transfersDisplay: [...transfers.values()],
    transactions,
    moneyTransactions: {
      in: { total: incoming, byParty: byPartyIn },
      out: { total: outgoing, byParty: byPartyOut },
      net: reportNumber(incoming - outgoing),
    },
  };
}
