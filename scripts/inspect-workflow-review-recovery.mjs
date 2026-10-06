import 'dotenv/config';
import fs from 'node:fs';
import {Pool,types} from 'pg';
types.setTypeParser(1114,v=>v);types.setTypeParser(1082,v=>v);
const dir='scripts/production-accounting/runs/workflow-review-2026-10-06';
const before=JSON.parse(fs.readFileSync(`${dir}/persisted-before.json`));
const pool=new Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect();
try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const out={at:new Date().toISOString(),before:before.at};
 for(const t of ['accountant_v2_manual_journals','accountant_v2_erp_sources','accountant_v2_user_sources','accountant_v2_accountant_audit']){
  const cols=(await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1',[t])).rows.map(r=>r.column_name);
  const date=cols.includes('created_at')?'created_at':null;
  out[t]=(await db.query(`SELECT * FROM public."${t}" ${date?'WHERE '+date+'>=$1::timestamptz':'WHERE company_id=$1'}`,[date?before.at:'5271d5cb-2e97-4303-85c0-3fc9e3e6bb05'])).rows;
 }
 const snapshot='scripts/production-accounting/runs/source-recheck-2026-10-06/full-source-audit-data';
 out.snapshotFiles=fs.readdirSync(snapshot).filter(n=>/compan|stock_control|journal|audit/.test(n));
 for(const t of ['accountant_v2_stock_control']){
  const baseline=JSON.parse(fs.readFileSync(`${snapshot}/${t}.json`));
  const rows=Array.isArray(baseline)?baseline:baseline.rows;
  out[t]={snapshotCount:rows.length,current:(await db.query(`SELECT * FROM public."${t}" WHERE ${t==='companies'?'id':'company_id'}=ANY($1::text[])`,[rows.map(r=>r[t==='companies'?'id':'company_id'])])).rows,baseline:rows};
 }
 out.companies=(await db.query("SELECT * FROM companies WHERE id IN('5271d5cb-2e97-4303-85c0-3fc9e3e6bb05','02856c86-60b8-41a4-ba18-79dbd55bf016')")).rows;
 fs.writeFileSync(`${dir}/recovery-inspection.json`,JSON.stringify(out,null,2));
 console.log(JSON.stringify({journals:out.accountant_v2_manual_journals.map(j=>({id:j.id,source:j.source_type,sourceId:j.source_id,note:j.notes})),audit:out.accountant_v2_accountant_audit.map(a=>({id:a.id,resource:a.resource,resourceId:a.resourceId})),snapshotFiles:out.snapshotFiles},null,2));
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
