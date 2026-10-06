import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {parse} from '@vue/compiler-sfc';
import {investmentPages} from '../utils/investments.ts';
import {accountantSections} from '../utils/accountant-navigation.ts';

const dir=process.env.ACCOUNTING_REVIEW_DIR;
if(!dir)throw Error('ACCOUNTING_REVIEW_DIR is required');
const source=ts.createSourceFile('layout.ts',parse(fs.readFileSync('layouts/default.vue','utf8')).descriptor.scriptSetup.content,ts.ScriptTarget.Latest,true);
let initializer;
function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='links')initializer=node.initializer.getText(source);
  ts.forEachChild(node,visit);
}
visit(source);
if(!initializer)throw Error('Sidebar links initializer not found');
const code=ts.transpileModule(`const inventory=${initializer}; inventory;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const scenarios=[];
for(const plan of ['free','lite','pro'])for(const role of ['admin','manager','accountant','user']){
  const auth={session:{value:{role,type:role}}};
  const links=vm.runInNewContext(code,{computed:fn=>fn(),plan:{value:plan},sidebarSection:{value:'erp'},auth,useAuth:()=>auth,isUserTrackIncluded:{value:true},investmentPages,accountantSections});
  const routes=[];
  function flatten(nodes,parents=[]){for(const node of nodes){const labels=[...parents,node.label];if(node.to)routes.push({labels,path:node.to});if(node.children)flatten(node.children,labels);}}
  flatten(links);scenarios.push({plan,role,routes});
}
const routes=[...new Set(scenarios.flatMap(s=>s.routes.map(r=>r.path)))].sort();
const accountantRoutes=accountantSections.flatMap(s=>s.links.map(([path,label])=>({section:s.label,label,path:`/accountant/${path}`})));
const result={at:new Date().toISOString(),method:'Execute actual sidebar links initializer with mocked plan/role state; enumerate nested Accountant navigation. Inventory only, not browser visibility or CRUD verification.',scenarios,routes,accountantRoutes};
fs.writeFileSync(`${dir}/sidebar-inventory.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({erpRoutes:routes.length,accountantRoutes:accountantRoutes.length,scenarios:scenarios.length}));
