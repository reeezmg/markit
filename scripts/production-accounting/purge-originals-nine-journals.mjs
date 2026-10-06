import 'dotenv/config';
import {Pool} from 'pg';
import {writeFileSync} from 'node:fs';
const company='6980e6e4-7d5d-413c-9554-24f385c9b853';
const pool=new Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect();
try{
 await db.query('BEGIN');
 const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw Error('Invalid schema');
 await db.query(`SET LOCAL search_path TO "${schema}"`);
 await db.query("SET LOCAL lock_timeout='15s'");
 await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[company]);
 await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[company]);
 const exclusions=(await db.query(`SELECT * FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='authorized-distributor-exclusion' AND action='excluded'`,[company])).rows;
 if(exclusions.length!==9)throw Error('Expected exactly nine authorized exclusions');
 const originalIds=exclusions.map(a=>a.after.originalJournalId);
 const journals=(await db.query('SELECT * FROM accountant_v2_manual_journals WHERE company_id=$1 AND (id=ANY($2::text[]) OR reversed_from_id=ANY($2::text[])) FOR UPDATE',[company,originalIds])).rows;
 if(journals.length!==18||journals.filter(j=>j.source_type==='DISTRIBUTOR').length!==9||journals.filter(j=>j.source_type==='DISTRIBUTOR_REVERSAL').length!==9)throw Error('Expected nine original/reversal pairs');
 const ids=journals.map(j=>j.id);
 const lines=(await db.query('SELECT * FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND journal_id=ANY($2::text[])',[company,ids])).rows;
 const net=(await db.query(`SELECT account_id FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND journal_id=ANY($2::text[]) GROUP BY account_id HAVING sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END)<>0`,[company,ids])).rows;
 if(net.length||journals.some(j=>Number(j.exchange_rate)!==1||j.status!=='PUBLISHED'||j.deleted_at))throw Error('Journal pairs do not cancel exactly');
 const links=(await db.query('SELECT * FROM accountant_v2_distributor_sources WHERE company_id=$1 AND journal_id=ANY($2::text[])',[company,ids])).rows;
 if(links.length)throw Error('Journal still linked to active source');
 writeFileSync('../artifacts/originals-nine-journals-purge-backup-20261003.json',JSON.stringify({companyId:company,journals,lines,exclusions},null,2)+'\n',{flag:'wx'});
 const removed=await db.query('DELETE FROM accountant_v2_manual_journals WHERE company_id=$1 AND id=ANY($2::text[]) RETURNING id',[company,ids]);
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');
 if(removed.rowCount!==18)throw Error('Deletion count differs');
 for(const supplier of new Set(exclusions.map(a=>a.resourceId.split(':')[0]))){const r=await db.query('SELECT accountant_v2_sync_distributor($1,$2) changed',[company,supplier]);if(Number(r.rows[0].changed)!==0)throw Error('Sync recreated excluded journals');}
 const balance=(await db.query(`SELECT sum(CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END)::text balance FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id WHERE j.company_id=$1 AND a.is_primary AND a.account_type='BANK' AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL`,[company])).rows[0].balance;
 if(Number(balance)!==533399.81)throw Error('Unexpected Primary Bank balance');
 await db.query('COMMIT');
 console.log(JSON.stringify({deletedOriginalJournals:9,deletedReversalJournals:9,primaryBank:balance,repeatSyncChanged:0}));
}catch(e){await db.query('ROLLBACK');console.error(e.message);process.exitCode=1;}finally{db.release();await pool.end();}
