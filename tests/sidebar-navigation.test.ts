import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { computed, effectScope, nextTick, ref } from 'vue';
import { createEvent } from 'h3';
import { buildSidebarMenu } from '../utils/sidebar-menu';
import { defaultSidebarPreferences, filterSidebarLinks, normalizeSidebarPreferences, sidebarPageKey, sidebarPages, sidebarSections } from '../utils/sidebar-navigation';
import { useSidebarPreferences } from '../composables/useSidebarPreferences';
import getPreferences from '../server/api/settings/sidebar-navigation.get';
import putPreferences from '../server/api/settings/sidebar-navigation.put';
import { pool } from '../server/db';
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope';

const session={companyId:'a',id:'manager',role:'manager',type:'manager',plan:'pro',isUserTrackIncluded:true};
const workflow={includeInvoicing:true,includeAfterSales:true};
const allSelected=()=>{const preferences=defaultSidebarPreferences();for(const key of sidebarSections)preferences.sections[key].enabled=true;return preferences};
const paths=(section:any,preferences=allSelected(),actor=session,flow=workflow)=>sidebarPages(filterSidebarLinks(buildSidebarMenu(section,actor,flow),section,preferences)).map(page=>page.key);

test('Only ERP is enabled by default; saved selections survive normalization and invalid preferences are rejected',()=>{
  const defaults=defaultSidebarPreferences();assert(sidebarSections.every(key=>defaults.sections[key].enabled===(key==='erp')));assert.deepEqual(normalizeSidebarPreferences(null),defaults);
  for(const key of ['crm','storefront','connect'] as const)assert.deepEqual(paths(key,defaults),[]);
  const exception=defaultSidebarPreferences();exception.sections.storefront.enabled=true;assert(normalizeSidebarPreferences(exception,true).sections.storefront.enabled);assert(paths('storefront',exception).length>0);assert(!normalizeSidebarPreferences(null).sections.storefront.enabled,'One company\'s exception never changes another company\'s defaults');
  assert.deepEqual(normalizeSidebarPreferences(allSelected(),true),allSelected(),'Explicit company selections override defaults');
  for(const change of [{...defaults,revision:-1},{...defaults,sections:{...defaults.sections,erp:{enabled:'false',hiddenPages:[]}}},{...defaults,sections:{...defaults.sections,admin:{enabled:true,hiddenPages:[]}}},{...defaults,sections:{...defaults.sections,crm:{enabled:true,hiddenPages:['https://evil.test']}}}])assert.throws(()=>normalizeSidebarPreferences(change,true));
  assert.equal(sidebarPageKey('/client?entryCompany=branch&from=crm'),'/client?from=crm');assert.notEqual(sidebarPageKey('/client'),sidebarPageKey('/client?from=crm'));
  const prefs=defaultSidebarPreferences();prefs.sections.erp.hiddenPages=['/erp/sales','/erp/sales'];assert.equal(normalizeSidebarPreferences(prefs,true).sections.erp.hiddenPages.length,1);
});
test('Menus retain existing plan, workflow and staff gates regardless of selected pages',()=>{
  for(const plan of ['free','lite','pro'])for(const role of ['admin','manager','user','biller','accountant','investor']){
    const actor={...session,plan,role,type:role};
    assert.equal(paths('connect',undefined,actor).length>0,['admin','manager'].includes(role));
    const crm=paths('crm',undefined,actor);assert.equal(crm.includes('/crm/settings'),['admin','manager'].includes(role));assert.equal(crm.length>0,role!=='investor');
    assert(!crm.includes('/crm/leads'),'CRM must not expose a duplicate lead directory');
    assert(!crm.includes('/crm/accounts'),'Business accounts must not have a separate navigation page');
    assert(!crm.includes('/crm/campaigns'),'Campaigns must not have a CRM navigation page');
    if(role!=='investor')assert.equal(crm.filter(path=>path==='/client?from=crm').length,1,'Clients and leads share one directory entry');
    const erp=paths('erp',undefined,actor);assert.equal(erp.includes('/accountant/chart-of-accounts'),['admin','manager','accountant'].includes(role));assert(erp.includes('/settings/sidebar'));
    const reduced=paths('erp',undefined,actor,{includeInvoicing:false,includeAfterSales:false});assert(!reduced.includes('/erp/quotes'));assert(!reduced.includes('/after-sales'));assert(reduced.includes('/erp/billing'));
  }
});
test('Section/page selections prune empty groups and parent destinations in expanded and compact navigation',()=>{
  const prefs=allSelected();prefs.sections.erp.enabled=false;assert.deepEqual(paths('erp',prefs),[]);
  prefs.sections.erp.enabled=true;const full=buildSidebarMenu('erp',session,workflow),account=full.find(link=>link.id==='accountant')!;
  prefs.sections.erp.hiddenPages=sidebarPages(full).map(page=>page.key).filter(key=>key!=='/accountant/manual-journals');
  const filtered=filterSidebarLinks(full,'erp',prefs);assert.equal(filtered.length,1);assert.equal(filtered[0].id,'accountant');assert.equal(filtered[0].to,'/accountant/manual-journals');assert.deepEqual(filtered[0].children!.map(child=>child.to),['/accountant/manual-journals']);
  assert(account.children!.length>1,'Filtering never mutates the menu source');
  prefs.sections.erp.hiddenPages.push('/accountant/manual-journals');assert.equal(filterSidebarLinks(full,'erp',prefs).length,0);
  prefs.sections.crm.hiddenPages=['/client?from=crm'];assert(!paths('crm',prefs).includes('/client?from=crm'));assert(paths('storefront',prefs).length>0,'Selections are independent across sections');
});

function fixture(){
  let values:any={a:null,branch:null},backup:any={},snapshot:any,role='manager';const calls:any[]=[];
  const query=async(sql:string,args:any[]=[])=>{
    calls.push({sql,args});if(/^\s*(CREATE|ALTER|DROP|TRUNCATE)/i.test(sql))throw Error('Schema changes forbidden');
    if(sql==='BEGIN'){snapshot=structuredClone({values,backup});return {rows:[]};}if(sql==='ROLLBACK'){({values,backup}=snapshot);return {rows:[]};}if(sql==='COMMIT')return {rows:[]};
    if(sql.startsWith('SELECT role'))return {rows:role==='revoked'?[]:[{role}]};
    if(sql.startsWith('SELECT id FROM companies'))return {rows:[{id:args[0]}]};
    if(sql.startsWith('SELECT preference_value'))return {rows:values[args[0]]?[{preference_value:structuredClone(values[args[0]])}]:[]};
    if(sql.includes('defaults-backup')){backup[args[0]]=structuredClone(values[args[0]]);return {rows:[]};}
    if(sql.startsWith('INSERT INTO general_preferences')){values[args[1]]=JSON.parse(args[2]);return {rows:[]};}
    throw Error('Unexpected SQL: '+sql);
  };
  return {query,release(){},calls,get values(){return values},get backup(){return backup},set role(value:string){role=value}};
}
function event(body?:any,company='a',origin='https://markit.test'){
  const text=body===undefined?'':JSON.stringify(body),req:any=Readable.from(text?[Buffer.from(text)]:[]);req.url='/api/settings/sidebar-navigation';req.method=body===undefined?'GET':'PUT';req.headers={host:'markit.test','x-forwarded-proto':'https','x-company-id':company,origin,'content-type':'application/json','content-length':String(Buffer.byteLength(text))};
  const e=createEvent(req,{setHeader(){}} as any);e.context.authorizedCompanyIds=Promise.resolve(['a','branch']);return e;
}
test('Settings handlers persist only selected company, back up changes, reject stale writes and preserve live permissions',async()=>{
  const db=fixture(),connect=pool.connect,query=pool.query,auth=(globalThis as any).requireAuthSession;
  (pool as any).connect=async()=>db;(pool as any).query=db.query;(globalThis as any).requireAuthSession=async()=>({data:session});
  try{
    const first=await getPreferences(event());assert.equal(first.preferences.revision,0);assert.deepEqual(first.preferences,defaultSidebarPreferences());assert(!db.calls.some(call=>call.sql.startsWith('INSERT')));
    const selected=defaultSidebarPreferences();selected.sections.erp.enabled=false;selected.sections.crm.enabled=true;selected.sections.crm.hiddenPages=['/crm/reports'];
    const result=await putPreferences(event(selected,'branch'));assert.equal(result.preferences.revision,1);assert.equal(db.values.a,null);assert.equal(db.values.branch.sections.erp.enabled,false);
    await assert.rejects(putPreferences(event(selected,'branch')),{statusCode:409});assert.equal(db.values.branch.revision,1);
    const again=structuredClone(result.preferences);again.sections.storefront.enabled=true;await putPreferences(event(again,'branch'));assert.equal(db.backup.branch.revision,1);const saved=(await getPreferences(event(undefined,'branch'))).preferences;assert.equal(saved.revision,2);assert.equal(saved.sections.storefront.enabled,true);assert.equal((await getPreferences(event())).preferences.sections.storefront.enabled,false);
    await assert.rejects(putPreferences(event(defaultSidebarPreferences(),'foreign')),{statusCode:403});await assert.rejects(putPreferences(event(defaultSidebarPreferences(),'a','https://evil.test')),{statusCode:403});
    const writeCount=db.calls.filter(call=>call.sql.startsWith('INSERT')).length;
    db.role='user';assert.equal((await getPreferences(event())).canManage,false);await assert.rejects(putPreferences(event(defaultSidebarPreferences())),{statusCode:403});
    db.role='revoked';await assert.rejects(getPreferences(event()),{statusCode:403});
    db.role='manager';await assert.rejects(putPreferences(event({sections:{}})),{statusCode:400});assert.equal(db.calls.filter(call=>call.sql.startsWith('INSERT')).length,writeCount);
  }finally{pool.connect=connect;pool.query=query;(globalThis as any).requireAuthSession=auth;}
});
test('Generic preference APIs cannot bypass Sidebar management or overwrite its backup',async()=>{
  const delegate={findMany:async()=>[{pageName:'sidebar-navigation'}],create:async()=>{throw Error('Unexpected write')},update:async()=>{throw Error('Unexpected write')},deleteMany:async()=>{throw Error('Unexpected write')}};
  const db:any={generalPreference:delegate,$transaction:async(fn:any)=>fn(db)},api=scopeOrganizationModelReads(db,'a',['a']);
  for(const op of ['create','update','deleteMany'])await assert.rejects(api.generalPreference[op]({data:{pageName:'sidebar-navigation',companyId:'a'}}),/Settings > Sidebar/);
});
test('Shared preferences update active sidebar immediately, isolate branch saves and ignore old GET responses',async()=>{
  const states=new Map<string,any>(),beforeState=(globalThis as any).useState;(globalThis as any).useState=(key:string,initial:any)=>{if(!states.has(key))states.set(key,ref(initial()));return states.get(key)};
  const deferred:Function[]=[],company=ref('a'),scope=effectScope();let api:any;
  const fetcher=async(_url:string,options:any)=>options.method==='PUT'?{preferences:{...options.body,revision:options.body.revision+1},canManage:true}:await new Promise(resolve=>deferred.push(()=>resolve({preferences:defaultSidebarPreferences(),canManage:true})));
  try{
    scope.run(()=>{api=useSidebarPreferences(company,fetcher)});const chosen=defaultSidebarPreferences();chosen.sections.crm.enabled=true;await api.save(chosen);deferred.shift()!();await api.ready;assert.equal(api.preferences.value.sections.crm.enabled,true);
    company.value='branch';await nextTick();const branch=defaultSidebarPreferences();branch.sections.erp.enabled=false;await api.save(branch);deferred.shift()!();await nextTick();assert.equal(api.preferences.value.sections.erp.enabled,false);
    company.value='a';await nextTick();assert.equal(api.preferences.value.sections.crm.enabled,true);assert.equal(api.preferences.value.sections.erp.enabled,true);deferred.shift()!();
  }finally{scope.stop();(globalThis as any).useState=beforeState;}
});
