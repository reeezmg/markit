<script setup lang="ts">
import { format, sub } from 'date-fns';
import { distributorAccountingTransactions } from '../../utils/distributor-accounting-transactions';
const props = defineProps<{ companyId: string; distributorId: string; revision?: unknown }>();
const data = ref<any>(null);
const busy = ref(false);
const error = ref('');
const search = ref('');
const type = ref('ALL');
const start = ref('');
const end = ref('');
const page = ref(1);
const pageCount = ref(5);
const sort = ref({column:'date',direction:'asc' as 'asc' | 'desc'});
const filterOpen = ref(false);
const ranges = [
  {label:'Last 7 days',duration:{days:7}}, {label:'Last 30 days',duration:{days:30}},
  {label:'Last 3 months',duration:{months:3}}, {label:'Last 6 months',duration:{months:6}},
  {label:'Last year',duration:{years:1}},
];
const dateRange = computed({
  get: () => ({start: start.value ? new Date(start.value+'T00:00:00') : new Date(), end: end.value ? new Date(end.value+'T00:00:00') : new Date()}),
  set: (range: {start:Date;end:Date}) => {
    const local = (d:Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    start.value=local(range.start); end.value=local(range.end);
  },
});
const columns = [
  {key:'reference',label:'Reference',sortable:true}, {key:'date',label:'Date',sortable:true},
  {key:'type',label:'Type',sortable:true}, {key:'debit',label:'Debit',sortable:true},
  {key:'credit',label:'Credit',sortable:true}, {key:'due',label:'Due'}, {key:'actions',label:'Actions'},
];
const selected = ref<any>(null);
let generation = 0;
const auth = useNuxtApp().$auth;
const allowed = computed(() => ['admin', 'manager', 'accountant'].includes(auth.session.value?.role || ''));
async function load() {
  const current = ++generation;
  data.value = null; error.value = ''; busy.value = true;
  if (!allowed.value) { busy.value = false; return; }
  try {
    const result = await $fetch(`/api/accountant/distributors/${props.distributorId}`, {
      headers: { 'x-company-id': props.companyId, 'x-company-filter': props.companyId },
    });
    if (current === generation) data.value = result;
  } catch (e: any) { if (current === generation) error.value = e.data?.statusMessage || e.message; }
  finally { if (current === generation) busy.value = false; }
}
watch(() => [props.companyId, props.distributorId, props.revision], () => { selected.value = null; load(); }, { immediate: true });
const all = computed(() => distributorAccountingTransactions(data.value || {}));
const filtered = computed(() => all.value.filter(row => {
  const date = new Date(row.date);
  const day = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return (!start.value || day >= start.value) && (!end.value || day <= end.value)
    && (type.value === 'ALL' || row.type === type.value)
    && `${row.reference} ${row.description}`.toLowerCase().includes(search.value.toLowerCase());
}));
watch([search, type, start, end, data, pageCount, sort], () => { page.value = 1; });
const sorted = computed(() => [...filtered.value].sort((a,b) => {
  const key=sort.value.column;
  const left=key==='reference' ? reference(a) : a[key];
  const right=key==='reference' ? reference(b) : b[key];
  const comparison=typeof left==='number' ? left-right : String(left).localeCompare(String(right),undefined,{numeric:true});
  return sort.value.direction==='asc' ? comparison : -comparison;
}));
const rows = computed(() => sorted.value.slice((page.value-1)*Number(pageCount.value), page.value*Number(pageCount.value)));
const money = (value: number) => value.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
const typeLabels: Record<string,string> = {ALL:'All transactions',PURCHASE:'Purchase',PAYMENT:'Payment',RETURN:'Return',RECEIPT:'Receipt',OPENING:'Opening balance',REVERSAL:'Reversal',JOURNAL:'Journal'};
const typeOptions = Object.entries(typeLabels).map(([value,label])=>({value,label}));
const reference = (row:any) => /^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(row.reference || '') ? row.entryNumber || 'Journal' : row.reference || row.entryNumber || 'Journal';
const dateLabel = (date:any) => new Date(date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
const hasFilters = computed(()=>Boolean(search.value || start.value || end.value || type.value!=='ALL'));
function clearFilters() { search.value=''; start.value=''; end.value=''; type.value='ALL'; }
function download() {
  const quote = (value: any) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"','""')}"`;
  const csv = [['Date','Reference','Type','Description','Debit','Credit','Running due'], ...filtered.value.map(r => [r.date,r.reference,r.type,r.description,r.debit,r.credit,r.due])].map(row => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href=url; link.download='distributor-accounting.csv'; link.click(); URL.revokeObjectURL(url);
}
</script>
<template>
  <section class="min-w-0 space-y-4">
    <UAlert v-if="!allowed" title="Accounting access requires an admin, manager or accountant role." />
    <UAlert v-if="error" color="red" title="Could not load accounting transactions" :description="error" />
    <UAlert v-if="data && !data.enabled" color="amber" title="Accounting is not connected" description="Open Accounting above to choose accounts and import history." />
    <UCard class="w-full min-w-0" :ui="{base:'',ring:'ring-1 ring-primary-200 dark:ring-primary-800',divide:'divide-y divide-primary-100 dark:divide-primary-900/40',header:{padding:'px-4 py-3'},body:{padding:''},footer:{padding:'px-4 py-3'}}">
      <template #header>
        <div class="flex flex-wrap justify-between items-center gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <UPopover :popper="{placement:'bottom-start'}">
              <UButton icon="i-heroicons-calendar-days-20-solid" size="xs" color="gray" variant="outline" class="max-w-[200px]" truncate>
                {{ start && end ? `${format(dateRange.start, 'd MMM yy')} - ${format(dateRange.end, 'd MMM yy')}` : 'All dates' }}
              </UButton>
              <template #panel="{close}">
                <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                  <div class="hidden sm:flex flex-col py-4">
                    <UButton v-for="range in ranges" :key="range.label" :label="range.label" color="gray" variant="ghost" class="rounded-none px-6" @click="dateRange={start:sub(new Date(),range.duration),end:new Date()};close()" />
                    <UButton label="All dates" color="gray" variant="ghost" class="rounded-none px-6" @click="start='';end='';close()" />
                  </div>
                  <DatePicker v-model="dateRange" @close="close" />
                </div>
              </template>
            </UPopover>
            <UInput v-model="search" size="xs" placeholder="Reference..." icon="i-heroicons-magnifying-glass-20-solid" class="w-40" />
          </div>
          <div class="flex items-center gap-2"><slot name="controls" /></div>
        </div>
      </template>
      <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-1.5"><span class="text-xs text-gray-500">Rows:</span><USelect v-model="pageCount" :options="[5,10,20]" size="xs" class="w-16" /></div>
        <div class="flex items-center gap-1">
          <UButton icon="i-heroicons-funnel" size="xs" :color="hasFilters ? 'primary' : 'gray'" variant="outline" aria-label="Filter transactions" @click="filterOpen=true" />
          <UButton icon="i-heroicons-arrow-down-tray" size="xs" color="gray" variant="outline" aria-label="Download CSV" :disabled="!filtered.length" @click="download" />
        </div>
      </div>
      <UTable v-model:sort="sort" :rows="rows" :columns="columns" :loading="busy" sort-mode="manual" sort-asc-icon="i-heroicons-arrow-up" sort-desc-icon="i-heroicons-arrow-down" class="w-full">
        <template #reference-data="{row}"><button class="block max-w-[140px] truncate text-left hover:text-primary-500" :title="row.description || row.reference" @click="selected=row">{{ reference(row) }}</button></template>
        <template #date-data="{row}">{{ new Date(row.date).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'2-digit'}) }}</template>
        <template #type-data="{row}"><UBadge :color="row.type==='PAYMENT' ? 'green' : row.type==='PURCHASE' ? 'blue' : 'gray'" variant="subtle" size="xs">{{ typeLabels[row.type] }}</UBadge></template>
        <template #credit-data="{row}"><span class="tabular-nums">{{ row.credit ? money(row.credit) : '-' }}</span></template>
        <template #debit-data="{row}"><span class="tabular-nums">{{ row.debit ? money(row.debit) : '-' }}</span></template>
        <template #due-data="{row}"><span class="tabular-nums font-semibold" :class="row.due>0 ? 'text-red-600' : row.due<0 ? 'text-green-600' : 'text-gray-500'">{{ money(row.due) }}</span></template>
        <template #actions-data="{row}"><div class="flex items-center"><UButton icon="i-heroicons-eye" size="xs" color="gray" variant="ghost" aria-label="View details" @click="selected=row" /><slot name="actions" :row="row" /></div></template>
      </UTable>
      <template #footer>
        <div class="flex flex-wrap justify-between items-center gap-2">
          <span class="text-xs text-gray-500">{{ filtered.length ? (page-1)*Number(pageCount)+1 : 0 }}&ndash;{{ Math.min(page*Number(pageCount),filtered.length) }} of {{ filtered.length }} <span v-if="filtered.length!==all.length" class="text-gray-400">(filtered from {{ all.length }})</span></span>
          <UPagination v-model="page" :page-count="Number(pageCount)" :total="filtered.length" size="xs" :ui="{wrapper:'flex items-center gap-1',rounded:'!rounded-full min-w-[28px] justify-center'}" />
        </div>
      </template>
    </UCard>
    <UModal v-model="filterOpen">
      <UCard>
        <template #header><div class="flex justify-between items-center"><h3 class="font-semibold">Filter transactions</h3><UButton icon="i-heroicons-x-mark" aria-label="Close filters" color="gray" variant="ghost" @click="filterOpen=false" /></div></template>
        <UFormGroup label="Transaction type"><USelect v-model="type" :options="typeOptions" /></UFormGroup>
        <template #footer><div class="flex justify-end gap-2"><UButton label="Reset" color="gray" variant="outline" @click="clearFilters" /><UButton label="Done" @click="filterOpen=false" /></div></template>
      </UCard>
    </UModal>
    <UModal :model-value="Boolean(selected)" @update:model-value="selected=null">
      <div v-if="selected" class="p-5 space-y-5">
        <div class="flex justify-between items-start"><div><p class="text-xs text-gray-500 mb-1">{{ typeLabels[selected.type] }} &middot; {{ dateLabel(selected.date) }}</p><h3 class="font-semibold text-lg">{{ reference(selected) }}</h3></div><UButton icon="i-heroicons-x-mark" aria-label="Close details" color="gray" variant="ghost" @click="selected=null" /></div>
        <p v-if="selected.description" class="text-sm text-gray-500 break-words">{{ selected.description }}</p>
        <div class="divide-y divide-gray-100 dark:divide-gray-800">
          <div v-for="(line,i) in selected.lines" :key="i" class="py-3 flex items-center justify-between gap-4"><span class="text-sm">{{ line.account }}</span><div class="text-right shrink-0"><span class="block text-[10px] text-gray-500">{{ line.side }}</span><span class="text-sm font-medium tabular-nums">{{ money(Number(line.amount)) }}</span></div></div>
        </div>
        <UButton label="Open journal" icon="i-heroicons-arrow-top-right-on-square" variant="soft" :to="`/accountant/manual-journals?entryCompany=${companyId}&journal=${selected.id}`" />
      </div>
    </UModal>
  </section>
</template>
