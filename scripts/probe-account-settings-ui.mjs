import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {parse} from '@vue/compiler-sfc';
const ref=value=>({value}),copy=x=>JSON.parse(JSON.stringify(x));
function extract(file,name,context,kind='function') {
 const code=parse(fs.readFileSync(file,'utf8')).descriptor.scriptSetup.content;
 const source=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true);let found;
 function visit(n){
  if(kind==='function'&&ts.isFunctionDeclaration(n)&&n.name?.text===name)found=`(${n.getText(source)})`;
  if(kind==='variable'&&ts.isVariableDeclaration(n)&&n.name.getText(source)===name)found=n.initializer.getText(source);
  if(kind==='hook'&&ts.isCallExpression(n)&&n.expression.getText(source)===name)found=n.arguments[name==='watch'?1:0].getText(source);
  ts.forEachChild(n,visit);
 }visit(source);assert.ok(found,`${file}: missing ${name}`);
 return vm.runInNewContext(ts.transpileModule(`const subject=${found};subject;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,{...context});
}
const checks=[],check=(name,details={})=>checks.push({name,passed:true,...details});
const settingsFile='pages/settings/account.vue';
const erp=ref({enabled:true,mappings:{cash:'edited-cash',bank:'edited-bank',sales:'edited-sales',expense:'unsaved-expense'}}),staff=ref({enabled:true,mappings:{cash:'staff-cash','bank:named':'named-bank'}});
const groups=extract(settingsFile,'groups',{},'variable');
const calls=[],server={erp:{cash:'old-cash',bank:'old-bank',sales:'old-sales',expense:'saved-expense',inputTax:'saved-tax'},staff:{cash:'old-staff'}};
const mapping=extract(settingsFile,'saveMapping',{api:{companyId:ref('a')},state:owner=>owner==='erp'?erp.value:staff.value,busy:ref(''),error:ref(''),toast:{add(){}},
 request:async(method,path,body,owner)=>{calls.push({method,path,body:copy(body||{}),owner});const key=path.startsWith('/erp')?'erp':'staff';if(method==='PUT')server[key]=copy(body.mappings);return {mappings:copy(server[key]),enabled:true};}});
await mapping(groups[0]);assert.equal(server.erp.expense,'saved-expense');assert.equal(server.erp.inputTax,'saved-tax');assert.equal(server.erp.cash,'edited-cash');
check('Save Billing preserves saved expense-only settings and sends the selected billing Cash/Bank accounts',{sharedCashAndBank:true});
erp.value.mappings.expense='edited-expense';await mapping(groups[1]);assert.equal(server.erp.sales,'edited-sales');assert.equal(server.erp.expense,'edited-expense');
check('Save Expenses preserves saved sales-only settings; Cash/Bank are shared with Billing');
await mapping(groups[2]);assert.equal(server.staff['bank:named'],'named-bank');assert.ok(calls.every(c=>c.owner==='a'));
check('Save Staff includes named-bank mappings and pins all requests to the captured company');

const moneyFile='components/Accountant/MoneyPage.vue',form={direction:'RECEIVE',moneyAccountId:'',purposeAccountId:'',amount:'12',date:'2026-10-06',person:'',reference:'',note:''};
const defaults=ref({receive:{moneyAccountId:'receive-bank',purposeAccountId:'sales'},pay:{moneyAccountId:'pay-cash',purposeAccountId:'expense'}});
const options=ref({accounts:[{id:'receive-bank',accountType:'BANK',isPrimary:true},{id:'pay-cash',accountType:'CASH'}]});
const moneyAccounts=ref(options.value.accounts.map(a=>({value:a.id}))),purposeAccounts=ref([{value:'sales'},{value:'expense'}]);
const apply=extract(moneyFile,'applyDefaults',{defaults,form,options,moneyAccounts,purposeAccounts});
apply();assert.equal(form.moneyAccountId,'receive-bank');assert.equal(form.purposeAccountId,'sales');form.direction='PAY';apply();assert.equal(form.moneyAccountId,'pay-cash');assert.equal(form.purposeAccountId,'expense');
check('Receive and Pay use their distinct configured money/purpose defaults');
defaults.value.pay.moneyAccountId='inactive';defaults.value.pay.purposeAccountId='removed';apply();assert.equal(form.moneyAccountId,'receive-bank');assert.equal(form.purposeAccountId,'');
check('Money form does not retain unavailable defaults; money falls back to an eligible account and purpose requires a choice');

const supplierFile='components/Distributor/AccountSelection.vue',supplierModel=ref({}),props={companyId:'a',distributorId:'vendor',sourceKey:undefined},supplierData=ref(null);
let supplierResponse={enabled:true,mappings:{cash:'supplier-cash',bank:'supplier-bank'},sources:[]};
const supplierDefaults={purchase:{cash:'company-cash',stock:'company-stock'}};
const supplier=extract(supplierFile,'watch',{props,allowed:ref(true),generation:0,data:supplierData,error:ref(''),model:supplierModel,
 $fetch:async path=>path.includes('/defaults')?{defaults:supplierDefaults}:supplierResponse},'hook');
await supplier();assert.equal(supplierModel.value.cash,'company-cash');assert.equal(supplierModel.value.bank,'supplier-bank');
check('New supplier transaction: company defaults override supplier mappings for the same role',{precedence:'explicit transaction choice > company default > supplier mapping'});
props.sourceKey='payment:existing';supplierResponse.sources=[{source_key:props.sourceKey,accounts:{cash:'recorded-cash',bank:'recorded-bank'}}];
await supplier();assert.equal(supplierModel.value.cash,'recorded-cash');check('Existing supplier form loads recorded accounts instead of latest defaults');

const transferFile='components/Accountant/AccountTransfersPage.vue',transferForm={},eligible=ref([{id:'from'},{id:'to'}]);
const openTransfer=extract(transferFile,'openCreate',{editingId:ref('old'),reset(){Object.assign(transferForm,{fromAccountId:'',toAccountId:''});},api:{get:async()=>({defaults:{transfers:{fromAccountId:'from',toAccountId:'to'}}})},eligible,form:transferForm,formOpen:ref(false)});
await openTransfer();assert.equal(transferForm.fromAccountId,'from');assert.equal(transferForm.toAccountId,'to');
const editTransfer=extract(transferFile,'openEdit',{editingId:ref(''),form:transferForm,formOpen:ref(false)});
editTransfer({id:'old',transferDate:'2026-10-06',fromAccountId:'recorded-from',toAccountId:'recorded-to',amount:1,currency:'INR',exchangeRate:1});assert.equal(transferForm.fromAccountId,'recorded-from');
check('Transfer create prefills both defaults; edit preserves saved endpoints');

const assetFile='components/Accountant/AccountantManagementPage.vue',assetForm={},assetDefaults={assetAccountId:'asset',accumulatedDepAccountId:'contra',depreciationExpenseAccountId:'depreciation',proceedsAccountId:'proceeds',gainLossAccountId:'gainloss'};
const assetCtx={assetAction:ref(''),reset(){for(const k of Object.keys(assetForm))delete assetForm[k];},view:ref('asset-categories'),api:{get:async()=>({defaults:{assets:assetDefaults}})},form:assetForm,createOpen:ref(false),selectedAsset:ref(null),today:()=> '2026-10-06'};
await extract(assetFile,'openCreate',assetCtx)();assert.equal(assetForm.assetAccountId,'asset');assert.equal(assetForm.accumulatedDepAccountId,'contra');assert.equal(assetForm.depreciationExpenseAccountId,'depreciation');
await extract(assetFile,'startAssetAction',assetCtx)({id:'old-asset'},'dispose');assert.equal(assetForm.proceedsAccountId,'proceeds');assert.equal(assetForm.gainLossAccountId,'gainloss');
check('Asset category and disposal forms prefill all five configured asset roles');

const investmentDefaults={capitalAccountId:'equity',profitAccountId:'profit-due',loanAccountId:'loan',counterAccountId:'capital-bank',payoutAccountId:'payout-cash'};
const profileFile='components/Investments/ProfileModal.vue',profileCtx={needsUser:true,props:{},loadingUsers:ref(false),users:ref([]),accounts:ref([]),capitalAccountId:ref(''),profitAccountId:ref(''),loanAccountId:ref(''),userError:ref(''),api:{get:async path=>path.includes('defaults')?{defaults:{investments:investmentDefaults}}:[]}};
await extract(profileFile,'onMounted',profileCtx,'hook')();assert.equal(profileCtx.capitalAccountId.value,'equity');assert.equal(profileCtx.profitAccountId.value,'profit-due');assert.equal(profileCtx.loanAccountId.value,'loan');
check('New investor profiles prefill equity, profit-payable and loan accounts');
const moveFile='components/Investments/MovementModal.vue';
for(const mode of ['capital','payouts']){
 const moveForm={counterAccountId:''};
 await extract(moveFile,'onMounted',{props:{mode},accounts:ref([]),form:moveForm,error:ref(''),loading:ref(true),loadProfiles:async()=>{},api:{get:async path=>path.includes('defaults')?{defaults:{investments:investmentDefaults}}:[{id:'capital-bank',accountType:'BANK'},{id:'payout-cash',accountType:'CASH'}]}},'hook')();
 assert.equal(moveForm.counterAccountId,mode==='capital'?'capital-bank':'payout-cash');
}
check('Capital/loan movements and profit payouts prefill distinct configured payment accounts');

// Trace named legacy-bank receipt selections through the exact helper.
const online=ref({enabled:true,mappings:{bank:'online-bank'}}),onlineCalls=[];
await extract(settingsFile,'saveEcommerce',{busy:ref(''),error:ref(''),api:{companyId:ref('a')},ecommerce:online,toast:{add(){}},request:async(method,path,body,owner)=>{onlineCalls.push({method,path,body:copy(body),owner});return online.value;}})(false);
assert.equal(onlineCalls[0].method,'PUT');assert.equal(onlineCalls[0].path,'/ecommerce/settings');assert.equal(onlineCalls[0].body.mappings.bank,'online-bank');
check('Online Save sends the selected mapping without invoking enable/import');
const file=`${process.env.ACCOUNTING_REVIEW_DIR||'scripts/production-accounting/runs/account-settings-review-2026-10-06'}/ui-default-selection.json`;
fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),method:'Actual Vue functions/hooks extracted from AST and executed with mocked requests/reactivity; no database or browser calls.',checks},null,2));
console.log(JSON.stringify({passed:checks.length,checks},null,2));
