import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { Pool } from 'pg'
const file=process.argv[2],report=JSON.parse(readFileSync(file,'utf8')),backup=JSON.parse(readFileSync(report.backup,'utf8'))
assert.equal(report.companyId,backup.companyId)
const url=new URL(process.env.DATABASE_URL!)
if(url.hostname.endsWith('.neon.tech'))url.hostname=url.hostname.replace('-pooler','')
const pool=new Pool({connectionString:url.toString(),connectionTimeoutMillis:15000,query_timeout:60000,max:1})
try{
  let db:any
  for(let attempt=0;;attempt++){try{db=await pool.connect();break}catch(error){if(attempt>=3)throw error;console.log('Retrying read-only verification connection '+(attempt+1))}}
  try{
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    assert.equal((await db.query('SELECT name FROM companies WHERE id=$1',[report.companyId])).rows[0]?.name,report.companyName)
    for(const [table,rows] of Object.entries(backup.tables) as any){
      const current=(await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE company_id=$1`,[report.companyId])).rows.map(r=>r.row)
      for(const row of rows){const key=table==='company_clients'?'client_id':table==='crm_settings'?'company_id':'id';assert.deepEqual(current.find(r=>r[key]===row[key]),row,table+' original changed')}
    }
    const concurrentAdditions:any[]=[],externalBills:string[]=[]
    for(const [table,rows] of Object.entries(backup.protected) as any){
      const current=(await db.query(`SELECT id,md5(to_jsonb(t)::text) AS hash FROM ${table} t WHERE company_id=$1`,[report.companyId])).rows
      const additions=current.filter(r=>!rows.some((old:any)=>old.id===r.id))
      if(['quotes','sales_orders'].includes(table)){
        const known=report.records.documents.filter((d:any)=>d.kind===(table==='quotes'?'QUOTE':'SALES_ORDER')).map((d:any)=>d.id)
        for(const added of additions.filter(r=>!known.includes(r.id))){const numberColumn=table==='quotes'?'quote_number':'order_number';const row=(await db.query(`SELECT ${numberColumn} AS number FROM ${table} WHERE company_id=$1 AND id=$2`,[report.companyId,added.id])).rows[0];assert(!row.number.startsWith(report.prefix),'Untracked QA document must be reconciled');concurrentAdditions.push({table,id:added.id,number:row.number,reason:'Outside harness-created document IDs and numbering'})}
      }else if(table==='bills'){
        for(const added of additions){const row=(await db.query("SELECT client_id,to_jsonb(t)->>'quote_id' AS quote_id,to_jsonb(t)->>'sales_order_id' AS order_id FROM bills t WHERE company_id=$1 AND id=$2",[report.companyId,added.id])).rows[0];assert(!report.records.clients.some((c:any)=>c.id===row.client_id),'Unexpected invoice for a QA client');assert(!report.records.documents.some((d:any)=>d.id===row.quote_id||d.id===row.order_id),'Unexpected invoice for a QA source');externalBills.push(added.id);concurrentAdditions.push({table,id:added.id,reason:'Non-QA client; no link to harness quotations/orders'})}
      }else if(table==='entries'){
        for(const added of additions){const row=(await db.query('SELECT bill_id FROM entries WHERE company_id=$1 AND id=$2',[report.companyId,added.id])).rows[0];assert(externalBills.includes(row.bill_id),'Unexpected entry outside the identified concurrent invoice');concurrentAdditions.push({table,id:added.id,billId:row.bill_id,reason:'Belongs to identified concurrent non-QA invoice'})}
      }else assert.equal(current.length,rows.length,table+' record count changed')
      for(const row of rows)assert.equal(current.find(r=>r.id===row.id)?.hash,row.hash,table+' original changed')
    }
    const labelledActivities=(await db.query('SELECT id FROM crm_activities WHERE company_id=$1 AND subject LIKE $2',[report.companyId,'%'+report.prefix+'%'])).rows.map((r:any)=>r.id)
    report.generatedOrRecoveredActivityIds=labelledActivities.filter((id:string)=>!report.records.activities.includes(id))
    report.records.activities=[...new Set([...report.records.activities,...labelledActivities])]
    for(const [key,table] of [['deals','crm_deals'],['activities','crm_activities']]){
      const ids=report.records[key];assert.equal(Number((await db.query(`SELECT count(*) AS count FROM ${table} WHERE company_id=$1 AND id=ANY($2::text[])`,[report.companyId,ids])).rows[0].count),ids.length)
    }
    for(const [kind,table] of [['QUOTE','quotes'],['SALES_ORDER','sales_orders']]){const ids=report.records.documents.filter((d:any)=>d.kind===kind).map((d:any)=>d.id);assert.equal(Number((await db.query(`SELECT count(*) AS count FROM ${table} WHERE company_id=$1 AND id=ANY($2::text[])`,[report.companyId,ids])).rows[0].count),ids.length)}
    const clients=report.records.clients.map((c:any)=>c.id)
    assert.equal(Number((await db.query('SELECT count(*) AS count FROM company_clients WHERE company_id=$1 AND client_id=ANY($2::text[])',[report.companyId,clients])).rows[0].count),clients.length)
    const settings=(await db.query('SELECT settings FROM crm_settings WHERE company_id=$1',[report.companyId])).rows[0].settings
    assert(settings.salesRules.filter((r:any)=>r.key.startsWith('qa_'+report.batch.replaceAll('-','').slice(0,12))).every((r:any)=>!r.enabled),'QA rules must be disabled at rest')
    const counts=(await db.query(`SELECT
      (SELECT count(*) FROM crm_deals WHERE company_id=$1 AND name LIKE $2) AS deals,
      (SELECT count(*) FROM crm_activities WHERE company_id=$1 AND (subject LIKE $3 OR client_id=ANY($4::text[]))) AS activities,
      (SELECT count(*) FROM crm_document_links WHERE company_id=$1 AND deal_id=ANY($5::text[])) AS document_links`,[report.companyId,report.prefix+'%','%'+report.prefix+'%',clients,report.records.deals])).rows[0]
    await db.query('COMMIT')
    report.verification={status:'PASSED',at:new Date().toISOString(),originalsUnchanged:true,noQaInvoices:true,concurrentAdditions,clients:clients.length,...Object.fromEntries(Object.entries(counts).map(([key,value])=>[key,Number(value)]))}
    writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify(report.verification))
  }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
}finally{await pool.end()}
