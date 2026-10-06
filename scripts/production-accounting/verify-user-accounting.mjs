import 'dotenv/config';
import {Pool} from 'pg';
import {writeFileSync} from 'node:fs';
import {verifyUserAccounting} from './lib/verify-user-accounting.mjs';
const args=process.argv.slice(2),ids=args.filter(a=>a.startsWith('--company=')).map(a=>a.slice(10));
if(Boolean(ids.length)===args.includes('--all-connected'))throw Error('Choose companies or --all-connected');
for(const arg of args)if(arg!=='--all-connected'&&!arg.startsWith('--company=')&&!arg.startsWith('--report='))throw Error('Unknown argument');
const pool=new Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect();
try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw Error('Invalid schema');
 await db.query(`SET LOCAL search_path TO "${schema}"`);
 const companies=(await db.query('SELECT c.id,c.name FROM companies c JOIN accountant_v2_user_settings s ON s.company_id=c.id WHERE s.enabled AND ($1::boolean OR c.id=ANY($2::text[])) ORDER BY c.id',[args.includes('--all-connected'),ids])).rows;
 if(!companies.length||ids.some(id=>!companies.some(c=>c.id===id)))throw Error('Choose enabled staff-accounting companies');
 const report={readOnly:true,companies:[]};
 for(const c of companies)report.companies.push({company:c.name,companyId:c.id,...await verifyUserAccounting(db,c.id)});
 await db.query('ROLLBACK');
 const file=args.find(a=>a.startsWith('--report='))?.slice(9);if(file)writeFileSync(file,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));if(report.companies.some(c=>!c.passed))process.exitCode=2;
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
