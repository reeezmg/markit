<script setup lang="ts">
import { investmentToday, investmentMoney, investmentMovementKinds, type InvestmentMovementMode } from '~/utils/investments';
const props = defineProps<{mode:InvestmentMovementMode;investorId?:string;initialKind?:'CAPITAL_IN'|'CAPITAL_OUT';initialTradeId?:string}>(), emit=defineEmits(['close','saved']);
const api=useAccountantApi(), auth=useAuth();
const profiles=ref<any[]>([]),accounts=ref<any[]>([]),dues=ref<any[]>([]),currency=ref('INR'),loading=ref(true),busy=ref(false),error=ref('');
const includeShares=ref(false),preview=ref<any>(null),previewLoading=ref(false),previewError=ref('');
const form=reactive({investorId:props.investorId || '',kind:props.mode==='payouts'?'PROFIT_PAY':props.mode==='loans'?'LOAN_IN':props.initialKind || 'CAPITAL_IN',date:investmentToday(),action:props.initialTradeId?'SETTLE':'CAPITAL',settleTradeId:props.initialTradeId || '',amount:'',pricePerShare:'',shareQuantity:'',paymentStatus:'',paidAmount:'',counterAccountId:'',reference:'',note:''});
const kinds=[{value:'CAPITAL_IN',label:'Receive capital'},{value:'CAPITAL_OUT',label:'Return capital'},{value:'LOAN_IN',label:'Receive loan'},{value:'LOAN_OUT',label:'Repay loan principal'}].filter(k=>investmentMovementKinds[props.mode].includes(k.value));
const selected=computed(()=>profiles.value.find(p=>p.id===form.investorId));
const trading=computed(()=>props.mode==='capital'&&form.action==='NEW');
const settling=computed(()=>props.mode==='capital'&&form.action==='SETTLE');
const canManageShares=computed(()=>['admin','manager'].includes(auth.session.value?.role || ''));
const cashNeeded=computed(()=>!trading.value || form.paymentStatus!=='DUE');
const selectedDue=computed(()=>dues.value.find(t=>t.id===form.settleTradeId));
const dueOptions=computed(()=>dues.value.filter(t=>t.due>0&&!t.cancelled&&t.capitalKind===form.kind).map(t=>({value:t.id,label:`${t.kind==='SHARE_BUY'?'Purchase':'Redemption'} ${t.date} - ${t.shareQuantity} shares at ${t.pricePerShare} - Due ${investmentMoney(t.due,currency.value)}`})));
const capitalInput=computed(()=>({date:form.date,kind:form.kind,...(trading.value?{pricePerShare:Number(form.pricePerShare),paymentStatus:form.paymentStatus,...(form.paymentStatus==='PARTIAL'?{paidAmount:Number(form.paidAmount)}:{}),...(form.kind==='CAPITAL_OUT'?{shareQuantity:Number(form.shareQuantity)}:{amount:Number(form.amount)})}:{amount:Number(form.amount),...(settling.value?{settleTradeId:form.settleTradeId}:{})})}));
const previewInputKey=computed(()=>JSON.stringify({investorId:form.investorId,...capitalInput.value}));
let previewVersion=0,loadVersion=0,dueVersion=0,loadedPreviewKey='',requestId='',submitted='';
async function refreshPreview(){
 if(props.mode!=='capital')return;
 const version=++previewVersion,key=previewInputKey.value;preview.value=null;previewError.value='';loadedPreviewKey='';
 const valid=trading.value?Number(form.pricePerShare)>0&&!!form.paymentStatus&&(form.kind==='CAPITAL_OUT'?Number(form.shareQuantity)>0:Number(form.amount)>0)&&(form.paymentStatus!=='PARTIAL'||Number(form.paidAmount)>0):Number(form.amount)>0&&(!settling.value||!!form.settleTradeId);
 if(!form.investorId||!form.date||!valid){previewLoading.value=false;return;}
 previewLoading.value=true;
 try{const result=await api.get(`/investors/${form.investorId}/capital-preview`,{query:capitalInput.value});if(version===previewVersion&&key===previewInputKey.value){preview.value=result;loadedPreviewKey=key;}}
 catch(e:any){if(version===previewVersion)previewError.value=e.message;}
 finally{if(version===previewVersion)previewLoading.value=false;}
}
watch(previewInputKey,refreshPreview);
async function loadProfiles(){const version=++loadVersion;loading.value=true;try{const result=await api.get('/investors',{query:{asOf:form.date}});if(version===loadVersion){profiles.value=result.data;currency.value=result.currency;}}catch(e:any){error.value=e.message;}finally{if(version===loadVersion)loading.value=false;}}
async function loadDues(){
 const version=++dueVersion;dues.value=[];
 if(props.mode!=='capital'||!form.investorId)return;
 try{const result=await api.get(`/investors/${form.investorId}/share-dues`,{query:{asOf:form.date}});if(version===dueVersion){dues.value=result.trades;if(form.settleTradeId&&!dues.value.some(t=>t.id===form.settleTradeId)){form.settleTradeId='';form.amount='';}if(props.initialTradeId&&form.settleTradeId===props.initialTradeId&&!form.amount&&selectedDue.value)form.amount=String(selectedDue.value.due);}}
 catch(e:any){if(version===dueVersion)error.value=e.message;}
}
watch(()=>form.date,loadProfiles);watch(()=>[form.investorId,form.date],loadDues);
watch(()=>form.settleTradeId,()=>{if(settling.value&&selectedDue.value)form.amount=String(selectedDue.value.due);});
watch(()=>form.kind,()=>{if(settling.value){form.settleTradeId='';form.amount='';}});
onMounted(async()=>{try{
 const settings=await api.post('/account-settings/investment-defaults',{});
 if(props.mode==='capital'){includeShares.value=(await api.get('/investors/share-settings')).includeShares;if(!props.initialTradeId)form.action=includeShares.value?'NEW':'CAPITAL';}
 accounts.value=(await api.get('/investors/options')).filter((a:any)=>['CASH','BANK'].includes(a.accountType));
 const saved=settings.defaults.investments || {},suggested=props.mode==='payouts'?saved.payoutAccountId:saved.counterAccountId;
 if(accounts.value.some(a=>a.id===suggested))form.counterAccountId=suggested;
 await Promise.all([loadProfiles(),loadDues()]);await refreshPreview();
 }catch(e:any){error.value=e.message;loading.value=false;}});
async function save(){
 if(busy.value)return;busy.value=true;error.value='';
 try{
 if(props.mode==='capital'&&loadedPreviewKey!==previewInputKey.value)await refreshPreview();
 if(props.mode==='capital'&&(!preview.value||previewError.value))throw Error(previewError.value||'Wait for the capital preview');
 const investorId=form.investorId,body={counterAccountId:cashNeeded.value?form.counterAccountId:'',reference:form.reference,note:form.note,...(props.mode==='capital'?{...capitalInput.value,amount:preview.value.amount,previewHash:preview.value.previewHash}:{date:form.date,kind:form.kind,amount:Number(form.amount)})},key=JSON.stringify({investorId,...body});
 if(key!==submitted||!requestId){requestId=crypto.randomUUID();submitted=key;}
 await api.post(`/investors/${investorId}/events`,{...body,requestId});emit('saved');
 }catch(e:any){error.value=e.message;}finally{busy.value=false;}
}
</script>
<template><UModal :model-value="true" :prevent-close="busy" @update:model-value="(v:boolean)=>{if(!v)emit('close')}"><UCard class="max-h-[95dvh] flex flex-col" :ui="{body:{base:'overflow-y-auto min-h-0'}}">
 <template #header>{{ mode==='payouts'?'Record profit payment':mode==='loans'?'Record loan principal':settling?'Settle share due':trading?(form.kind==='CAPITAL_IN'?'Buy shares':'Redeem shares'):'Record capital movement' }}</template>
 <form class="space-y-4" @submit.prevent="save"><UAlert v-if="error" color="red" :title="error"/><fieldset :disabled="busy||loading" class="space-y-4">
 <UFormGroup label="Investor" required><USelect v-model="form.investorId" :options="profiles.filter((p:any)=>p.profile.status==='ACTIVE').map((p:any)=>({label:p.name,value:p.id}))" placeholder="Select investor" required/></UFormGroup>
 <UFormGroup v-if="mode==='capital'" label="Entry type" required><USelect v-model="form.action" :options="[...(includeShares?[{label:'New share movement',value:'NEW'}]:[{label:'Capital only',value:'CAPITAL'}]),{label:'Settle share due',value:'SETTLE'}]"/></UFormGroup>
 <UFormGroup v-if="mode!=='payouts'" label="Movement"><USelect v-model="form.kind" :options="trading?[{label:'Buy shares',value:'CAPITAL_IN'},{label:'Redeem shares',value:'CAPITAL_OUT'}]:kinds"/></UFormGroup>
 <UFormGroup label="Date" required><UInput v-model="form.date" type="date" required/></UFormGroup>
 <template v-if="settling"><UFormGroup label="Share due" required><USelect v-model="form.settleTradeId" :options="dueOptions" placeholder="Select outstanding share transaction" required/></UFormGroup><p v-if="!dueOptions.length" class="text-sm text-gray-500">No outstanding share due for this investor and movement on this date.</p><p v-if="selectedDue" class="text-sm">Outstanding: {{ investmentMoney(selectedDue.due,currency) }}. This payment settles the original transaction; shares stay unchanged.</p></template>
 <template v-if="trading"><UFormGroup :label="`Price per share (${currency})`" required><UInput v-model="form.pricePerShare" type="number" min="0.00000001" step="0.00000001" required/></UFormGroup><UFormGroup v-if="form.kind==='CAPITAL_OUT'" label="Shares to redeem" required><UInput v-model="form.shareQuantity" type="number" min="0.00000001" :max="selected?.terms?.shares||0" step="0.00000001" required/></UFormGroup></template>
 <UFormGroup v-if="!(trading&&form.kind==='CAPITAL_OUT')" :label="`Amount (${currency})`" required><UInput v-model="form.amount" type="number" min="0.01" step="0.01" :max="settling?selectedDue?.due:mode==='payouts'?selected?.payable:form.kind==='LOAN_OUT'?selected?.loan:undefined" required/></UFormGroup>
 <template v-if="trading"><UFormGroup label="Payment status" required><USelect v-model="form.paymentStatus" :options="[{value:'PAID',label:'Paid in full'},{value:'DUE',label:'Not paid - keep as due'},{value:'PARTIAL',label:'Partially paid'}]" placeholder="Confirm payment" required/></UFormGroup><UFormGroup v-if="form.paymentStatus==='PARTIAL'" :label="`Amount paid now (${currency})`" required><UInput v-model="form.paidAmount" type="number" min="0.01" step="0.01" required/></UFormGroup><p class="text-xs text-gray-500">{{ form.kind==='CAPITAL_IN'?'Shares are added now. Only confirmed money received is recorded in Capital.':'Shares are redeemed now. Only confirmed money paid is recorded in Capital.' }} The unpaid amount remains due.</p><p v-if="!canManageShares" class="text-xs text-gray-500">A manager or admin must record share movements.</p></template>
 <UFormGroup v-if="cashNeeded" label="Cash / bank account" required><USelect v-model="form.counterAccountId" :options="accounts.map((a:any)=>({label:a.name,value:a.id}))" placeholder="Select account" required/></UFormGroup>
 <p v-if="mode==='payouts'&&selected" class="text-sm">Profit awaiting payment on this date: <strong>{{ investmentMoney(selected.payable,currency) }}</strong></p><p v-if="mode==='loans'&&selected" class="text-sm">Outstanding loan principal: {{ investmentMoney(selected.loan,currency) }}. Record interest separately.</p>
 <template v-if="mode==='capital'"><p v-if="previewLoading" role="status" class="text-sm">Calculating capital...</p><UAlert v-if="previewError" color="red" :title="previewError"/><div v-if="preview" class="rounded border p-3 space-y-2 text-sm" aria-label="Capital calculation preview"><h3 class="font-medium">Before / after this movement</h3><p>Net capital cash: {{ investmentMoney(preview.before.capital,currency) }} &rarr; {{ investmentMoney(preview.after.capital,currency) }}</p><p v-if="trading">Shares: {{ preview.before.shares }} &rarr; {{ preview.after.shares }}. Ownership/profit share: {{ preview.after.ownershipPercent }}%.</p><p v-if="trading">{{ form.kind==='CAPITAL_IN'?'Shares bought:':'Shares redeemed:' }} {{ preview.shareQuantity }} at {{ preview.pricePerShare }}. Trade value: {{ investmentMoney(preview.amount,currency) }}.</p><p v-if="trading">Confirmed payment now: {{ investmentMoney(preview.paidNow,currency) }}. Remaining due: {{ investmentMoney(preview.dueAfter,currency) }}.</p><p v-if="settling">Payment settles the selected due. Shares do not change.</p></div></template>
 <UFormGroup label="Reference"><UInput v-model="form.reference"/></UFormGroup><UFormGroup label="Note"><UInput v-model="form.note"/></UFormGroup>
 </fieldset><div class="flex justify-end gap-2"><UButton variant="ghost" :disabled="busy" @click="emit('close')">Cancel</UButton><UButton type="submit" :loading="busy||loading" :disabled="loading||!form.investorId||(mode==='capital'&&(previewLoading||!preview||!!previewError||loadedPreviewKey!==previewInputKey))">{{ mode==='payouts'?'Record payment':trading?(form.kind==='CAPITAL_IN'?'Record purchase':'Record redemption'):settling?'Record settlement':'Record movement' }}</UButton></div></form>
</UCard></UModal></template>
