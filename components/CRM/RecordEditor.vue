<script setup lang="ts">
import { useToast } from '#imports'
const toast=useToast()
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import type { CrmKind, CrmSettings } from '../../utils/crm'
const props=defineProps<{kind:CrmKind;record?:any;settings:CrmSettings;staff:any[];companyId:string;actor:any;readOnly?:boolean}>()
const emit=defineEmits<{close:[];saved:[record:any];busy:[value:boolean]}>()
const source=props.record||{},busy=ref(false),lookupSearch=ref('')
const local=(value:any)=>value?new Date(+new Date(value)-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):''
const form=ref<any>({name:'',ownerId:props.staff.some(member=>member.id===props.actor.userId)?props.actor.userId:props.staff[0]?.id||'',tags:[],description:'',email:'',phone:'',clientId:'',dealId:'',segmentKey:'',jobTitle:'',lifecycle:'LEAD',leadStatus:'NEW',source:props.settings.sources[0],customFields:{},pipelineKey:props.settings.pipelines[0]?.key,stageKey:props.settings.pipelines[0]?.stages.find(s=>s.status==='OPEN')?.key,value:0,expectedClose:'',lossReason:'',kind:'TASK',subject:'',body:'',status:'OPEN',priority:'NORMAL',recurrenceDays:null,attachments:[],...JSON.parse(JSON.stringify(source)),dueAt:local(source.dueAt),endAt:local(source.endAt)})
if(!form.value.ownerId)form.value.ownerId=props.staff.some(member=>member.id===props.actor.userId)?props.actor.userId:props.staff[0]?.id||''
for(const field of props.settings.customFields)if(field.type==='BOOLEAN'&&form.value.customFields[field.key]===undefined)form.value.customFields[field.key]=false
const tagText=ref((form.value.tags||[]).join(', ')),choices=ref<any>({clients:[],deals:[]})
const pipeline=computed(()=>props.settings.pipelines.find(p=>p.key===form.value.pipelineKey)),stage=computed(()=>pipeline.value?.stages.find(s=>s.key===form.value.stageKey))
const title=computed(()=>`${source.id?'Edit':'New'} ${props.kind==='clients'?'client CRM attributes':props.kind==='deals'?'deal':'activity'}`)
const api=(url:string,options:any={})=>$fetch<any>('/api/crm/'+url,{...options,headers:{'x-company-id':props.companyId},retry:0})
const lookupLoading=ref(false),lookupError=ref(''),lookupFinished=ref(false)
const linkedChoices=ref<any>({clients:source.clientId?{id:source.clientId,name:source.clientName}:null,deals:source.dealId?{id:source.dealId,name:source.dealName}:null})
let lookupRequest=0,lookupTimer:ReturnType<typeof setTimeout>|undefined
async function searchChoices(){
  clearTimeout(lookupTimer)
  if(props.kind==='clients')return
  const request=++lookupRequest,q=lookupSearch.value.trim(),needed=props.kind==='deals'?['clients']:['clients','deals']
  lookupLoading.value=true;lookupError.value='';lookupFinished.value=false
  try{
    const results=await Promise.all(needed.map(async kind=>[kind,(await api(kind,{query:{q,pageSize:100}})).rows] as const))
    if(request!==lookupRequest)return
    for(const [kind,rows]of results)choices.value[kind]=rows
    lookupFinished.value=true
  }catch(e:any){if(request===lookupRequest)lookupError.value=e?.data?.statusMessage||'Could not load linked records. Try searching again.'}
  finally{if(request===lookupRequest)lookupLoading.value=false}
}
function onLookupInput(event:Event){
  const value=(event.target as HTMLInputElement).value
  if(value===lookupSearch.value)return
  lookupSearch.value=value
  ++lookupRequest;clearTimeout(lookupTimer);lookupLoading.value=true;lookupFinished.value=false;lookupError.value=''
  lookupTimer=setTimeout(searchChoices,250)
}
onBeforeUnmount(()=>{++lookupRequest;clearTimeout(lookupTimer)})
for(const [field,kind]of [['clientId','clients'],['dealId','deals']] as const)watch(()=>form.value[field],value=>{
  const row=choices.value[kind].find((item:any)=>item.id===value)
  if(row)linkedChoices.value[kind]=row
})
function options(kind:string,value:string,name?:string){const rows=choices.value[kind]||[];return value&&!rows.some((r:any)=>r.id===value)?[linkedChoices.value[kind]?.id===value?linkedChoices.value[kind]:{id:value,name:name||'Current selection'},...rows]:rows}
function chooseLinked(kind:string,row:any){
  linkedChoices.value[kind]=row
  if(kind==='clients')form.value.clientId=row.id
  else {form.value.dealId=row.id;if(row.clientId){form.value.clientId=row.clientId;linkedChoices.value.clients={id:row.clientId,name:row.clientName||'Linked client'}}}
}
function changePipeline(){form.value.stageKey=pipeline.value?.stages.find(s=>s.status==='OPEN')?.key||''}
function close(){if(!busy.value)emit('close')}
async function save(){
  if(busy.value||props.readOnly)return;busy.value=true;emit('busy',true)
  try{const body={...form.value,tags:tagText.value.split(',').map(s=>s.trim()).filter(Boolean),dueAt:form.value.dueAt?new Date(form.value.dueAt).toISOString():null,endAt:form.value.endAt?new Date(form.value.endAt).toISOString():null}
    const record=await api(props.kind+(source.id?'/'+source.id:''),{method:source.id?'PUT':'POST',body});toast.add({title:props.kind==='activities'?'Activity saved.':'Record saved.',color:'green'});emit('saved',record)
  }catch(e:any){toast.add({title:e?.data?.statusMessage||e?.message||'The record could not be saved.',color:'red'})}finally{busy.value=false;emit('busy',false)}
}
onMounted(searchChoices)
</script>
<template>
  <UModal :model-value="true" :prevent-close="busy" :ui="{width:'sm:max-w-3xl'}" @update:model-value="value=>{if(!value)close()}">
    <UCard><template #header><div class="flex items-center justify-between gap-3"><h2 class="text-lg font-semibold">{{title}}</h2><UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" aria-label="Close editor" :disabled="busy" @click="close"/></div></template>
      <form id="crm-record-form" class="max-h-[65vh] space-y-4 overflow-y-auto px-1" @submit.prevent="save"><fieldset :disabled="busy||readOnly" class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2"><label v-if="kind!=='activities'" class="crm-label sm:col-span-2">{{kind==='deals'?'Deal name':'Full name'}}<input v-model="form.name" class="crm-input" :readonly="kind==='clients'" required maxlength="200" autofocus/></label>
          <label class="crm-label">Owner<select v-model="form.ownerId" class="crm-input" required :disabled="!actor.manager"><option v-for="member in staff" :key="member.id" :value="member.id">{{member.name}}</option></select></label>
          <label v-if="kind!=='activities'" class="crm-label">Tags<input v-model="tagText" class="crm-input" placeholder="VIP, Priority" maxlength="1000" list="crm-tag-suggestions"/><datalist id="crm-tag-suggestions"><option v-for="tag in settings.tags" :key="tag" :value="tag"/></datalist></label>
          <template v-if="kind==='clients'"><label class="crm-label">Contact type<select v-model="form.lifecycle" class="crm-input"><option value="LEAD">Lead</option><option value="CONTACT">Contact</option><option value="CUSTOMER" :disabled="!form.clientId">Customer</option></select></label><label class="crm-label">Lead status<select v-model="form.leadStatus" class="crm-input"><option v-for="status in ['NEW','CONTACTED','QUALIFIED','UNQUALIFIED']" :key="status" :value="status">{{status.replaceAll('_',' ')}}</option></select></label><label class="crm-label">Source<select v-model="form.source" class="crm-input"><option v-for="item in settings.sources" :key="item" :value="item">{{item}}</option></select></label><label class="crm-label">Job title<input v-model="form.jobTitle" class="crm-input" maxlength="150"/></label></template>
        </div>
        <div v-if="kind!=='clients'" class="rounded-lg border border-gray-200 p-3 dark:border-gray-700"><label class="crm-label">{{kind==='deals'?'Link to a client':'Link to a client or deal'}}<div class="flex gap-2"><input :value="lookupSearch" type="search" class="crm-input" aria-label="Search linked records" placeholder="Type a client name, email, phone or deal name" autocomplete="off" :aria-busy="lookupLoading" @input="onLookupInput" @change="onLookupInput" @search="onLookupInput" @compositionend="onLookupInput" @keydown.enter.prevent="searchChoices"/><button type="button" class="crm-button" @click="searchChoices">Search</button></div></label>
          <p v-if="lookupLoading" role="status" class="mt-2 text-xs text-gray-500">Searching…</p>
          <p v-else-if="lookupError" role="alert" class="mt-2 text-xs text-red-600">{{lookupError}}</p>
          <div v-else-if="lookupSearch.trim()&&lookupFinished" class="mt-2" aria-live="polite">
            <p v-if="!choices.clients.length&&!choices.deals.length" class="text-xs text-gray-500">No matching clients or deals. Try another name, email or phone.</p>
            <template v-for="group in (kind==='deals'?['clients']:['clients','deals'])" :key="group">
              <div v-if="choices[group].length" class="mt-2"><p class="text-xs font-medium text-gray-500">{{group==='clients'?'Clients':'Deals'}} · {{choices[group].length}}</p>
                <div class="mt-1 max-h-40 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
                  <button v-for="row in choices[group]" :key="row.id" type="button" class="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 focus-visible:bg-gray-50 dark:hover:bg-gray-800 dark:focus-visible:bg-gray-800" :aria-label="'Link '+(group==='clients'?'client ':'deal ')+row.name" @click="chooseLinked(group,row)"><span class="font-medium">{{row.name}}</span><span class="ml-2 text-xs text-gray-500">{{row.email||row.phone||row.clientName}}</span><span v-if="(group==='clients'?form.clientId:form.dealId)===row.id" class="ml-2 text-xs text-primary-600">Linked</span></button>
                </div>
              </div>
            </template>
          </div>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <label class="crm-label">Client<select v-model="form.clientId" class="crm-input"><option value="">No client</option><option v-for="row in options('clients',form.clientId,source.clientName)" :key="row.id" :value="row.id">{{row.name}}</option></select></label>
            <label v-if="kind==='activities'" class="crm-label">Deal<select v-model="form.dealId" class="crm-input"><option value="">No deal</option><option v-for="row in options('deals',form.dealId,source.dealName)" :key="row.id" :value="row.id">{{row.name}}</option></select></label>
            <label v-if="kind==='activities'" class="crm-label">Segment<select v-model="form.segmentKey" class="crm-input"><option value="">No segment</option><option v-if="form.segmentKey&&!settings.segments.some(s=>s.key===form.segmentKey)" :value="form.segmentKey">{{source.segmentName||'Removed segment'}} (removed)</option><option v-for="item in settings.segments" :key="item.key" :value="item.key">{{item.name}}</option></select></label>
          </div>
        </div>
        <p v-if="kind==='clients'" class="text-xs text-gray-500">Contact details are managed on the existing client page. This form saves only company-specific CRM attributes.</p>
        <div v-if="kind==='deals'" class="grid gap-4 sm:grid-cols-2"><label class="crm-label">Pipeline<select v-model="form.pipelineKey" class="crm-input" required @change="changePipeline"><option v-for="item in settings.pipelines" :key="item.key" :value="item.key">{{item.name}}</option></select></label><label class="crm-label">Stage<select v-model="form.stageKey" class="crm-input" required><option v-for="item in pipeline?.stages||[]" :key="item.key" :value="item.key">{{item.name}} · {{item.probability}}%</option></select></label><label class="crm-label">Deal value<input v-model.number="form.value" class="crm-input" type="number" min="0" step="0.01" required/></label><label class="crm-label">Expected close date<input v-model="form.expectedClose" class="crm-input" type="date"/></label><label class="crm-label">Source<select v-model="form.source" class="crm-input"><option v-for="item in settings.sources" :key="item" :value="item">{{item}}</option></select></label><label v-if="stage?.status==='LOST'" class="crm-label sm:col-span-2">Loss reason<textarea v-model="form.lossReason" class="crm-input" maxlength="1000" required/></label><p class="text-xs text-gray-500 sm:col-span-2">Marking a deal won records its sales outcome. Create quotes, invoices and payments through the usual sales pages.</p></div>
        <div v-if="kind==='activities'" class="grid gap-4 sm:grid-cols-2"><label class="crm-label">Activity type<select v-model="form.kind" class="crm-input"><option v-for="item in ['TASK','CALL','MEETING','EMAIL','WHATSAPP','NOTE']" :key="item" :value="item">{{item}}</option></select></label><label class="crm-label">Status<select v-model="form.status" class="crm-input"><option value="OPEN">Open</option><option value="DONE">Done / logged</option><option value="CANCELLED">Cancelled</option></select></label><label class="crm-label sm:col-span-2">Subject<input v-model="form.subject" class="crm-input" required maxlength="200"/></label><label class="crm-label sm:col-span-2">Activity details<textarea v-model="form.body" class="crm-input" rows="4" maxlength="10000"/></label><label class="crm-label">Due / start time<input v-model="form.dueAt" class="crm-input" type="datetime-local"/></label><label class="crm-label">End time<input v-model="form.endAt" class="crm-input" type="datetime-local"/></label><label class="crm-label">Priority<select v-model="form.priority" class="crm-input"><option v-for="item in ['LOW','NORMAL','HIGH']" :key="item" :value="item">{{item}}</option></select></label><label class="crm-label">Repeat every (days)<input v-model.number="form.recurrenceDays" class="crm-input" type="number" min="1" max="3650" placeholder="Leave blank for one-time work"/></label><p class="text-xs text-gray-500 sm:col-span-2">Calls, emails and WhatsApp entries record conversations. They do not send messages. Repeating work creates its next task when marked done.</p>
          <div class="space-y-2 sm:col-span-2"><p class="text-sm font-medium">Reference files and links</p><div v-for="(attachment,index) in form.attachments" :key="index" class="flex flex-wrap gap-2"><input v-model="attachment.name" class="crm-input flex-1" aria-label="Reference name" placeholder="Name" required/><input v-model="attachment.url" class="crm-input flex-1" aria-label="Reference HTTPS link" placeholder="https://" type="url" required/><button type="button" class="crm-button" @click="form.attachments.splice(index,1)">Remove</button></div><button type="button" class="crm-button" :disabled="form.attachments.length>=10" @click="form.attachments.push({name:'',url:''})">Add reference link</button></div>
        </div>
        <div v-if="kind==='clients'&&settings.customFields.length" class="grid gap-4 rounded-lg border border-gray-200 p-3 sm:grid-cols-2 dark:border-gray-700"><label v-for="field in settings.customFields" :key="field.key" class="crm-label">{{field.label}}<input v-if="field.type==='BOOLEAN'" v-model="form.customFields[field.key]" type="checkbox"/><input v-else v-model="form.customFields[field.key]" class="crm-input" :type="field.type==='NUMBER'?'number':field.type==='DATE'?'date':'text'" :required="field.required" step="any"/></label></div>
        <label v-if="kind!=='activities'" class="crm-label">Notes / description<textarea v-model="form.description" class="crm-input" rows="4" maxlength="10000"/></label>
      </fieldset></form>
      <template #footer><div class="flex justify-end gap-2"><UButton color="white" :disabled="busy" @click="close">Cancel</UButton><UButton v-if="!readOnly" type="submit" form="crm-record-form" :loading="busy">Save {{kind==='activities'?'activity':'record'}}</UButton></div></template>
    </UCard>
  </UModal>
</template>
