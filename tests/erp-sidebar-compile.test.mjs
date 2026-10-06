import fs from 'node:fs';
import path from 'node:path';
import {parse,compileScript,compileTemplate,registerTS} from '@vue/compiler-sfc';
import ts from 'typescript';
registerTS(()=>ts);
const roots=['pages/statement','pages/erp','pages/offline','pages/products','pages/distributor','pages/users','pages/client','pages/reports','pages/settings','pages/accountant','pages/accounts','pages/investments',
 'components/Accountant','components/Expense','components/Investments','components/Distributor'];
const files=['layouts/default.vue'];
function visit(root){if(!fs.existsSync(root))return;for(const e of fs.readdirSync(root,{withFileTypes:true})){const file=path.join(root,e.name);if(e.isDirectory())visit(file);else if(file.endsWith('.vue'))files.push(file);}}
roots.forEach(visit);
const failures=[];
for(const file of files){
 try{
  const {descriptor,errors}=parse(fs.readFileSync(file,'utf8'),{filename:path.resolve(file)});
  if(errors.length)throw Error(errors.map(String).join('; '));
  const script=descriptor.script||descriptor.scriptSetup?compileScript(descriptor,{id:file,fs:{fileExists:fs.existsSync,readFile:f=>fs.readFileSync(f,'utf8')}}):null;
  if(descriptor.template){const template=compileTemplate({source:descriptor.template.content,filename:path.resolve(file),id:file,compilerOptions:{bindingMetadata:script?.bindings}});if(template.errors.length)throw Error(template.errors.map(String).join('; '));}
 }catch(error){failures.push({file,message:String(error.message)});}
}
const result={at:new Date().toISOString(),method:'Vue SFC script/template compiler; no component mounting, HTTP or database calls.',files:files.length,compiled:files.length-failures.length,failures};
const dir=process.env.ACCOUNTING_REVIEW_DIR;
if(dir)fs.writeFileSync(path.join(dir,'sidebar-vue-compilation.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exitCode=1;
