<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
const props=defineProps<{
  rows:any[]; total:number; page:number; pageSize:number; loading:boolean; saving:boolean
  filters:Record<string,any>; selected:string[]; staff:any[]; segments:any[]
  manager:boolean; companyId:string; canEdit:(row:any)=>boolean
}>()
const emit=defineEmits<{
  'update:filters':[value:Record<string,any>]; 'update:selected':[value:string[]]
  'update:page':[value:number]; 'update:pageSize':[value:number]; search:[]
  edit:[row:any]; complete:[row:any]; archive:[row:any]; export:[]; assign:[ownerId:string]; 'bulk-archive':[archived:boolean]
}>()
const columns=[{key:'subject',label:'Activity'},
  {key:'kind',label:'Type',class:'w-[10%]',rowClass:'truncate'},
  {key:'clientName',label:'Client / owner',class:'hidden md:table-cell w-[25%]',rowClass:'hidden md:table-cell'},
  {key:'dueAt',label:'Due / status',class:'w-[38%] md:w-[28%]'},
  {key:'actions',label:'',class:'w-16'}]
const selectedColumns=ref(columns.filter(column=>column.key!=='kind'))
const visibleColumns=computed(()=>columns.filter(column=>selectedColumns.value.length?selectedColumns.value.some(selected=>selected.key===column.key):column.key==='subject'))
const selectedRows=computed({get:()=>props.manager?props.rows.filter(row=>props.selected.includes(row.id)):undefined,
  set:(rows:any[]|undefined)=>emit('update:selected',(rows||[]).map(row=>row.id))})
const filtersOpen=ref(false),owner=ref('')
const tabs=[{key:'all',label:'All activities'},{key:'open',label:'Open'},{key:'overdue',label:'Overdue'},{key:'done',label:'Completed'}]
const activeTab=computed(()=>props.filters.due==='OVERDUE'&&props.filters.status==='OPEN'?'overdue':props.filters.status==='DONE'?'done':props.filters.status==='OPEN'?'open':props.filters.status?'custom':'all')
const first=computed(()=>props.total?(props.page-1)*props.pageSize+1:0)
const last=computed(()=>Math.min((props.page-1)*props.pageSize+props.rows.length,props.total))
const activeFilters=computed(()=>['ownerId','segmentKey','kind','priority','due','from','to'].filter(key=>props.filters[key]).length+(props.filters.archived==='false'?0:1)+(props.filters.status==='CANCELLED'?1:0))
let searchTimer:ReturnType<typeof setTimeout>|undefined
function update(key:string,value:any,immediate=true){
  clearTimeout(searchTimer)
  const filters={...props.filters,[key]:value}
  if(key==='due'&&value)filters.status='OPEN'
  if(key==='status'&&value!=='OPEN')filters.due=''
  emit('update:filters',filters)
  if(immediate)emit('search');else searchTimer=setTimeout(()=>emit('search'),250)
}
function tab(key:string){clearTimeout(searchTimer);emit('update:filters',{...props.filters,status:key==='done'?'DONE':['open','overdue'].includes(key)?'OPEN':'',due:key==='overdue'?'OVERDUE':''});emit('search')}
function reset(){clearTimeout(searchTimer);emit('update:filters',{q:'',status:'',ownerId:'',segmentKey:'',kind:'',priority:'',due:'',from:'',to:'',archived:'false'});emit('search')}
function searchNow(){clearTimeout(searchTimer);emit('search')}
const date=(value:any)=>value?new Date(value).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric'}):'No due date'
const time=(value:any)=>value?new Date(value).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'}):''
const ownerName=(row:any)=>row.ownerName||props.staff.find(member=>member.id===row.ownerId)?.name||'Former team member'
const overdue=(row:any)=>row.status==='OPEN'&&row.dueAt&&new Date(row.dueAt)<new Date()
const statusColor=(row:any):'green'|'gray'|'red'|'blue'=>row.status==='DONE'?'green':row.status==='CANCELLED'?'gray':overdue(row)?'red':'blue'
const actions=(row:any)=>[
  [{label:props.canEdit(row)?'Edit activity':'View activity',icon:'i-heroicons-pencil-square',click:()=>emit('edit',row)}],
  ...(props.manager?[[{label:row.archived?'Restore':'Archive',icon:row.archived?'i-heroicons-arrow-uturn-left':'i-heroicons-archive-box',click:()=>emit('archive',row)}]]:[]),
]
onBeforeUnmount(()=>clearTimeout(searchTimer))
</script>

<template>
  <div class="min-w-0" data-testid="crm-activities-table">
    <nav aria-label="Activity views" class="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
      <button v-for="item in tabs" :key="item.key" type="button" :aria-current="activeTab===item.key?'page':undefined" :disabled="saving" class="whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" :class="activeTab===item.key?'border-primary-500 text-primary-600':'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'" @click="tab(item.key)">{{item.label}}</button>
    </nav>
    <UCard class="w-full" :ui="{divide:'divide-y divide-gray-200 dark:divide-gray-700',header:{padding:'px-4 py-4'},body:{padding:'',base:'divide-y divide-gray-200 dark:divide-gray-700'},footer:{padding:'p-4'}}">
      <template #header>
        <form class="flex flex-wrap items-center justify-between gap-3" @submit.prevent="searchNow">
          <UInput :model-value="filters.q||''" icon="i-heroicons-magnifying-glass" placeholder="Search activities" aria-label="Search activities" class="w-full sm:w-72" :disabled="saving" @update:model-value="update('q',$event,false)" />
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm text-gray-500">{{total}} {{total===1?'activity':'activities'}}</span>
            <USelect :model-value="filters.ownerId||''" :options="[{label:'All owners',value:''},...staff.map(member=>({label:member.name,value:member.id}))]" aria-label="Filter activity owner" :disabled="saving" class="w-40" @update:model-value="update('ownerId',$event)" />
            <USelect :model-value="filters.due||''" :options="[{label:'Any due date',value:''},{label:'Overdue',value:'OVERDUE'},{label:'Today',value:'TODAY'},{label:'Next 7 days',value:'NEXT7'}]" aria-label="Filter activity due date" :disabled="saving" class="w-36" @update:model-value="update('due',$event)" />
          </div>
        </form>
      </template>
      <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div class="flex items-center gap-2"><span class="text-xs text-gray-500">Rows per page:</span><USelect :model-value="pageSize" :options="[10,20,30,50,100]" size="xs" class="w-20" aria-label="Activity rows per page" :disabled="loading||saving" @update:model-value="emit('update:pageSize',Number($event))" /></div>
        <div class="flex flex-wrap items-center gap-1.5">
          <USelectMenu v-model="selectedColumns" :options="columns" option-attribute="label" multiple :disabled="saving"><UButton icon="i-heroicons-view-columns" color="gray" size="xs">Columns</UButton></USelectMenu>
          <UButton icon="i-heroicons-arrow-down-tray" color="gray" size="xs" :disabled="loading||saving" @click="emit('export')">Export CSV</UButton>
          <UButton icon="i-heroicons-funnel" color="gray" size="xs" :variant="filtersOpen?'soft':'solid'" :aria-expanded="filtersOpen" aria-controls="activity-table-filters" aria-label="Filters" @click="filtersOpen=!filtersOpen">Filters<span v-if="activeFilters" class="ml-1 text-primary-600">{{activeFilters}}</span></UButton>
          <UButton icon="i-heroicons-arrow-path" color="gray" size="xs" :disabled="saving" @click="reset">Reset</UButton>
        </div>
      </div>
      <form v-if="filtersOpen" id="activity-table-filters" class="grid gap-3 bg-gray-50/60 p-4 sm:grid-cols-3 lg:grid-cols-4 dark:bg-gray-800/30" @submit.prevent="searchNow">
        <label class="crm-label">Status<select :value="filters.status||''" class="crm-input" :disabled="saving" @change="update('status',($event.target as HTMLSelectElement).value)"><option value="">All statuses</option><option value="OPEN">Open</option><option value="DONE">Completed</option><option value="CANCELLED">Cancelled</option></select></label>
        <label class="crm-label">Activity type<select :value="filters.kind||''" class="crm-input" :disabled="saving" @change="update('kind',($event.target as HTMLSelectElement).value)"><option value="">All types</option><option v-for="item in ['TASK','CALL','MEETING','EMAIL','WHATSAPP','NOTE']" :key="item" :value="item">{{item}}</option></select></label>
        <label class="crm-label">Priority<select :value="filters.priority||''" class="crm-input" :disabled="saving" @change="update('priority',($event.target as HTMLSelectElement).value)"><option value="">All priorities</option><option v-for="item in ['LOW','NORMAL','HIGH']" :key="item" :value="item">{{item}}</option></select></label>
        <label class="crm-label">Segment<select :value="filters.segmentKey||''" class="crm-input" :disabled="saving" @change="update('segmentKey',($event.target as HTMLSelectElement).value)"><option value="">All segments</option><option v-for="item in segments" :key="item.key" :value="item.key">{{item.name}}</option></select></label>
        <label class="crm-label">Due from<input :value="filters.from||''" class="crm-input" type="date" :disabled="saving" @change="update('from',($event.target as HTMLInputElement).value)" /></label>
        <label class="crm-label">Due through<input :value="filters.to||''" class="crm-input" type="date" :disabled="saving" @change="update('to',($event.target as HTMLInputElement).value)" /></label>
        <label class="crm-label">Records<select :value="filters.archived||'false'" class="crm-input" :disabled="saving" @change="update('archived',($event.target as HTMLSelectElement).value)"><option value="false">Active records</option><option value="true">Archived records</option><option value="all">All records</option></select></label>
      </form>
      <div v-if="manager&&selected.length" class="flex flex-wrap items-center gap-2 bg-primary-50 px-4 py-3 dark:bg-primary-950">
        <span class="mr-2 text-sm font-medium">{{selected.length}} selected</span><USelect v-model="owner" :options="[{label:'Assign owner',value:''},...staff.map(member=>({label:member.name,value:member.id}))]" aria-label="Assign activity owner" size="xs" />
        <UButton color="gray" size="xs" :disabled="!owner||saving" @click="emit('assign',owner)">Assign</UButton><UButton color="gray" size="xs" :disabled="saving" @click="emit('bulk-archive',true)">Archive</UButton><UButton v-if="filters.archived!=='false'" color="gray" size="xs" :disabled="saving" @click="emit('bulk-archive',false)">Restore</UButton>
        <UButton color="gray" variant="ghost" size="xs" :disabled="saving" @click="emit('update:selected',[])">Clear selection</UButton>
      </div>
      <UTable :key="visibleColumns.map(column=>column.key).join(',')" v-model="selectedRows" :rows="rows" :columns="visibleColumns" :loading="loading" :empty-state="{icon:'i-heroicons-clipboard-document-list',label:'No activities found. Create an activity or adjust your filters.'}" :ui="{wrapper:'activity-table relative w-full overflow-hidden [&_th:has(input)]:w-8 [&_th]:overflow-hidden [&_th]:text-ellipsis',base:'w-full table-fixed',th:{padding:'px-2 py-3',size:'text-xs'},td:{padding:'px-2 py-3',base:'overflow-hidden',size:'text-sm'},tr:{base:'transition-colors'}}">
        <template #subject-data="{row}">
          <button class="block w-full truncate text-left font-medium text-primary-600 hover:underline" :title="row.subject" @click="emit('edit',row)">{{row.subject}}</button>
          <p class="mt-1 truncate text-xs text-gray-500">{{row.kind}}<span v-if="row.archived" class="ml-2 text-amber-600">Archived</span></p>
          <NuxtLink v-if="row.segmentKey" :to="{path:'/crm/segments',query:{entryCompany:companyId,segmentKey:row.segmentKey}}" class="mt-1 block truncate text-xs text-primary-600" :title="row.segmentName||'Removed segment'">Segment: {{row.segmentName||'Removed segment'}}</NuxtLink>
          <div class="mt-1 space-y-1 text-xs text-gray-500 md:hidden">
            <NuxtLink v-if="row.clientId" :to="{path:'/client',query:{from:'crm',entryCompany:companyId,crmClient:row.clientId}}" class="block truncate" :title="row.clientName||'Client'">{{row.clientName||'Client'}}</NuxtLink>
            <NuxtLink v-if="row.dealId" :to="{path:'/crm/deals/'+row.dealId,query:{entryCompany:companyId}}" class="block truncate" :title="row.dealName||'View deal'">{{row.dealName||'View deal'}}</NuxtLink>
            <span class="block truncate" :title="ownerName(row)">{{ownerName(row)}}</span>
          </div>
        </template>
        <template #clientName-data="{row}">
          <NuxtLink v-if="row.clientId" :to="{path:'/client',query:{from:'crm',entryCompany:companyId,crmClient:row.clientId}}" class="block truncate hover:text-primary-600" :title="row.clientName||'Client'">{{row.clientName||'Client'}}</NuxtLink><span v-else class="text-gray-400">Unlinked</span>
          <NuxtLink v-if="row.dealId" :to="{path:'/crm/deals/'+row.dealId,query:{entryCompany:companyId}}" class="mt-1 block truncate text-xs text-gray-500" :title="row.dealName||'View deal'">{{row.dealName||'View deal'}}</NuxtLink>
          <p class="mt-1 truncate text-xs text-gray-500" :title="ownerName(row)">{{ownerName(row)}}</p>
        </template>
        <template #dueAt-data="{row}">
          <p class="truncate text-xs" :class="overdue(row)?'font-medium text-red-600':'text-gray-600 dark:text-gray-300'" :title="date(row.dueAt)+' '+time(row.dueAt)">{{date(row.dueAt)}}</p>
          <p v-if="row.dueAt" class="mt-0.5 truncate text-xs text-gray-500">{{time(row.dueAt)}}</p>
          <div class="mt-1.5 flex flex-wrap gap-1">
            <UBadge :color="statusColor(row)" variant="subtle" size="xs">{{row.status==='DONE'?'Completed':row.status==='CANCELLED'?'Cancelled':overdue(row)?'Overdue':'Open'}}</UBadge>
            <UBadge v-if="row.priority&&row.priority!=='NORMAL'" :color="row.priority==='HIGH'?'red':'gray'" variant="subtle" size="xs">{{row.priority}}</UBadge>
          </div>
        </template>
        <template #actions-data="{row}"><div class="flex flex-col items-center gap-1 sm:flex-row sm:justify-end">
          <UButton v-if="row.status==='OPEN'&&canEdit(row)" icon="i-heroicons-check" color="green" variant="ghost" size="xs" aria-label="Complete" :title="'Complete '+row.subject" :disabled="saving" @click="emit('complete',row)" />
          <UDropdown :items="actions(row)"><UButton icon="i-heroicons-ellipsis-horizontal" color="gray" variant="ghost" size="xs" :aria-label="'Actions for '+row.subject" :disabled="saving" /></UDropdown>
        </div></template>
      </UTable>
      <template #footer><div class="flex flex-wrap items-center justify-between gap-3"><p class="text-sm text-gray-500">Showing <span class="font-medium">{{first}}</span> to <span class="font-medium">{{last}}</span> of <span class="font-medium">{{total}}</span> results</p><UPagination :model-value="page" :page-count="pageSize" :total="total" :disabled="loading||saving" :ui="{wrapper:'flex items-center gap-1',rounded:'!rounded-full min-w-[32px] justify-center',default:{activeButton:{variant:'outline'}}}" @update:model-value="emit('update:page',$event)" /></div></template>
    </UCard>
  </div>
</template>
