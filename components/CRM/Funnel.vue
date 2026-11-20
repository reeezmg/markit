<script setup lang="ts">
import { computed, ref, watch } from 'vue'
const props=defineProps<{settings:any;rows:any[];currency:string}>()
const pipelineKey=ref(props.settings.pipelines[0]?.key||'')
watch(()=>props.settings.pipelines,()=>{if(!props.settings.pipelines.some((p:any)=>p.key===pipelineKey.value))pipelineKey.value=props.settings.pipelines[0]?.key||''})
const pipeline=computed(()=>props.settings.pipelines.find((p:any)=>p.key===pipelineKey.value))
const selected=computed(()=>props.rows.filter(row=>row.pipelineKey===pipelineKey.value))
const totalFor=(status?:string)=>selected.value.filter(row=>!status||row.status===status).reduce((n,row)=>n+Number(row.count),0)
const total=computed(()=>totalFor()),won=computed(()=>totalFor('WON')),lost=computed(()=>totalFor('LOST'))
const stages=computed(()=>{
  const configured=pipeline.value?.stages||[]
  const extra=[...new Map(selected.value.filter(row=>!configured.some((stage:any)=>stage.key===row.stageKey)).map(row=>[row.stageKey,{key:row.stageKey,name:'Previous stage: '+row.stageKey,status:row.status}])).values()]
  return [...configured,...extra].map(stage=>{
    const rows=selected.value.filter(row=>row.stageKey===stage.key),count=rows.reduce((n,row)=>n+Number(row.count),0)
    return {...stage,count,value:rows.reduce((n,row)=>n+Number(row.value),0),age:count?Math.round(rows.reduce((n,row)=>n+Number(row.ageDays||0)*Number(row.count),0)/count):0}
  })
})
const maximum=computed(()=>Math.max(1,...stages.value.map(stage=>stage.count)))
const money=(value:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:props.currency||'INR',maximumFractionDigits:2}).format(value)
</script>

<template>
  <section aria-label="Sales funnel" class="space-y-5">
    <div class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
      <label class="block text-sm font-medium">Pipeline<select v-model="pipelineKey" class="mt-2 block w-full max-w-sm rounded-lg border border-gray-300 bg-transparent p-2 dark:border-gray-700"><option v-for="item in settings.pipelines" :key="item.key" :value="item.key">{{item.name}}</option></select></label>
      <p class="mt-3 text-sm text-gray-500">Current stage of deals created in the selected period. Bars show how many deals are in each stage today, including won and lost outcomes. They do not measure historical stage-to-stage conversion.</p>
      <p class="mt-2 text-xs text-gray-500">Archived open deals are excluded. Closed outcomes are retained. Deal values use your company currency; won value is separate from invoiced or collected revenue.</p>
    </div>
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div v-for="card in [{label:'Total deals',value:total},{label:'Open deals',value:totalFor('OPEN')},{label:'Won deals',value:won},{label:'Lost deals',value:lost},{label:'Win rate (closed deals)',value:won+lost?Math.round(won/(won+lost)*100)+'%':'—'}]" :key="card.label" class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"><p class="text-sm text-gray-500">{{card.label}}</p><p class="mt-2 text-2xl font-semibold">{{card.value}}</p></div>
    </div>
    <section class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
      <h2 class="font-semibold">Deals by current stage</h2>
      <p v-if="!total" class="py-10 text-center text-sm text-gray-500">No deals in this pipeline for the selected period. Choose another pipeline or adjust the dates.</p>
      <ol v-else class="mt-5 space-y-5">
        <li v-for="stage in stages" :key="stage.key">
          <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm"><span class="font-medium">{{stage.name}} <span class="ml-1 text-xs font-normal text-gray-500">{{stage.status}}</span></span><span>{{stage.count}} deals · {{money(stage.value)}}</span></div>
          <div class="h-9 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800" role="img" :aria-label="stage.name+': '+stage.count+' deals, '+(total?Math.round(stage.count/total*100):0)+'% of deals'"><div class="h-full rounded-lg transition-all" :class="stage.status==='WON'?'bg-emerald-500':stage.status==='LOST'?'bg-red-400':'bg-primary-500'" :style="{width:stage.count/maximum*100+'%'}"/></div>
          <p class="mt-1 text-xs text-gray-500">{{total?Math.round(stage.count/total*100):0}}% of deals · {{stage.count?'Average '+stage.age+' days in current stage':'No deals in this stage'}}</p>
        </li>
      </ol>
    </section>
  </section>
</template>
