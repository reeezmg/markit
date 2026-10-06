import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import dotenv from 'dotenv';
import { Pool } from 'pg';
dotenv.config({ quiet: true });
const dir = 'scripts/production-accounting/runs/originals-settings-selection-2026-10-06';
const plan = JSON.parse(fs.readFileSync(`${dir}/recommended-selections.json`, 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(`${dir}/account-usage.json`, 'utf8'));
const apply = process.argv.includes('--apply');
const companyId = plan.company.id;
function constant(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!expression) throw Error(`Missing ${name}`);
  return vm.runInNewContext(`(${expression})`, { field: (label,...types) => ({label,types}), money: label => ({label,types:['CASH','BANK']}) });
}
const groups = constant('utils/account-defaults.ts', 'accountDefaultGroups');
const onlineRoles = { ...Object.fromEntries(Object.entries(constant('server/utils/accountant/erp.ts','erpRoles')).filter(([key])=>key!=='expense')),
  ...constant('server/utils/accountant/ecommerce.ts','extraRoles') };
const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
const db = await pool.connect();
const saved = [];
const proposed = {};
const configuredGroups = { purchase:'Purchase & supplier payments', investments:'Investments', receive:'Receive money', pay:'Pay money', transfers:'Transfers', assets:'Fixed assets' };
const selected = name => Object.fromEntries(Object.entries(plan.groups[name]).filter(([,choice])=>choice.id).map(([role,choice])=>[role,choice.id]));
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await db.query('SET LOCAL search_path TO public');
  await db.query('SET LOCAL lock_timeout = \'15s\'');
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`accountant-v2:${companyId}`]);
  const company = (await db.query('SELECT id,name FROM companies WHERE id=$1 FOR UPDATE', [companyId])).rows[0];
  if (!company || company.name !== plan.company.name) throw Error('Company does not match reviewed plan');
  const accounts = (await db.query('SELECT id,account_type::text AS type,category::text AS category FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND is_active AND deleted_at IS NULL', [companyId])).rows;
  const check = (id,spec,label) => {
    const account = accounts.find(a=>a.id===id);
    if (!account || spec.types?.length && !spec.types.includes(account.type) || spec.exclude?.includes(account.type)) throw Error(`Invalid company account for ${label}`);
  };
  const before = { company, settings:{}, defaults: (await db.query(`SELECT * FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource IN ('account-defaults','investor-profit-settings') ORDER BY created_at,id`, [companyId])).rows };
  for (const table of ['accountant_v2_erp_settings','accountant_v2_user_settings','accountant_v2_ecommerce_settings'])
    before.settings[table] = (await db.query(`SELECT * FROM ${table} WHERE company_id=$1`, [companyId])).rows;
  for (const [key,table] of [['erp','accountant_v2_erp_settings'],['staff','accountant_v2_user_settings'],['online','accountant_v2_ecommerce_settings']]) {
    const current = before.settings[table][0] || null, expected = snapshot.settings[key];
    if (JSON.stringify(current?.accounts || null) !== JSON.stringify(expected?.accounts || null) || !!current?.enabled !== !!expected?.enabled)
      throw Error(`Settings changed since review: ${key}; refresh the plan before saving`);
  }
  const tables = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'accountant_v2_%'
    AND tablename NOT IN ('accountant_v2_accountant_audit','accountant_v2_erp_settings','accountant_v2_user_settings','accountant_v2_ecommerce_settings') ORDER BY tablename`)).rows.map(r=>r.tablename);
  async function financialFingerprint() {
    const result = {};
    for (const table of tables) {
      if (!/^[a-z_0-9]+$/.test(table)) throw Error('Invalid table');
      result[table] = (await db.query(`SELECT count(*)::int AS rows, md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS hash
        FROM (SELECT md5(to_jsonb(t)::text) AS h FROM public.${table} t WHERE company_id=$1) x`, [companyId])).rows[0];
    }
    return result;
  }
  const financialBefore = await financialFingerprint();
  for (const [key,name] of Object.entries(configuredGroups)) {
    proposed[key] = selected(name);
    for (const [role,id] of Object.entries(proposed[key])) {
      if (!groups[key].fields[role]) throw Error(`Unknown role ${key}/${role}`);
      check(id, groups[key].fields[role], `${key}/${role}`);
    }
  }
  if (proposed.transfers.fromAccountId === proposed.transfers.toAccountId) throw Error('Transfer endpoints must differ');
  const online = selected('Online sales & settlements');
  for (const [role,spec] of Object.entries(onlineRoles)) check(online[role], {types:[spec.type]}, `online/${role}`);
  if (new Set(Object.values(online)).size !== Object.keys(onlineRoles).length) throw Error('Online roles must use distinct accounts');
  const profitAccountId = selected('Profit distribution').accountId;
  if (accounts.find(a=>a.id===profitAccountId)?.category !== 'EQUITY') throw Error('Profit distribution requires equity');
  if ((await db.query(`SELECT id FROM accountant_v2_investors WHERE company_id=$1 AND (accounts->>'capital'=$2 OR accounts->>'profit'=$2 OR accounts->>'loan'=$2)`, [companyId,profitAccountId])).rowCount)
    throw Error('Profit distribution account belongs to an individual investor');
  const report = { company, dataOnly:true, applied:false, proposedDefaults:proposed, proposedOnline:online, profitAccountId, unresolved:plan.unresolved, retainedErpAndStaff:true, onlineEnabled:false };
  if (!apply) {
    await db.query('ROLLBACK');
    fs.writeFileSync(`${dir}/save-preview.json`, JSON.stringify(report,null,2));
    console.log(JSON.stringify({ preview:true, company:company.name, validatedGroups:6, unresolved:plan.unresolved.length }));
  } else {
    const backupPath = `${dir}/settings-backup-${new Date().toISOString().replaceAll(':','-')}.json`;
    fs.writeFileSync(backupPath, JSON.stringify({at:new Date().toISOString(),before,financialBefore},null,2), {flag:'wx'});
    async function audit(resource,resourceId,after) {
      const id = randomUUID();
      await db.query(`INSERT INTO accountant_v2_accountant_audit (id,company_id,"userId",action,resource,"resourceId","after",created_at,updated_at)
        VALUES ($1,$2,$3,'configured',$4,$5,$6::jsonb,now(),now())`, [id,companyId,'codex:user-authorized-settings',resource,resourceId,JSON.stringify(after)]);
      saved.push({id,resource,resourceId});
    }
    for (const [key,mappings] of Object.entries(proposed)) await audit('account-defaults',key,mappings);
    await audit('investor-profit-settings',companyId,{accountId:profitAccountId});
    await db.query(`INSERT INTO accountant_v2_ecommerce_settings(company_id,accounts) VALUES($1,$2::jsonb)
      ON CONFLICT(company_id) DO UPDATE SET accounts=EXCLUDED.accounts`, [companyId,JSON.stringify(online)]);
    await audit('ecommerce-account-settings',companyId,{accounts:online,enabled:false});
    const financialAfter = await financialFingerprint();
    if (JSON.stringify(financialBefore) !== JSON.stringify(financialAfter)) throw Error('Settings operation changed financial/source rows; rollback required');
    const observed = (await db.query(`SELECT DISTINCT ON("resourceId") "resourceId" AS group,"after" AS mappings FROM accountant_v2_accountant_audit
      WHERE company_id=$1 AND resource='account-defaults' AND action='configured' AND deleted_at IS NULL ORDER BY "resourceId",created_at DESC,id DESC`, [companyId])).rows;
    for (const [key,mappings] of Object.entries(proposed)) if (JSON.stringify(observed.find(r=>r.group===key)?.mappings) !== JSON.stringify(JSON.parse(JSON.stringify(mappings)))) {
      const actual = observed.find(r=>r.group===key)?.mappings;
      if (!actual || Object.keys(actual).length!==Object.keys(mappings).length || Object.entries(mappings).some(([role,id])=>actual[role]!==id)) throw Error(`Saved defaults mismatch: ${key}`);
    }
    const onlineSaved = (await db.query('SELECT enabled,accounts FROM accountant_v2_ecommerce_settings WHERE company_id=$1',[companyId])).rows[0];
    if (onlineSaved.enabled || Object.entries(online).some(([role,id])=>onlineSaved.accounts[role]!==id)) throw Error('Online settings mismatch or unexpected activation');
    await db.query('COMMIT');
    fs.writeFileSync(`${dir}/settings-saved.json`, JSON.stringify({...report,applied:true,at:new Date().toISOString(),backupPath,auditRows:saved,financialTablesChecked:tables.length,financialDataUnchanged:true},null,2));
    console.log(JSON.stringify({ saved:true,company:company.name,defaultGroups:6,auditRows:saved.length,financialDataUnchanged:true,onlineEnabled:false,unresolved:plan.unresolved.length }));
  }
} catch(error) { await db.query('ROLLBACK'); throw error; }
finally { db.release(); await pool.end(); }
