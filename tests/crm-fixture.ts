import { defaultCrmSettings } from '../utils/crm'

/** Isolated DML adapter. No network, database, schemas or provider sends. */
export function crmFixture(){
  let state:any={settings:null,version:0,ready:true,counter:1,tables:{crm_deals:[],crm_activities:[],crm_audit:[],crm_document_links:[]},documents:{quotes:[],bills:[],sales_orders:[]},clients:[],memberships:[],notifications:[]},backup:any
  const staff=[{id:'manager',name:'Manager',role:'manager'},{id:'sales',name:'Sales rep',role:'user'},{id:'other',name:'Other rep',role:'user'}]
  const result=(rows:any[]=[])=>({rows,rowCount:rows.length})
  function split(text:string){const parts:string[]=[];let start=0,depth=0,quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==="'"){if(quoted&&text[i+1]==="'"){i++;continue}quoted=!quoted}if(!quoted){if(c==='(')depth++;if(c===')')depth--;if(c===','&&!depth){parts.push(text.slice(start,i).trim());start=i+1}}}parts.push(text.slice(start).trim());return parts}
  function literal(token:string,args:any[]){const bind=token.match(/^\$(\d+)/);if(bind){const value=args[Number(bind[1])-1];if(token.includes('interval'))return new Date(Date.now()+Number(value)*86400000).toISOString();if(token.includes('jsonb')&&typeof value==='string')return JSON.parse(value);return value}if(token.includes('now()'))return new Date().toISOString();if(token==='NULL')return null;if(token==='true')return true;if(token==='false')return false;const s=token.match(/^'(.*)'$/s);return s?s[1]==='{}'?[]:s[1]:Number(token)}
  const same=(row:any,company:string,id?:string)=>row.company_id===company&&(!id||row.id===id)
  async function query(sql:string,args:any[]=[]):Promise<any>{
    if(/^\s*(CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql))throw Error('Schema/destructive SQL is forbidden in CRM tests')
    if(sql.startsWith('BEGIN')){backup=structuredClone(state);return result()}
    if(sql==='COMMIT'){backup=undefined;return result()}
    if(sql==='ROLLBACK'){if(backup)state=backup;backup=undefined;return result()}
    if(sql.includes('pg_advisory')||sql.includes('pg_try_advisory'))return result([{locked:true}])
    if(sql.includes('AS ready')&&sql.includes('to_regclass'))return result([{ready:state.ready}])
    if(sql.includes('SELECT currency FROM companies'))return result([{currency:'INR'}])
    if(sql.includes('FROM company_users')){
      if(sql.startsWith('SELECT user_id FROM'))return result(staff.filter(r=>r.id===args[1]).map(r=>({user_id:r.id})))
      if(sql.startsWith('SELECT role '))return result(staff.filter(r=>r.id===args[1]).map(r=>({role:r.role})))
      return result(staff)
    }
    if(sql.includes('SELECT settings,version'))return result(state.settings?[{settings:state.settings,version:state.version}]:[])
    if(sql.startsWith('SELECT id,deal_id,kind,document_id FROM crm_document_links'))return result(state.tables.crm_document_links.filter((r:any)=>r.company_id===args[0]&&r.id>args[1]&&r.kind===args[2]).sort((a:any,b:any)=>a.id.localeCompare(b.id)).slice(0,200))
    if(sql.startsWith('SELECT changes FROM crm_audit'))return result(state.tables.crm_audit.filter((r:any)=>r.company_id===args[0]&&r.entity_type==='sales-rule'&&r.entity_id===args[1]).slice(-1))
    const documentTable=sql.match(/FROM (quotes|bills|sales_orders) WHERE company_id=\$1 AND id=\$2/)
    if(documentTable)return result(state.documents[documentTable[1]].filter((r:any)=>r.company_id===args[0]&&r.id===args[1]))
    if(sql.includes('SELECT preference_value FROM general_preferences'))return result([{preference_value:{includeAfterSales:true,includeInvoicing:true}}])
    if(sql.startsWith('INSERT INTO crm_settings')){state.settings=JSON.parse(args[1]);state.version++;return result()}
    if(sql.startsWith('SELECT DISTINCT pipeline_key'))return result(state.tables.crm_deals.filter((r:any)=>r.company_id===args[0]).map((r:any)=>({pipeline_key:r.pipeline_key,stage_key:r.stage_key,status:r.status})))
    if(sql.startsWith('UPDATE companies SET client_counter'))return result([{number:state.counter++}])
    if(sql.startsWith('UPDATE company_clients SET crm_data=')){
      const m=state.memberships.find((r:any)=>r.company_id===args[0]&&r.client_id===args[1]&&(r.crm_version||0)===args[2]&&r.status!==false)
      if(!m)return result();m.crm_data=JSON.parse(args[3]);m.crm_version=(m.crm_version||0)+1;return result([{client_id:m.client_id}])
    }
    if(sql.includes('cc.crm_version AS version')){
      let rows=state.memberships.filter((m:any)=>m.company_id===args[0]).flatMap((m:any)=>{
        const c=state.clients.find((c:any)=>c.id===m.client_id&&!c.deleted);if(!c)return []
        const d=m.crm_data||{};return [{id:c.id,client_id:c.id,company_id:m.company_id,name:c.name,email:c.email||'',phone:c.phone,owner_id:d.ownerId||'',job_title:d.jobTitle||'',lifecycle:d.lifecycle||(m.pipeline_status==='close'?'CUSTOMER':'LEAD'),lead_status:d.leadStatus||'NEW',source:d.source||'Other',tags:d.tags||[],custom_fields:d.customFields||{},description:d.description||'',archived:m.status===false,version:m.crm_version||0,created_by:d.createdBy||'',created_at:d.createdAt||null,updated_at:d.updatedAt||d.createdAt||null,converted_at:d.convertedAt||null}]
      })
      if(sql.includes('r.id=$2'))rows=rows.filter((r:any)=>r.id===args[1])
      for(const match of sql.matchAll(/r\.(archived|owner_id|lifecycle|lead_status|source)=\$(\d+)/g))rows=rows.filter((r:any)=>r[match[1]]===args[Number(match[2])-1])
      if(sql.includes('count(*)::int AS count'))return result([{count:rows.length}])
      return result(rows.map((r:any)=>({...r,owner_name:staff.find(s=>s.id===r.owner_id)?.name})))
    }
    if(sql.startsWith('INSERT INTO clients')){state.clients.push({id:args[0],name:args[1],email:args[2],phone:args[3],deleted:false});return result()}
    if(sql.startsWith('INSERT INTO company_clients')){state.memberships.push({company_id:args[0],client_id:args[1]});return result()}
    if(sql.startsWith('SELECT client_id FROM company_clients'))return result(state.memberships.filter((r:any)=>r.company_id===args[0]&&r.client_id===args[1]))
    if(sql.includes('FROM clients WHERE phone='))return result(state.clients.filter((r:any)=>r.phone===args[0]))
    if(sql.includes('FROM clients WHERE lower(email)'))return result(state.clients.filter((r:any)=>r.email?.toLowerCase()===args[0]?.toLowerCase()))
    if(sql.includes('FROM clients c JOIN company_clients')||sql.includes('FROM company_clients cc JOIN clients'))return result(state.clients.filter((r:any)=>state.memberships.some((m:any)=>m.company_id===args[0]&&m.client_id===r.id)&&(!args[1]||sql.includes('ILIKE')||r.id===args[1]||Array.isArray(args[1])&&args[1].includes(r.id))))
    if(sql.startsWith('INSERT INTO notifications')){state.notifications.push({id:args[0],company_id:args[1],message:args[2]});return result()}
    if(sql.startsWith('UPDATE crm_')){
      const table=sql.match(/^UPDATE (\w+)/)![1]
      if(sql.includes('AND client_id=$2')){const moved=state.tables[table].filter((r:any)=>r.company_id===args[0]&&r.client_id===args[1]);for(const row of moved){row.client_id=args[2];row.version++}return result(moved.map((r:any)=>({id:r.id})))}
      const row=state.tables[table]?.find((r:any)=>same(r,args[0],args[1]))
      if(!row)return result();if(sql.includes('AND version=$3')&&row.version!==args[2])return result()
      const old={...row},assignments=split(sql.slice(sql.indexOf(' SET ')+5,sql.indexOf(' WHERE ')))
      for(const assignment of assignments){const [column,...right]=assignment.split('='),expression=right.join('=');if(expression.startsWith('$')||['true','false','NULL'].includes(expression)||/^'[^']*'$/.test(expression))row[column]=literal(expression,args);else if(column==='version')row.version++;else if(expression==='now()')row[column]=new Date().toISOString();else if(column==='converted_at'&&expression.startsWith('coalesce'))row.converted_at=old.converted_at||args[7];else if(column==='lifecycle'&&expression.startsWith('CASE'))row.lifecycle=old.client_id?'CONTACT':old.lifecycle}
      if(sql.includes('closed_at=CASE'))row.closed_at=row.status==='OPEN'?null:old.closed_at||new Date().toISOString()
      if(sql.includes('completed_at=CASE'))row.completed_at=row.status==='DONE'?old.completed_at||new Date().toISOString():null
      return result([row])
    }
    if(sql.startsWith('INSERT INTO crm_')){
      const match=sql.match(/^INSERT INTO (\w+)\(([^)]+)\)\s*VALUES\(([\s\S]+)\)(?:\s*ON CONFLICT[\s\S]*)?$/)!
      if(!match)throw Error('Unparsed CRM insert '+sql)
      const [,table,columns]=match,valuesText=sql.slice(sql.indexOf('VALUES(')+7),end=valuesText.lastIndexOf(') ON CONFLICT')>=0?valuesText.lastIndexOf(') ON CONFLICT'):valuesText.lastIndexOf(')')
      const values=split(valuesText.slice(0,end)),row:any={archived:false,version:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),status:table==='crm_activities'?'OPEN':undefined,attachments:[],tags:[],description:'',custom_fields:{}}
      columns.split(',').forEach((column,i)=>row[column.trim()]=literal(values[i],args))
      if(row.recurrence_key&&state.tables[table].some((r:any)=>r.company_id===row.company_id&&r.recurrence_key===row.recurrence_key))return result()
      state.tables[table].push(row);return result([row])
    }
    if(sql.startsWith('SELECT')&&sql.includes('FROM crm_')){
      const table=sql.match(/FROM (crm_\w+)/)![1];let rows=state.tables[table].filter((r:any)=>r.company_id===args[0])
      const segment=sql.match(/r\.attachments->>'segmentKey'=\$(\d+)/)
      if(segment)rows=rows.filter((r:any)=>r.attachments?.segmentKey===args[Number(segment[1])-1])
      if(sql.includes('WHERE r.company_id=$1 AND r.id=$2'))rows=rows.filter((r:any)=>r.id===args[1])
      else if(sql.includes('id<>$2'))rows=rows.filter((r:any)=>r.id!==args[1]&&((args[2]&&r.email===args[2])||(args[3]&&r.phone===args[3])||(args[4]&&r.client_id===args[4])))
      else if(sql.includes('AND client_id=$2 AND id<>$3'))rows=rows.filter((r:any)=>r.client_id===args[1]&&r.id!==args[2])
      else if(sql.includes('lower(email)=lower($2)'))rows=rows.filter((r:any)=>(args[1]&&r.email===args[1])||(args[2]&&r.phone===args[2]))
      else if(sql.includes('SELECT a.id,a.subject'))rows=rows.filter((r:any)=>r.status==='OPEN'&&!r.archived&&r.due_at&&Date.parse(r.due_at)<=Date.now()+3600000&&!r.reminded_at&&r.kind!=='NOTE')
      else {
        for(const match of sql.matchAll(/r\.(archived|owner_id|lifecycle|lead_status|source|pipeline_key|stage_key|status|kind|priority|client_id|deal_id)=\$(\d+)/g))rows=rows.filter((r:any)=>r[match[1]]===args[Number(match[2])-1])
        if(sql.includes('a.entity_type=$2'))rows=rows.filter((r:any)=>r.entity_type===args[1]&&r.entity_id===args[2])
        if(sql.includes('SELECT * FROM crm_activities')&&args[1])rows=rows.filter((r:any)=>r[sql.match(/AND (client_id|deal_id)=\$2/)![1]]===args[1])
      }
      if(sql.includes('count(*)::int AS count'))return result([{count:rows.length}])
      return result(rows.map((r:any)=>({...r,owner_name:staff.find(s=>s.id===r.owner_id)?.name})))
    }
    throw Error('Unhandled CRM test SQL: '+sql)
  }
  function seedClient(company='a',id='alex',details:any={}){
    if(!state.clients.some((c:any)=>c.id===id))state.clients.push({id,name:'Alex',email:'alex@example.com',phone:'+919876543210',deleted:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...details})
    state.memberships.push({company_id:company,client_id:id,status:true,pipeline_status:'new',points:42,crm_data:{},crm_version:0,marketing_opt_in_at:null});return id
  }
  return {query,seedClient,release(){},staff,get state(){return state},defaultSettings:defaultCrmSettings()}
}
