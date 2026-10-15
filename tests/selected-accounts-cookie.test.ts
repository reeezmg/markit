import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createApp,eventHandler,useSession,readBody,createError,toWebHandler} from 'h3';
import {packSelectedAccounts,unpackSelectedAccounts} from '../server/utils/selected-accounts-codec';
import {useChunkedAuthSession} from '../auth/server/utils/chunked-session';
const config={name:'test-auth',password:'test-password-at-least-32-characters-long',cookie:{secure:false}};
let selected='initial-account';
const loadSelectedAccounts=async(companyId:string)=>({companyId,version:2,defaults:{purchase:{stock:selected}}});
const compile=(file:string,bindings:Record<string,unknown>)=>{
 const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import .*;\r?\n/gm,'').replace('export default','return');
 return new Function(...Object.keys(bindings),js)(...Object.values(bindings));
};
const base={eventHandler,readBody,loadSelectedAccounts,packSelectedAccounts,unpackSelectedAccounts,
 useAuthSession:(event:any)=>useChunkedAuthSession(event,config),
 requireAuthSession:async(event:any)=>{const s=await useChunkedAuthSession(event,config);if(!s.data.email)throw createError({statusCode:401});return s;},
 assertCompanyAccess:async(_event:any,companyId:string)=>{if(!['a','b'].includes(companyId))throw createError({statusCode:403});},
 getHeadOfficeAdmin:async()=>null};
const app=createApp();
app.use('/login',eventHandler(async event=>{const session=await useSession(event,config);await session.update({id:'test-user',email:'test@example.invalid',companyId:'a',companyPhone:'12345'});return {ok:true};}));
app.use('/refresh',compile('auth/server/api/auth/selected-accounts.post.ts',base));
app.use('/session',compile('auth/server/api/auth/session.get.ts',base));
const fetch=toWebHandler(app);let cookie='';
async function request(path:string,body?:any){const res=await fetch(new Request('http://localhost'+path,{method:body?'POST':'GET',headers:{cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));const header=res.headers.get('set-cookie');if(header){assert.ok(header.length<4096);cookie=header.split(';')[0];}return res;}
assert.equal((await request('/refresh',{companyId:'a'})).status,401);
await request('/login');
let data=await (await request('/session')).json();
assert.equal(data.companyPhone,'12345');assert.equal(data.selectedAccounts.defaults.purchase.stock,'initial-account');
assert.equal(data.selectedAccountsPacked,undefined,'Compressed transport stays out of frontend data');
selected='changed-account';await request('/refresh',{companyId:'a'});
data=await (await request('/session')).json();assert.equal(data.selectedAccounts.defaults.purchase.stock,'changed-account');
await request('/refresh',{companyId:'b'});data=await (await request('/session')).json();assert.equal(data.selectedAccounts.companyId,'a');
assert.equal((await request('/refresh',{companyId:'foreign'})).status,403);
assert.equal(unpackSelectedAccounts('invalid'),undefined);
console.log('Encrypted auth cookie roundtrip passed: old-session hydration, settings refresh, other-company isolation, denied access and preserved phone.');
