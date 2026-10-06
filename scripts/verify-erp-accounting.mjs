import dotenv from 'dotenv';
import {Pool} from 'pg';
dotenv.config({quiet:true});
const pool=new Pool({connectionString:process.env.DATABASE_URL});const c=await pool.connect();
try {
 await c.query('BEGIN');
 const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw new Error('Invalid schema');
 await c.query(`SET LOCAL search_path TO "${schema}"`);
 const sources=await c.query(`SELECT s.company_id,s.source_key FROM accountant_v2_erp_sources s
 JOIN accountant_v2_erp_settings cfg ON cfg.company_id=s.company_id WHERE cfg.enabled AND COALESCE(s.signature->>'excluded','false')<>'true' ORDER BY s.company_id,s.source_key`);
 let changed=0;
 for(const source of sources.rows){const colon=source.source_key.indexOf(':');const result=await c.query('SELECT accountant_v2_sync_erp($1,$2,$3) AS n',[source.company_id,source.source_key.slice(0,colon).toUpperCase(),source.source_key.slice(colon+1)]);changed+=Number(result.rows[0].n);}
 const bad=await c.query(`SELECT j.id FROM accountant_v2_manual_journals j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id
 WHERE j.source_type IN ('ERP_BILL','ERP_EXPENSE','ERP_REVERSAL') GROUP BY j.id HAVING sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)<>0`);
 const enabled=await c.query('SELECT c.name FROM accountant_v2_erp_settings s JOIN companies c ON c.id=s.company_id WHERE s.enabled');
 // Verification must never change the books, including if a mismatch is found.
 await c.query('ROLLBACK');
 if(changed||bad.rowCount)throw new Error(JSON.stringify({changed,unbalanced:bad.rowCount}));
 console.log(JSON.stringify({companies:enabled.rows.map(r=>r.name),checkedSources:sources.rowCount,repeatChanged:changed,unbalanced:bad.rowCount}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
