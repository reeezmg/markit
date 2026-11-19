export const crmPages = [
  ['','Overview','i-heroicons-squares-2x2'],
  ['clients','Clients / leads','i-heroicons-users'],
  ['deals','Deals and pipeline','i-heroicons-view-columns'],['activities','Tasks and activities','i-heroicons-check-circle'],
  ['calendar','Calendar','i-heroicons-calendar-days'],['segments','Segments','i-heroicons-funnel'],
  ['reports','Reports','i-heroicons-chart-bar'],
  ['settings','CRM settings','i-heroicons-cog-6-tooth'],
] as const
export const crmClientLocation = (query:Record<string,any>={}) => ({path:'/client',query:{...query,from:'crm'}})
export const crmKinds = ['clients','accounts','deals','activities'] as const
export type CrmKind = typeof crmKinds[number]
export type CrmStage = { key:string; name:string; probability:number; status:'OPEN'|'WON'|'LOST' }
export const crmSalesEvents = [
  ['QUOTE_SENT','Quotation sent'],['QUOTE_ACCEPTED','Quotation accepted'],['QUOTE_DECLINED','Quotation declined'],['QUOTE_EXPIRED','Quotation expired'],
  ['SALES_ORDER_CONFIRMED','Sales order confirmed'],['SALES_ORDER_CLOSED','Sales order closed'],['SALES_ORDER_CANCELLED','Sales order cancelled'],
  ['INVOICE_PAID','Invoice fully paid'],['INVOICE_PAYMENT_PENDING','Invoice payment pending'],['INVOICE_CANCELLED','Invoice cancelled / deleted'],
] as const
export type CrmSalesRule={key:string;name:string;enabled:boolean;event:typeof crmSalesEvents[number][0];pipelineKey:string;fromStageKey:string;stageKey:string;forwardOnly:boolean;lossReason:string;revision?:string}
export type CrmSettings = ReturnType<typeof defaultCrmSettings>
export const crmManager = (role:string) => ['admin','manager'].includes(role)
export const crmStaff = (role:string) => ['admin','manager','user','biller','accountant'].includes(role)
export const crmDay = (date=new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)
export function defaultCrmSettings(){return {
  pipelines:[{key:'sales',name:'Sales pipeline',stages:[
    {key:'new',name:'New opportunity',probability:10,status:'OPEN'},{key:'qualified',name:'Qualified',probability:25,status:'OPEN'},
    {key:'proposal',name:'Proposal sent',probability:50,status:'OPEN'},{key:'negotiation',name:'Negotiation',probability:75,status:'OPEN'},
    {key:'won',name:'Won',probability:100,status:'WON'},{key:'lost',name:'Lost',probability:0,status:'LOST'},
  ] as CrmStage[]}],sources:['Walk-in','Website','Referral','Phone','WhatsApp','Campaign','Other'],tags:['VIP','Priority'],
  customFields:[] as {key:string;label:string;type:'TEXT'|'NUMBER'|'DATE'|'BOOLEAN';required:boolean}[],
  scoring:{email:10,phone:15,account:15,qualified:40},
  automations:{newLeadFollowUpDays:1,wonFollowUpDays:7,taskReminders:true},
  segments:[] as {key:string;name:string;filters:Record<string,string|number>}[],
  salesRules:[] as CrmSalesRule[],
}}
const fail=(message:string):never=>{throw Error(message)}
export function crmText(value:any,label:string,max=200,required=false){
  if(value==null)value=''
  if(typeof value!=='string'||value.trim().length>max||required&&!value.trim())fail(`Enter ${label}${required?' (required)':''}, up to ${max} characters.`)
  return value.trim()
}
export function crmNumber(value:any,label:string,min=0,max=1e12){
  if(value===''||value==null)value=0
  if(typeof value==='boolean'||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)fail(`Enter a valid ${label} between ${min} and ${max}.`)
  return Number(value)
}
function choice(value:any,allowed:readonly string[],label:string){if(!allowed.includes(value))fail('Choose a valid '+label+'.');return value as string}
export function crmDate(value:any,label:string){const date=crmText(value,label,10);if(!date)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)fail('Enter a valid '+label+'.');return date}
function instant(value:any,label:string){if(value==null||value==='')return null;const date=new Date(value);if(typeof value!=='string'||!Number.isFinite(+date))fail('Enter a valid '+label+'.');return date.toISOString()}
function email(value:any){const text=crmText(value,'email',254).toLowerCase();if(text&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))fail('Enter a valid email address.');return text}
export function crmPhone(value:any){const text=crmText(value,'phone',40);if(!text)return '';const phone=text.replace(/[\s().-]/g,'');if(!/^\+[1-9]\d{7,14}$/.test(phone))fail('Enter the phone with + and its country code, for example +919876543210.');return phone}
export function crmUrl(value:any){const text=crmText(value,'HTTPS link',2000);if(!text)return '';try{const url=new URL(text);if(url.protocol!=='https:'||url.username||url.password)fail('Use an HTTPS link without credentials.');return url.href}catch{fail('Use a valid HTTPS link.')}}
function tags(value:any){if(!Array.isArray(value)||value.length>30)fail('Choose up to 30 tags.');return [...new Set(value.map(tag=>crmText(tag,'tag',50,true)))] as string[]}
export function normalizeCrmSettings(value:any):CrmSettings{
  if(!value||typeof value!=='object'||Array.isArray(value))fail('Enter valid CRM settings.')
  const unique=(items:any[],label:string)=>{if(new Set(items.map(x=>x.key)).size!==items.length)fail(`Each ${label} needs a unique key.`)}
  const key=(v:any)=>{if(typeof v!=='string'||! /^[a-z][a-z0-9_-]{0,49}$/.test(v))fail('Keys must start with a letter and contain lowercase letters, numbers, _ or -.');return v}
  if(!Array.isArray(value.pipelines)||!value.pipelines.length||value.pipelines.length>20)fail('Create between 1 and 20 pipelines.')
  const pipelines=value.pipelines.map((p:any)=>{
    if(!Array.isArray(p.stages)||p.stages.length<3||p.stages.length>25)fail('A pipeline needs 3 to 25 stages, including open, won and lost stages.')
    const stages=p.stages.map((s:any)=>({key:key(s.key),name:crmText(s.name,'stage name',80,true),probability:Math.round(crmNumber(s.probability,'probability',0,100)),status:choice(s.status,['OPEN','WON','LOST'],'stage outcome') as CrmStage['status']}))
    unique(stages,'stage');for(const status of ['OPEN','WON','LOST'])if(!stages.some((s:any)=>s.status===status))fail('Each pipeline needs an open, won and lost stage.')
    for(const stage of stages)if(stage.status!=='OPEN')stage.probability=stage.status==='WON'?100:0
    return {key:key(p.key),name:crmText(p.name,'pipeline name',100,true),stages}
  });unique(pipelines,'pipeline')
  if(!Array.isArray(value.sources)||!value.sources.length||value.sources.length>50)fail('Enter between 1 and 50 lead sources.')
  if(!Array.isArray(value.customFields)||value.customFields.length>30)fail('Use up to 30 contact custom fields.')
  const customFields=value.customFields.map((f:any)=>({key:key(f.key),label:crmText(f.label,'field label',80,true),type:choice(f.type,['TEXT','NUMBER','DATE','BOOLEAN'],'field type') as any,required:!!f.required}));unique(customFields,'custom field')
  if(new Set(customFields.map((field:any)=>field.label.toLowerCase())).size!==customFields.length)fail('Custom field labels must be unique.')
  const scoring=Object.fromEntries(['email','phone','account','qualified'].map(k=>[k,Math.round(crmNumber(value.scoring?.[k],k+' score',0,100))])) as CrmSettings['scoring']
  if(!Array.isArray(value.segments)||value.segments.length>50)fail('Use up to 50 saved segments.')
  const segments=value.segments.map((s:any)=>({key:key(s.key),name:crmText(s.name,'segment name',100,true),filters:normalizeCrmFilters(s.filters)}));unique(segments,'segment')
  if(!Array.isArray(value.salesRules??[])||(value.salesRules??[]).length>30)fail('Use up to 30 sales rules.')
  const salesRules:CrmSalesRule[]=(value.salesRules??[]).map((r:any)=>{
    const pipeline=pipelines.find((p:any)=>p.key===r.pipelineKey),stage=pipeline?.stages.find((s:any)=>s.key===r.stageKey)
    if(!pipeline||!stage)fail('Choose an existing pipeline and target stage for each sales rule.')
    const fromStageKey=crmText(r.fromStageKey,'starting stage',50)
    if(fromStageKey&&!pipeline.stages.some((s:any)=>s.key===fromStageKey&&s.status==='OPEN'))fail('Choose an open starting stage for the sales rule.')
    if(typeof r.enabled!=='boolean'||typeof r.forwardOnly!=='boolean')fail('Choose valid sales rule options.')
    return {key:key(r.key),name:crmText(r.name,'rule name',100,true),enabled:r.enabled,event:choice(r.event,crmSalesEvents.map(e=>e[0]),'sales event') as CrmSalesRule['event'],pipelineKey:pipeline.key,fromStageKey,stageKey:stage.key,forwardOnly:r.forwardOnly,lossReason:crmText(r.lossReason,'automatic loss reason',1000,stage.status==='LOST'),revision:crmText(r.revision,'rule revision',100)}
  });unique(salesRules,'sales rule')
  for(let i=0;i<salesRules.length;i++)for(const other of salesRules.slice(i+1)){
    const rule=salesRules[i]
    if(rule.enabled&&other.enabled&&rule.event===other.event&&rule.pipelineKey===other.pipelineKey&&(!rule.fromStageKey||!other.fromStageKey||rule.fromStageKey===other.fromStageKey))fail('Enabled rules for the same event and pipeline must use different starting stages.')
  }
  return {pipelines,sources:[...new Set<string>(value.sources.map((s:any)=>crmText(s,'source',80,true)))],tags:tags(value.tags),customFields,scoring,
    automations:{newLeadFollowUpDays:Math.round(crmNumber(value.automations?.newLeadFollowUpDays,'lead follow-up days',0,365)),wonFollowUpDays:Math.round(crmNumber(value.automations?.wonFollowUpDays,'won follow-up days',0,365)),taskReminders:value.automations?.taskReminders===true},segments,salesRules}
}
export function normalizeCrmFilters(input:any={}){
  const result:Record<string,string|number>={}
  for(const key of ['q','ownerId','source','lifecycle','leadStatus','tag','accountId','clientId','dealId','segmentKey','pipelineKey','stageKey','status','kind','priority','archived','due'])if(input[key]!=null&&input[key]!=='')result[key]=crmText(input[key],key,200)
  if(input.minScore!=null&&input.minScore!=='')result.minScore=crmNumber(input.minScore,'minimum score',0,100)
  for(const key of ['from','to'])if(input[key])result[key]=crmDate(input[key],key)!
  return result
}
export function crmScore(row:any,settings:CrmSettings){return Math.min(100,(row.email?settings.scoring.email:0)+(row.phone?settings.scoring.phone:0)+(row.account_id||row.accountId?settings.scoring.account:0)+(['QUALIFIED'].includes(row.lead_status||row.leadStatus)?settings.scoring.qualified:0))}
export function normalizeCrmRecord(kind:CrmKind,input:any,settings=defaultCrmSettings()){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Enter valid CRM details.')
  const body:any={ownerId:crmText(input.ownerId,'owner',100,true),description:crmText(input.description,'description',10000),tags:tags(input.tags||[])}
  if(kind!=='activities')body.name=crmText(input.name,'name',200,true)
  if(kind==='accounts')Object.assign(body,{industry:crmText(input.industry,'industry',100),website:crmUrl(input.website),email:email(input.email),phone:input.phone?crmPhone(input.phone):'',address:crmText(input.address,'address',2000)})
  if(kind==='clients'){
    const source=crmText(input.source||'Other','source',80,true)
    if(!settings.sources.includes(source))fail('Choose a configured lead source.')
    const fields:any={};for(const f of settings.customFields){const v=input.customFields?.[f.key];if(v==null||v===''){if(f.required)fail(f.label+' is required.');continue}
      fields[f.key]=f.type==='NUMBER'?crmNumber(v,f.label,-1e12,1e12):f.type==='DATE'?crmDate(v,f.label):f.type==='BOOLEAN'?(typeof v==='boolean'?v:fail('Choose true or false for '+f.label)):crmText(v,f.label,1000,f.required)}
    Object.assign(body,{accountId:crmText(input.accountId,'business account',100)||null,clientId:crmText(input.clientId,'linked client',100)||null,email:input.email||'',phone:input.phone||'',jobTitle:crmText(input.jobTitle,'job title',150),lifecycle:choice(input.lifecycle||'LEAD',['LEAD','CONTACT','CUSTOMER'],'contact type'),leadStatus:choice(input.leadStatus||'NEW',['NEW','CONTACTED','QUALIFIED','UNQUALIFIED'],'lead status'),source,customFields:fields})
    if(body.lifecycle==='CUSTOMER'&&!body.clientId)fail('Choose an existing company client.')
  }
  if(kind==='deals'){
    const pipeline=settings.pipelines.find(p=>p.key===input.pipelineKey),stage=pipeline?.stages.find(s=>s.key===input.stageKey)
    if(!pipeline||!stage)fail('Choose a current pipeline and stage.')
    Object.assign(body,{clientId:crmText(input.clientId,'contact',100)||null,accountId:crmText(input.accountId,'business account',100)||null,pipelineKey:pipeline!.key,stageKey:stage!.key,status:stage!.status,probability:stage!.probability,value:Math.round(crmNumber(input.value,'deal value',0,999999999999)*100)/100,expectedClose:crmDate(input.expectedClose,'expected close date'),source:crmText(input.source||'Other','source',80),lossReason:crmText(input.lossReason,'loss reason',1000,stage!.status==='LOST')})
  }
  if(kind==='activities'){
    const segmentKey=crmText(input.segmentKey,'segment',100)
    const segment=settings.segments.find(s=>s.key===segmentKey)
    if(segmentKey&&!segment)fail('Choose a current segment in this company.')
    Object.assign(body,{segmentKey:segmentKey||null,segmentName:segment?.name||''})
    Object.assign(body,{clientId:crmText(input.clientId,'contact',100)||null,accountId:crmText(input.accountId,'business account',100)||null,dealId:crmText(input.dealId,'deal',100)||null,kind:choice(input.kind||'TASK',['TASK','CALL','MEETING','EMAIL','WHATSAPP','NOTE'],'activity type'),subject:crmText(input.subject,'subject',200,true),body:crmText(input.body,'activity details',10000),status:choice(input.status||'OPEN',['OPEN','DONE','CANCELLED'],'activity status'),priority:choice(input.priority||'NORMAL',['LOW','NORMAL','HIGH'],'priority'),dueAt:instant(input.dueAt,'due date and time'),endAt:instant(input.endAt,'end date and time'),recurrenceDays:input.recurrenceDays?Math.round(crmNumber(input.recurrenceDays,'recurrence days',1,3650)):null})
    if(body.endAt&&(!body.dueAt||body.endAt<body.dueAt))fail('The end time must follow the start time.')
    if(body.recurrenceDays&&!body.dueAt)fail('A repeating task needs a due date.')
    if(!Array.isArray(input.attachments||[])||(input.attachments||[]).length>10)fail('Attach up to 10 HTTPS references.')
    body.attachments=(input.attachments||[]).map((a:any)=>({name:crmText(a.name,'attachment name',100,true),url:crmUrl(a.url)||fail('An attachment needs an HTTPS link.')}))
  }
  return body
}
/** RFC 4180-style records, including embedded commas/newlines and escaped quotes. */
export function parseCrmCsv(text:string){
  if(new TextEncoder().encode(text).byteLength>2_000_000)fail('CSV files must be smaller than 2 MB.')
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false
  const input=text.replace(/^\uFEFF/,'')
  for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'){if(input[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue}
    if(c==='"'&&!cell&&!closed){quoted=true;continue}if(c===','){row.push(cell);cell='';closed=false;continue}
    if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';closed=false;continue}
    if(closed&&!/\s/.test(c))fail('Invalid CSV text after a closing quote.');if(!closed)cell+=c
  }
  if(quoted)fail('The CSV has an unclosed quote.');row.push(cell);if(row.some(v=>v.trim()))rows.push(row)
  if(rows.length<2)fail('Include a header and at least one contact row.')
  const aliases:Record<string,string>={name:'name',email:'email',phone:'phone',source:'source',lifecycle:'lifecycle',type:'lifecycle',leadstatus:'leadStatus',tags:'tags',ownerid:'ownerId',clientid:'clientId'}
  const headers=rows.shift()!.map(v=>{const label=v.trim().replace(/^custom\s*:\s*/i,'custom:');return aliases[label.toLowerCase().replaceAll(' ','')]||label})
  if(new Set(headers).size!==headers.length||!headers.includes('name'))fail('Use unique CSV headers, including name.')
  if(rows.length>200)fail('Import up to 200 clients at a time.')
  return rows.map((r,i)=>{if(r.length!==headers.length)fail('CSV row '+(i+2)+' has the wrong number of columns.');return Object.fromEntries(headers.map((h,j)=>[h,r[j]]))})
}
export function crmCsv(rows:Record<string,any>[],columns:[string,string][]){
  const cell=(v:any)=>{let s=v==null?'':Array.isArray(v)?v.join('; '):String(v);if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
  return '\uFEFF'+[columns.map(c=>cell(c[1])).join(','),...rows.map(r=>columns.map(([key])=>cell(r[key])).join(','))].join('\r\n')
}
