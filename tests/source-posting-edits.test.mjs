import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Exercise the migration's actual PL/pgSQL string transformations using an
// embedded engine. Only an anonymous block/string operations run: no tables,
// schemas, stored functions, migrations, source data or network connections.
const migration=readFileSync('prisma/migrations/20261022180000_source_posting_edits/migration.sql','utf8');
const fixtures=[
 ['accountant_v2_sync_erp', 'prisma/migrations/20261001130000_ecommerce_accounting/migration.sql','prev.journal_id','erp-post'],
 ['accountant_v2_sync_distributor','prisma/migrations/20260927120000_distributor_accounting/migration.sql','prev.journal_id','posting'],
 ['accountant_v2_sync_user','prisma/migrations/20260930130000_user_accounting/migration.sql','prev.journal_id','user-post'],
 ['accountant_v2_post_ecommerce','prisma/migrations/20261001130000_ecommerce_accounting/migration.sql','prior.journal_id','ecommerce-post'],
 ['accountant_v2_sync_unassigned_purchase','tests/fixtures/unassigned-purchase-before-source-edits.sql',"prev->>'journalId'",'source-po-post'],
];
function extract(name,path){
 const sql=readFileSync(path,'utf8').replaceAll('\r\n','\n');
 const start=sql.search(new RegExp('CREATE (?:OR REPLACE )?FUNCTION '+name+'\\('));
 assert.ok(start>=0,name);
 const end=sql.indexOf('END $$;',start);assert.ok(end>start);
 return sql.slice(start,end+7);
}
const inputs=fixtures.map(([name,path,pointer,suffix])=>({name,previous_journal:pointer,posting_suffix:suffix,optional:false,definition:extract(name,path)}));
// Mimic installed account-selection/baseline patches: the migration must keep
// arbitrary surrounding financial logic, rather than loading stale functions.
for(const x of inputs)x.definition=x.definition.replace('BEGIN\n',"BEGIN\n PERFORM pg_advisory_xact_lock(hashtext('keep-native-account-mapping'));\n");
const output=[];
const db=new PGlite();
const run=sql=>db.exec(sql,{onNotice:n=>output.push(n.message)});
function instrument(rows){
 let sql=migration.replace(/FOR spec IN SELECT \* FROM \(VALUES[\s\S]+?AS functions\([^\n]+\)\n LOOP/,
  ()=>`FOR spec IN SELECT * FROM jsonb_to_recordset('${JSON.stringify(rows).replaceAll("'","''")}'::jsonb) AS functions(name text,previous_journal text,posting_suffix text,optional boolean,definition text)\n LOOP`);
 const start=sql.indexOf('  signature:=to_regprocedure(spec.name);');
 const end=sql.indexOf("  IF strpos(definition,'source-posting-edits-v1')",start);
 assert.ok(start>=0&&end>start);
 sql=sql.slice(0,start)+"  definition:=replace(spec.definition, E'\\r\\n', E'\\n');\n"+sql.slice(end);
 sql=sql.replace('  EXECUTE definition;',"  RAISE NOTICE '%',definition;");
 assert.ok(!sql.includes('EXECUTE definition'));assert.ok(!sql.includes('pg_get_functiondef('));
 return sql;
}
try{
 await run("DO $$ BEGIN RAISE NOTICE 'engine-ready'; END $$;");assert.equal(output.pop(),'engine-ready');
 const pattern="rid:='c'\\|\\|substr\\(md5\\([^;]+?;(.|\\n)*?(?=\\n[ ]*END IF;)";
 for(const x of inputs){const v=await db.query("SELECT count(*)::int AS n FROM regexp_matches($1,$2,'g')",[x.definition,pattern]);assert.equal(v.rows[0].n,1,x.name+' reversal match');}
 for(const input of inputs)await run(instrument([input]));assert.equal(output.length,5);
 for(let i=0;i<inputs.length;i++){
  const updated=output[i],input=inputs[i];
  assert.ok(updated.includes('source-posting-edits-v1'),input.name);
  assert.ok(updated.includes(`jid:=COALESCE(${input.previous_journal},`),input.name);
  assert.ok(updated.includes(`jid:=${input.previous_journal};`),input.name+' keeps withdrawn pointer');
  assert.ok(!/rid:='c'/.test(updated),input.name+' removes automatic reversal');
  assert.equal((updated.match(/ON CONFLICT\(id\) DO UPDATE SET/g)||[]).length,2);
  assert.equal((updated.match(/deleted_at=NULL/g)||[]).length,2);
  assert.ok(updated.includes('WHERE accountant_v2_manual_journals.company_id=EXCLUDED.company_id'));
  assert.ok(updated.includes('WHERE accountant_v2_manual_journal_lines.company_id=EXCLUDED.company_id'));
  assert.ok(!/entry_number=EXCLUDED|created_at=EXCLUDED|company_id=EXCLUDED.*SET/.test(updated));
  assert.ok(updated.includes('Missing or foreign current source journal'));
  assert.ok(updated.includes('accountant_v2_distributor_check_date(c,oldj.journal_date'));
  assert.ok(updated.includes("keep-native-account-mapping"));
  assert.ok(updated.includes((input.name.includes('post_ecommerce')?'prior':'prev')+(input.name.includes('unassigned')?"->'signature'=sig":".signature=sig")));
  // Compile the transformed PL/pgSQL as an anonymous, unreachable block. This
  // checks syntax without creating stored functions or resolving/executing any
  // financial SQL. Composite table types become RECORD for this syntax probe.
  const begin=updated.indexOf('\nBEGIN\n');
  const declarations=updated.slice(updated.indexOf('DECLARE')+7,begin)
   .replace(/\b(?:accountant_v2_[a-z_]+|purchase_orders|user_ledger_entries|salary_payments|money_transactions)\b/g,'record');
  const body=updated.slice(begin+7,updated.lastIndexOf('END $$;'))
   .replace(/RETURN [^;]+;/g,'RETURN;');
  const parameters=input.name.includes('post_ecommerce')
   ? 'c text;k text;d timestamp;rows jsonb;mappings jsonb;metadata jsonb;'
   : input.name.includes('unassigned') ? 'c text;pid text;'
   : input.name.includes('distributor') ? 'c text;supplier text;'
   : input.name.includes('sync_erp') ? 'c text;kind text;sid text;force_import boolean;'
   : 'c text;sid text;';
  await run(`DO $syntax$ DECLARE ${parameters}\n${declarations}\nBEGIN IF false THEN\n${body}\nEND IF;END $syntax$;`);
 }
 const first=output.splice(0);
 await run(instrument(inputs.map((x,i)=>({...x,definition:first[i]}))));assert.equal(output.length,0,'repeat upgrade is a no-op');
 // PGlite's Windows build cannot unwind an exception inside a cursor loop.
 // Observe the same fail-closed branches without asking it to abort the portal.
 for(const bad of [inputs[0].definition.replace("':erp-post'","':unknown-post'"),inputs[0].definition.replace('rid:=','unexpected:=')]){
  const probe=instrument([{...inputs[0],definition:bad}]).replace(/RAISE EXCEPTION ('Unknown [^;]+);/g,'RAISE NOTICE $1; RETURN;');
  await run(probe);assert.match(output.pop(),/^Unknown /);assert.equal(output.length,0);
 }
 // Older ERP definitions remain upgradeable when ecommerce is not installed.
 const older={...inputs[0],definition:extract('accountant_v2_sync_erp','prisma/migrations/20260927170000_erp_party_links/migration.sql')};
 await run(instrument([older]));assert.equal(output.length,1);
 assert.ok(output[0].includes("'sourceNote'"));
 output.length=0;
 await run(instrument([{...inputs[4],definition:extract('accountant_v2_sync_unassigned_purchase','scripts/production-accounting/lib/purchase-order-authority.sql')}]));
 assert.equal(output.length,0,'purchase authority reinstalls the new policy, not the old reversal behavior');
 console.log('Source posting edits: 5 posting families, older ERP, stable identity, withdrawal/restore pointers, tenant guards, retained locks/custom logic, idempotency and unknown-body rejection passed. No schema/data changes or network.');
}catch(error){console.error('Source posting test:',error.message,error.where||'');process.exitCode=1;}
finally{try{await db.close();}catch(error){console.error('Embedded engine shutdown:',error.message);}}
