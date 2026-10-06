import dotenv from 'dotenv';
import {Pool} from 'pg';
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, openSync, closeSync, unlinkSync} from 'node:fs';
import {resolve, dirname, join, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stages, migrations, validateConfig, targetIdentity, digest, commandsFor} from './plan.mjs';

const folder = dirname(fileURLToPath(import.meta.url));
const root = resolve(folder, '../..');
dotenv.config({path:join(root,'.env'),quiet:true});
const args = process.argv.slice(2), value = k => args.find(a => a.startsWith(`--${k}=`))?.slice(k.length+3);
if (args.includes('--help')) {
  console.log('node scripts/production-accounting/run.mjs --config=<file> [--apply | --preview=<stage> | --verify]\nDefault: read-only preflight and plan. --apply executes/resumes every stage. See README.md.');
  process.exit(0);
}
for (const a of args) if (!['--apply','--verify'].includes(a) && !['config','preview'].some(k=>a.startsWith(`--${k}=`))) throw Error('Unknown option '+a);
if ([args.includes('--apply'),args.includes('--verify'),Boolean(value('preview'))].filter(Boolean).length>1) throw Error('Choose apply, preview or verify');
if (!value('config')) throw Error('--config=<file> is required');
const configFile=resolve(value('config')),config=validateConfig(JSON.parse(readFileSync(configFile,'utf8')));
const output=resolve(dirname(configFile),config.output),review=config.cashReview ? resolve(dirname(configFile),config.cashReview) : null;
const apply=args.includes('--apply'), preview=value('preview');
if (preview && (!stages.includes(preview) || ['schema','verify'].includes(preview))) throw Error('Preview supports setup, distributors, cash-bank, erp-history, transactions, transfers, staff-setup or stock');
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL}), db=await pool.connect();
let lockFd,locked=false;
const lockFile=join(output,'runner.lock'),stateFile=join(output,'state.json');
const saveState=state=>{writeFileSync(stateFile+'.tmp',JSON.stringify(state,null,2));renameSync(stateFile+'.tmp',stateFile);};
try {
  await db.query('BEGIN READ ONLY');
  const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw Error('Invalid schema');
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  const companies=(await db.query('SELECT id,name FROM companies WHERE id=ANY($1::text[]) ORDER BY id',[config.companies])).rows;
  if(companies.length!==config.companies.length) throw Error('One or more company IDs do not exist in this database');
  const tracked=(await db.query("SELECT to_regclass('_prisma_migrations') present")).rows[0].present;
  const installed=tracked?(await db.query('SELECT migration_name,checksum FROM _prisma_migrations WHERE migration_name=ANY($1::text[]) AND finished_at IS NOT NULL AND rolled_back_at IS NULL',[migrations])).rows:[];
  for(const m of installed){
    const sql=readFileSync(join(root,'prisma/migrations',m.migration_name,'migration.sql'),'utf8');
    if(digest(m.migration_name===migrations[0]?sql.replace(/^\uFEFF/,''):sql)!==m.checksum)throw Error('Installed migration differs: '+m.migration_name);
  }
  await db.query('ROLLBACK');
  console.log(JSON.stringify({mode:apply?'apply':preview?'preview':args.includes('--verify')?'verify':'plan',companies,through:config.through,missingMigrations:migrations.filter(m=>!installed.some(i=>i.migration_name===m)),stages},null,2));
  if(!apply&&!preview&&!args.includes('--verify'))process.exitCode=0;
  else {
    if(!apply && installed.length!==migrations.length)throw Error('Schema is not ready. Apply the ordered schema stage using the full runner first.');
    mkdirSync(output,{recursive:true});
    lockFd=openSync(lockFile,'wx');locked=true;writeFileSync(lockFd,JSON.stringify({pid:process.pid,started:new Date().toISOString()}));
    const binding={target:targetIdentity(process.env.DATABASE_URL),companies:[...config.companies].sort(),through:config.through};
    let state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{binding,completed:{}};
    if(JSON.stringify(state.binding)!==JSON.stringify(binding))throw Error('Run directory belongs to a different database, company set or cutoff');
    // Validate completed artifacts before skipping any stage, especially the cash import.
    for(const [stage,entry] of Object.entries(state.completed))if(stage!=='verify' && entry.report && (!existsSync(resolve(output,entry.report))||digest(readFileSync(resolve(output,entry.report)))!==entry.hash))throw Error('Completed report missing or changed: '+stage);
    for(const stage of (preview?[preview]:args.includes('--verify')?['verify']:stages)) {
      if(apply && stage!=='verify' && state.completed[stage] && !(stage==='schema' && installed.length!==migrations.length)){console.log('Already completed: '+stage);continue;}
      const report=join(output,`${stage}-${preview?'preview':stage==='verify'?'verification':'import'}.json`);
      // Once ERP supersession exists, the old cash importer cannot be replayed.
      if(stage==='cash-bank'){
        await db.query('BEGIN READ ONLY');await db.query(`SET LOCAL search_path TO "${schema}"`);
        const superseded=await db.query("SELECT 1 FROM accountant_v2_manual_journals WHERE company_id=ANY($1::text[]) AND source_type IN ('ERP_HISTORY_MIGRATION_REVERSAL','TRANSFER_HISTORY_MIGRATION_REVERSAL') LIMIT 1",[config.companies]);
        await db.query('ROLLBACK');
        if(superseded.rowCount)throw Error('ERP history already superseded cash imports. Resume with the original run directory; do not rerun cash history. --verify is available independently.');
      }
      console.log('Running: '+stage);
      for(const [script,...params] of commandsFor(stage,config,apply,report,review)){
        if(stage==='verify')params.push(`--cash-report=${join(output,'cash-bank-import.json')}`,`--erp-report=${join(output,'erp-history-import.json')}`);
        const child=spawnSync(process.execPath,[...(script.endsWith('.ts')?['--import','tsx']:[]),join(folder,script),...params],{cwd:root,env:process.env,stdio:'inherit',shell:false});
        if(child.error||child.status!==0)throw Error(`Stage ${stage} failed; earlier completed stages remain committed. Fix the reported source issue and rerun the same command. Exit ${child.status}`);
      }
      if(apply){
        if(stage==='schema')writeFileSync(report,JSON.stringify({migrations,applied:true},null,2));
        const result=JSON.parse(readFileSync(report,'utf8'));
        if(stage!=='verify' && result.applied!==true)throw Error('Stage did not confirm application: '+stage);
        if(stage==='verify' && !result.passed)throw Error('Final verification did not pass');
        state.completed[stage]={at:new Date().toISOString(),report:basename(report),hash:digest(readFileSync(report))};saveState(state);
      }
    }
    console.log(apply?'All accounting stages completed and verified.':preview?'Preview completed; its accounting changes were rolled back.':'Verification passed.');
  }
} finally {
  await db.query('ROLLBACK');db.release();await pool.end();
  if(locked){closeSync(lockFd);unlinkSync(lockFile);}
}
