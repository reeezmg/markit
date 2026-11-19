<script setup lang="ts">
const props=defineProps<{items:any[];clientId?:string;modelValue:any[];returnedUnitIds:string[]}>()
const emit=defineEmits<{'update:modelValue':[value:any[]];'update:returnedUnitIds':[value:string[]];required:[value:boolean]}>()
const scope=useCompanyScope(),links=ref<any[]>([]),owned=ref<any[]>([]),error=ref(''),ready=ref(false)
let version=0
const itemIds=computed(()=>[...new Set(props.items.map(i=>i.id).filter(Boolean))].sort().join(','))
const covered=computed(()=>props.items.filter(i=>!i.return&&links.value.some(l=>l.item_id===i.id)))
const returns=computed(()=>props.items.filter(i=>i.return))
async function load(){const token=++version;error.value='';try{const result=await scope.fetch<any[]>('/api/after-sales/sale-context',{query:{itemIds:itemIds.value}});if(token!==version)return;links.value=result;ready.value=true;
 if(props.clientId&&returns.value.length){const data=await scope.fetch<any[]>('/api/after-sales/products',{query:{clientId:props.clientId}});if(token!==version)return;owned.value=data.filter(p=>p.status==='ACTIVE'&&returns.value.some(i=>i.id===p.item_id))}else owned.value=[]
 }catch(e:any){if(token!==version)return;ready.value=false;links.value=[];owned.value=[];if(e?.statusCode!==503&&e?.status!==503)error.value='Could not check after-sales registration. The server will validate the sale.'}}
watch(()=>[itemIds.value,props.clientId,scope.companyId.value,returns.value.length],load);onMounted(load)
watch(covered,value=>emit('required',value.length>0),{deep:true,immediate:true})
watch(()=>props.items,items=>{
  for(const item of items)if(item.id&&!item.return&&!item.serviceLineKey)item.serviceLineKey=crypto.randomUUID()
  const valid=props.modelValue.filter(d=>items.some(i=>(d.lineKey?i.serviceLineKey===d.lineKey:i.id===d.itemId)&&!i.return&&d.unit<Number(i.qty)))
  if(valid.length!==props.modelValue.length)emit('update:modelValue',valid)
},{deep:true,immediate:true})
watch(()=>props.clientId,()=>emit('update:returnedUnitIds',[]))
function units(item:any){return Math.max(0,Math.min(10000,Math.trunc(Number(item.qty)||0)))}
function set(item:any,unit:number,key:string,value:string){const rows=props.modelValue.filter(r=>!(r.lineKey===item.serviceLineKey&&r.unit===unit));const existing=props.modelValue.find(r=>r.lineKey===item.serviceLineKey&&r.unit===unit)||{itemId:item.id,entryId:item.entryId,lineKey:item.serviceLineKey,unit};emit('update:modelValue',[...rows,{...existing,[key]:value}])}
</script>
<template><section v-if="covered.length||owned.length||error" class="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700"><h3 class="text-sm font-semibold">After-sales registration</h3><UAlert v-if="error" role="alert" color="orange" variant="soft" :title="error"/><p v-if="covered.length" class="text-xs text-gray-500 dark:text-gray-400">Select a client to register coverage and maintenance for each unit.</p><details v-for="item in covered" :key="item.serviceLineKey||item.id" class="rounded-md border border-gray-200 p-3 text-sm dark:border-gray-700"><summary class="cursor-pointer font-medium">{{item.name}} - {{units(item)}} unit(s)</summary><p class="my-3 text-xs text-gray-500 dark:text-gray-400">Serial numbers and installation dates are optional.</p><div v-for="n in units(item)" :key="n" class="mb-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-3"><span class="text-xs text-gray-500 dark:text-gray-400">Unit {{n}}</span><UFormGroup label="Serial number"><UInput :model-value="modelValue.find(r=>r.lineKey===item.serviceLineKey&&r.unit===n-1)?.serialNumber||''" @update:model-value="value=>set(item,n-1,'serialNumber',String(value))"/></UFormGroup><UFormGroup label="Installed on"><UInput type="date" :model-value="modelValue.find(r=>r.lineKey===item.serviceLineKey&&r.unit===n-1)?.installedOn||''" @update:model-value="value=>set(item,n-1,'installedOn',String(value))"/></UFormGroup></div></details><UFormGroup v-if="owned.length" label="Client units being returned" help="Select the exact units included in this return."><USelectMenu :model-value="returnedUnitIds" :options="owned.map(p=>({value:p.id,label:p.reference+' - '+p.name+' - '+(p.serial_number||'No serial')}))" multiple value-attribute="value" option-attribute="label" @update:model-value="value=>emit('update:returnedUnitIds',value)"/></UFormGroup></section></template>
