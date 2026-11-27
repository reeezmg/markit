import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { createEvent, readBody } from 'h3'
import handler from '../server/api/crm/[...path]'
import { pool } from '../server/db'
import { prisma } from '../server/prisma'

// Local browser integration bridge, supplied administrator session; no login bypass
// is installed in the app. Only binds loopback and only writes labelled QA records.
const url=new URL(process.env.DATABASE_URL!);if(url.hostname.endsWith('.neon.tech')){url.hostname=url.hostname.replace('-pooler','');pool.options.connectionString=url.toString()}
pool.options.connectionTimeoutMillis=15000
const manifest=path.resolve(process.argv[2]||''),report=JSON.parse(readFileSync(manifest,'utf8'))
assert(report.status==='PASSED'&&report.companyName==='Blue Nest'&&report.prefix.startsWith('CRM-QA-'))
const companyId=report.companyId
const member=(await pool.query("SELECT user_id,role FROM company_users WHERE company_id=$1 AND status AND NOT deleted AND role::text IN('admin','manager') LIMIT 1",[companyId])).rows[0]
assert(member)
const company=(await pool.query('SELECT name FROM companies WHERE id=$1 AND status',[companyId])).rows[0]
assert.equal(company?.name,report.companyName)
const backup:any={at:new Date().toISOString(),companyId,records:{}}
for(const table of ['crm_settings','crm_deals','crm_activities','company_clients'])backup.records[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE company_id=$1`,[companyId])).rows.map(r=>r.row)
writeFileSync(path.join(path.dirname(report.backup),'before-browser-'+Date.now()+'.json'),JSON.stringify(backup,null,2))
;(globalThis as any).requireAuthSession=async()=>({data:{id:member.user_id,companyId,role:member.role}})
const server=createServer(async(req,res)=>{
  try{
    if(req.url==='/qa/context'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...report,actorId:member.user_id}));return}
    assert(req.url?.startsWith('/api/crm/'),'Only CRM routes are exposed')
    assert.equal(req.headers['x-company-id'],companyId)
    const event=createEvent(req,res);event.context.authorizedCompanyIds=Promise.resolve([companyId])
    if(req.method!=='GET'){
      const body=await readBody(event)
      const resource=req.url!.split('/')[3],id=req.url!.split('/')[4]
      assert(['deals','activities'].includes(resource),'Browser test writes only QA deals and activities')
      assert(String(resource==='deals'?body.name:body.subject).startsWith(report.prefix),'New or edited records must retain this QA batch label')
      if(body.clientId)assert(report.records.clients.some((c:any)=>c.id===body.clientId),'Only QA clients may be linked')
      if(id){const table=resource==='deals'?'crm_deals':'crm_activities',label=resource==='deals'?'name':'subject';const row=(await pool.query(`SELECT ${label} AS label FROM ${table} WHERE company_id=$1 AND id=$2`,[companyId,id])).rows[0];assert(row?.label.startsWith(report.prefix),'Only this QA batch may be edited')}
    }
    const value=await handler(event)
    if(req.method!=='GET'){
      if(value?.id){const key=req.url!.includes('/deals')?'deals':'activities';if(!report.records[key].includes(value.id))report.records[key].push(value.id)}
      report.browserWrites=(report.browserWrites||0)+1;writeFileSync(manifest,JSON.stringify(report,null,2))
    }
    if(!res.headersSent)res.setHeader('Content-Type',typeof value==='string'?'text/csv':'application/json')
    res.end(typeof value==='string'?value:JSON.stringify(value))
  }catch(e:any){res.statusCode=e.statusCode||400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({statusMessage:e.statusMessage||e.message}))}
})
server.listen(0,'127.0.0.1',()=>console.log('CRM_LIVE_BRIDGE=http://127.0.0.1:'+(server.address() as any).port))
process.on('SIGINT',async()=>{server.close();await pool.end();await prisma.$disconnect();process.exit()})
