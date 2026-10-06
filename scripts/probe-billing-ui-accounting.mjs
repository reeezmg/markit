import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parse} from '@vue/compiler-sfc';
import ts from 'typescript';
const ref=value=>({value});
function handler(file,name,context){
 const {descriptor}=parse(fs.readFileSync(file,'utf8'));
 const code=descriptor.scriptSetup.content;
 const source=ts.createSourceFile(file+'.ts',code,ts.ScriptTarget.Latest,true);
 let initializer;
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)===name)initializer=node.initializer.getText(source);ts.forEachChild(node,visit);}
 visit(source);assert.ok(initializer,`Missing ${name}`);
 const js=ts.transpileModule(`const subject=${initializer}; subject;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return vm.runInNewContext(js,{...context});
}
const requests=[],values={};
for(const name of ['uuid','isSaving','items','grandTotal','paymentMethod','splitPayments','redeemedAmt','date','currentRequestIds','clientId','skipPoints','subtotal','discount','returnAmt','couponValue','redeemedPoints','selected','clientName','phoneNo','points','selectedCouponId','selectedAction'])values[name]=ref(null);
Object.assign(values,{uuid:ref(''),isSaving:ref(false),items:ref([]),splitPayments:ref([]),selectedAction:ref('none')});
let first=true;
const context={...values,process:{client:false},console:{error(){}},uuidv4:randomUUID,commitDateInput(){},nextTick:async()=>{},
 useAuth:()=>({session:ref({companyId:'head',id:'staff'})}),validateBillState(){},validateBillEntries:items=>items,
 ensureClientExists:async()=>{},computeBillPoints:()=>0,buildEntriesData:()=>[],buildBillPayload:()=>({}),
 buildPrintData:()=>({}),fireFcmNotification(){},reset(){},toast:{add(){}},localStorage:{setItem(){}},RECENT_BILL_KEY:'recent',
 $fetch:async(_path,options)=>{requests.push(options.body.uuid);if(first){first=false;throw Error('Response lost after the server committed');}return {billId:options.body.uuid,invoiceNumber:1};},
};
const save=handler('pages/erp/billing.vue','handleSave',context);
await save();await save();
assert.equal(requests.length,2);assert.equal(requests[0],requests[1],'Retry keeps the saved request identity');
const findings=[{name:'Billing retry after committed response is lost',defect:requests.length===2&&requests[0]!==requests[1],requestIds:requests,
 explanation:'Retry keeps the persisted draft request ID; the server returns its committed receipt.'}];
let paymentRequest;
const payment=handler('pages/erp/sales.vue','onPaymentStatusChange',{
 useAuth:()=>({session:ref({companyId:'head'})}),paymentMethod:ref('Cash'),toast:{add(){}},fetchSales:async()=>{},
 $fetch:async(_path,options)=>{paymentRequest=options.body;},
});
await payment('branch-bill','PAID',99,'branch');
assert.equal(paymentRequest.companyId,'branch');
const modalContext={onPaymentStatusChange:payment,isOpen:ref(false),activeBillInfo:ref({})};
handler('pages/erp/sales.vue','handleEnterPayment',modalContext)('branch-bill','PAID',99,'branch');
handler('pages/erp/sales.vue','handlePaid',modalContext)();
await Promise.resolve();
assert.equal(paymentRequest.companyId,'branch','Paid modal retains branch ownership');
const salesPage=fs.readFileSync('pages/erp/sales.vue','utf8');
assert.ok(salesPage.includes('handleEnterPayment(row.id, status,row.invoiceNumber,row.companyId)'));
findings.push({name:'Sales inline branch payment status',defect:paymentRequest.companyId!=='branch',billOwner:'branch',requestCompany:paymentRequest.companyId,
 explanation:'Inline status changes explicitly send the bill owner.'});
let writes=0,deleteError;
const deleteB2b=handler('pages/erp/accounts.vue','deleteBillRow',{
 $fetch:async(path,options)=>{assert.equal(path,'/api/billSale/deleteBill');assert.equal(options.body.companyId,'branch');writes++;},refetch:async()=>{},deletingBillRowIdentity:ref({id:'bill',name:'99',companyId:'branch'}),toast:{add(){}},isDeleteBillModalOpen:ref(true),
});
try{await deleteB2b();}catch(error){deleteError=String(error);}
assert.equal(writes,1);assert.equal(deleteError,undefined);
findings.push({name:'B2B bill deletion',defect:writes===0&&!!deleteError,writeCalls:writes,error:deleteError,
 explanation:'B2B deletion awaits the complete source deletion endpoint and refreshes after success.'});
const bankPage=fs.readFileSync('pages/accounts/bank/index.vue','utf8');
assert.ok(!/const saveBank\s*=/.test(bankPage),'Retired bank save handler must remain absent');
findings.push({name:'Legacy bank form',defect:false,resolvedBy:'Retired mutation controls; archive is read-only.'});
const dir=process.env.ACCOUNTING_REVIEW_DIR||'scripts/production-accounting/runs/workflow-review-2026-10-06';
fs.writeFileSync(`${dir}/billing-ui-probes.json`,JSON.stringify({at:new Date().toISOString(),method:'Execute actual Vue handler AST with mocked network and browser dependencies; no database calls.',findings},null,2));
console.log(JSON.stringify(findings,null,2));
