import 'dotenv/config';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import pg from 'pg';
const dir = process.env.ACCOUNTING_REVIEW_DIR;
if (!dir) throw Error('ACCOUNTING_REVIEW_DIR is required');
function constant(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  let value;
  function visit(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(source) === name) value = n.initializer.getText(source);
    ts.forEachChild(n, visit);
  }
  visit(source); if (!value) throw Error(`Missing ${file}:${name}`);
  return vm.runInNewContext(`(${value})`, { field: (label,...types)=>({label,types}), money: label=>({label,types:['CASH','BANK']}) });
}
const erp = constant('server/utils/accountant/erp.ts','erpRoles');
const staff = constant('server/utils/accountant/users.ts','userAccountRoles');
const online = {...Object.fromEntries(Object.entries(erp).filter(([role])=>role!=='expense')), ...constant('server/utils/accountant/ecommerce.ts','extraRoles')};
const groups = constant('utils/account-defaults.ts','accountDefaultGroups');
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:20000});
const db = await pool.connect();
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const accounts = new Map((await db.query('SELECT id,company_id,account_type::text,is_active,deleted_at FROM accountant_v2_accounting_accounts')).rows.map(a=>[a.id,a]));
  const companies = new Map((await db.query('SELECT id,name FROM companies')).rows.map(c=>[c.id,c.name]));
  const banks = new Map((await db.query('SELECT id,company_id FROM bank_accounts')).rows.map(b=>[b.id,b.company_id]));
  const issues=[], summaries=[]; let selected=0;
  function validate(company,group,role,id,spec) {
    if (!id) return;
    selected++;
    if (role.startsWith('bank:') && banks.get(role.slice(5)) !== company) issues.push({companyId:company,company:companies.get(company),group,role,reason:'named bank missing or belongs to another company'});
    const a=accounts.get(id), reason=!a?'missing account':a.company_id!==company?'different company':!a.is_active||a.deleted_at?'inactive/deleted account':
      spec?.types?.length&&!spec.types.includes(a.account_type)||spec?.exclude?.includes(a.account_type)?'wrong account type':!spec?'unknown role':null;
    if(reason)issues.push({companyId:company,company:companies.get(company),group,role,accountId:id,reason});
  }
  for(const [table,group,roles] of [['accountant_v2_erp_settings','ERP',erp],['accountant_v2_user_settings','Staff',staff],['accountant_v2_ecommerce_settings','Online',online]]) {
    const rows=(await db.query(`SELECT company_id,enabled,accounts FROM ${table}`)).rows;
    for(const r of rows) {
      summaries.push({companyId:r.company_id,company:companies.get(r.company_id),group,enabled:r.enabled});
      for(const [role,id] of Object.entries(r.accounts||{}))validate(r.company_id,group,role,id,role.startsWith('bank:')?{types:['BANK']}:roles[role]?{types:[roles[role].type]}:null);
      if(r.enabled)for(const role of Object.keys(roles))if(!r.accounts?.[role])issues.push({companyId:r.company_id,company:companies.get(r.company_id),group,role,reason:'enabled without a required mapping'});
    }
  }
  const defaults=(await db.query(`SELECT DISTINCT ON(company_id,"resourceId") company_id,"resourceId" AS group,"after" AS mappings
    FROM accountant_v2_accountant_audit WHERE resource='account-defaults' AND action='configured' AND deleted_at IS NULL ORDER BY company_id,"resourceId",created_at DESC,id DESC`)).rows;
  for(const d of defaults)for(const [role,id]of Object.entries(d.mappings||{}))validate(d.company_id,'Defaults: '+d.group,role,id,groups[d.group]?.fields[role]);
  const mappings=(await db.query('SELECT company_id,distributor_id,role,account_id FROM accountant_v2_distributor_mappings')).rows;
  for(const m of mappings)validate(m.company_id,'Supplier '+m.distributor_id,m.role,m.account_id,m.role.startsWith('bank:')?{types:['BANK']}:groups.purchase.fields[m.role]);
  const stock=(await db.query(`SELECT c.company_id,c.stock_account_id,e.accounts->>'stock' AS billing_stock FROM accountant_v2_stock_control c JOIN accountant_v2_erp_settings e ON e.company_id=c.company_id WHERE c.enabled`)).rows;
  const stockDifferences=stock.filter(s=>s.billing_stock&&s.stock_account_id!==s.billing_stock);
  const openingTrigger=(await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid='public.distributor_companies'::regclass AND tgname='accountant_v2_supplier_opening_selection' AND NOT tgisinternal AND tgenabled<>'D'")).rows[0].n>0;
  const result={at:new Date().toISOString(),method:'Read-only repeatable-read inspection of public settings; account types taken from the actual local role definitions.',selectedAccountsChecked:selected,settings:summaries,savedDefaultGroups:defaults.length,supplierMappings:mappings.length,invalidSelections:issues,stockDifferences,supplierOpeningSelectionTriggerInstalled:openingTrigger};
  fs.writeFileSync(`${dir}/production-settings.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({selectedAccountsChecked:selected,invalidSelections:issues,stockDifferences,supplierOpeningSelectionTriggerInstalled:openingTrigger},null,2));
} finally {await db.query('ROLLBACK');db.release();await pool.end();}
