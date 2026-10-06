import {createHash} from 'node:crypto';

export const stages = ['schema', 'setup', 'distributors', 'cash-bank', 'erp-history', 'transactions', 'transfers', 'staff-setup', 'stock', 'verify'];
export const migrations = [
  '20260926120000_accountant_v2',
  '20260927120000_distributor_accounting',
  '20260927123000_distributor_history_projection',
  '20260927130000_distributor_purchase_tax',
  '20260927133000_distributor_receipt_consistency',
  '20260927150000_erp_accounting',
  '20260927151000_erp_deleted_source_stability',
  '20260927160000_expense_tax_recovery',
  '20260927170000_erp_party_links',
  '20260929110000_stock_control',
  '20260930130000_user_accounting',
  '20260930131000_user_credit_cut_baseline',
  '20260930140000_customer_account_links'
];
export const digest = value => createHash('sha256').update(value).digest('hex');
export function validateConfig(config) {
  const allowed = ['companies', 'through', 'output', 'cashReview'];
  if (Object.keys(config).some(k => !allowed.includes(k))) throw Error('Unknown configuration key');
  if (!Array.isArray(config.companies) || !config.companies.length || config.companies.some(id => typeof id !== 'string' || !id.trim() || id.startsWith('-'))) throw Error('companies must contain explicit production company IDs');
  if (new Set(config.companies).size !== config.companies.length) throw Error('Duplicate company IDs');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.through) || !Number.isFinite(Date.parse(config.through)) || new Date(config.through).toISOString().slice(0,10) !== config.through) throw Error('through must be a valid YYYY-MM-DD');
  if (typeof config.output !== 'string' || !config.output.trim()) throw Error('output must name a dedicated run directory');
  if (config.cashReview !== undefined && (typeof config.cashReview !== 'string' || !config.cashReview)) throw Error('cashReview must be a reviewed production preview file');
  return config;
}
export function targetIdentity(url) {
  const u = new URL(url);
  // Hash routing details only; never store credentials or a connection string.
  return digest(JSON.stringify([u.hostname, u.port, u.pathname, u.username, u.searchParams.get('schema') || 'public']));
}
export function commandsFor(stage, config, apply, report, review) {
  const company = config.companies.map(id => `--company=${id}`);
  const args = [...company, ...(apply ? ['--apply'] : []), `--report=${report}`];
  switch(stage) {
    case 'schema': return [
      ['apply-accountant-v2.mjs'], ['apply-distributor-accounting.mjs'],
      ...['--history-projection','--purchase-tax','--receipt-consistency','--erp','--erp-deleted-sources','--expense-tax','--erp-parties','--stock','--users','--user-credit-baseline','--customer-accounts'].map(flag => ['apply-distributor-accounting.mjs',flag])
    ];
    case 'setup': return [['connect-erp-accounting.ts',...args]];
    case 'distributors': return [['import-distributor-accounting.ts',...args]];
    case 'cash-bank': return [['import-legacy-cash-bank.mjs',...args,`--through=${config.through}`,'--migration-clearing',...(review ? [`--review=${review}`] : [])]];
    case 'erp-history': return [['import-erp-history.mjs',...args,`--through=${config.through}`]];
    case 'transactions': return [['copy-old-account-history.ts','--only=transactions',...args,`--through=${config.through}`]];
    case 'transfers': return [['copy-old-account-history.ts','--only=transfers',...args,`--through=${config.through}`]];
    case 'staff-setup': return [['connect-user-accounting.ts',...args]];
    case 'stock': return [['reconcile-stock-accounting.mjs',...args]];
    case 'verify': return [['verify.mjs',...company,`--through=${config.through}`,`--report=${report}`]];
    default: throw Error('Unknown stage '+stage);
  }
}
