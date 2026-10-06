import 'dotenv/config';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile), schema=`cash_bank_test_${randomUUID().replaceAll('-','')}`;
const p=new Pool({connectionString:process.env.DATABASE_URL});const c=await p.connect();
const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
mkdirSync('.cache',{recursive:true});const report=`.cache/${schema}.json`;
async function sql(s){await c.query('BEGIN');try{await c.query(`SET LOCAL search_path TO "${schema}"`);const r=await c.query(s);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}}
async function script(extra=[],success=true){let error;try{await run(process.execPath,['scripts/import-legacy-cash-bank.mjs','--company=a','--through=2026-01-31',`--report=${report}`,...extra],{env:{...process.env,DATABASE_URL:url.toString()},timeout:60000});}catch(e){error=e;}if(success&&error)throw error;if(!success)assert.ok(error,'Expected safe refusal');return JSON.parse(readFileSync(report,'utf8'));}
try{
 await c.query(`CREATE SCHEMA "${schema}"`);
 await sql(`CREATE TABLE companies(id text PRIMARY KEY,name text,currency text DEFAULT 'INR',cash numeric DEFAULT 10.01,bank numeric DEFAULT 0,opening_cash_date timestamp DEFAULT '2026-01-01',opening_bank_date timestamp);INSERT INTO companies(id,name) VALUES('a','Test');`);
 await sql(readFileSync('prisma/migrations/20260926120000_accountant_v2/migration.sql','utf8'));
 await sql(`CREATE TABLE account_ledger_entries(id text,company_id text,account_type text,account_id text,source_type text,source_id text,direction text,amount numeric(18,2),entry_date timestamp,note text,balance_after numeric(18,2));
 CREATE TABLE accountant_v2_erp_sources(company_id text,source_key text,journal_id text);
 CREATE TABLE accountant_v2_distributor_sources(company_id text,source_key text,journal_id text);
 CREATE TABLE distributor_payments(id text,company_id text,expense_id text);
 CREATE TABLE distributor_credits(id text,company_id text,money_transaction_id text);
 INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,code,account_type,category,is_primary,updated_at) VALUES
 ('cash','a','Cash','1001','CASH','ASSET',false,now()),('bank','a','Primary Bank','1002','BANK','ASSET',true,now()),
 ('offset','a','Opening Balance Adjustments','2220','EQUITY','EQUITY',false,now()),('income','a','Sales','4000','INCOME','INCOME',false,now());
 INSERT INTO account_ledger_entries VALUES
 ('1','a','CASH',null,'OPENING','a:CASH','CREDIT',10.01,'2026-01-01','Opening',10.01),
 ('2','a','CASH',null,'BILL','sale','CREDIT',100,'2026-01-02','Sale',110.01),
 ('3','a','CASH',null,'ACCOUNT_TRANSFER','transfer','DEBIT',40,'2026-01-03','Transfer',70.01),
 ('4','a','PRIMARY_BANK',null,'ACCOUNT_TRANSFER','transfer','CREDIT',40,'2026-01-03','Transfer',40);
 INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,updated_at)
 VALUES('existing','a','ERP-1','2026-01-02','Native sale','INR',100,'PUBLISHED',now(),true,'ERP_BILL','bill:sale:1',now());
 INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,updated_at) VALUES('native-cash','a','existing','cash','DEBIT',100,now()),('native-sales','a','existing','income','CREDIT',100,now());
 INSERT INTO accountant_v2_erp_sources VALUES('a','bill:sale','existing');`);
 const preview=await script();assert.equal(preview.applied,false);assert.equal(preview.companies[0].missingJournals,2);assert.equal(preview.companies[0].reusedSources,1);
 assert.equal((await sql('SELECT count(*) n FROM accountant_v2_manual_journals')).rows[0].n,'1','Preview writes nothing');
 // Add an ordinary historical outflow that requires a distinct migration offset.
 await sql("INSERT INTO account_ledger_entries VALUES('5','a','PRIMARY_BANK',null,'EXPENSE','old-expense','DEBIT',1,'2026-01-04','Historical expense',39)");
 await script(['--apply'],false);
 assert.equal((await sql('SELECT count(*) n FROM accountant_v2_manual_journals')).rows[0].n,'1','Missing offset refuses all writes');
 const applied=await script(['--apply','--offset-account=offset']);assert.equal(applied.applied,true);
 assert.deepEqual(applied.companies[0].reconciliation.map(r=>r.newBalanceAfter),['70.01','39.00']);
 const opening=(await sql("SELECT o.amount,o.as_of_date,j.source_type,j.source_id FROM accountant_v2_account_opening_balances o JOIN accountant_v2_manual_journals j ON j.id=o.journal_id")).rows[0];
 assert.equal(opening.amount,'10.01');assert.equal(opening.source_type,'OPENING_BALANCE');assert.equal(opening.source_id,'cash');
 const repeated=await script(['--apply','--offset-account=offset']);assert.equal(repeated.companies[0].missingJournals,0);assert.equal(repeated.companies[0].unchangedImports,2);
 assert.equal((await sql('SELECT count(*) n FROM accountant_v2_manual_journals')).rows[0].n,'4');
 assert.equal((await sql(`SELECT journal_id FROM accountant_v2_manual_journal_lines GROUP BY journal_id HAVING sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END)<>0`)).rowCount,0);
 // Accept a reviewed native-only movement, while preserving it and guarding snapshot drift.
 await sql("UPDATE accountant_v2_manual_journal_lines SET amount=101 WHERE journal_id='existing'");
 const drift=await script([],false);
 const reviewed={version:1,through:drift.through,companies:drift.companies};
 const reviewPath=report+'.review';writeFileSync(reviewPath,JSON.stringify(reviewed));
 try{
  const accepted=await script(['--apply','--offset-account=offset',`--review=${reviewPath}`]);
  assert.equal(accepted.applied,true);assert.ok(accepted.companies[0].acceptedConflicts.length);
  assert.equal(accepted.companies[0].missingJournals,0);
  await sql("UPDATE accountant_v2_manual_journal_lines SET amount=102 WHERE journal_id='existing'");
  const stale=await script(['--apply','--offset-account=offset',`--review=${reviewPath}`],false);
  assert.ok(stale.companies[0].conflicts.some(c=>c.reason==='Reviewed old or projected new balance changed'));
 }finally{rmSync(reviewPath,{force:true});}
 await sql("UPDATE account_ledger_entries SET amount=11.01 WHERE id='1'");
 const refused=await script(['--apply','--offset-account=offset'],false);assert.ok(refused.companies[0].conflicts.length);
 assert.equal((await sql('SELECT count(*) n FROM accountant_v2_manual_journals')).rows[0].n,'4','Conflicting apply changes nothing');
 console.log('Cash/bank importer passed against PostgreSQL: read-only preview, required offset, native reuse, balanced insert, exact totals, repeat no-op and conflict rollback.');
}finally{await sql(`DROP SCHEMA "${schema}" CASCADE`);c.release();await p.end();rmSync(report,{force:true});}
