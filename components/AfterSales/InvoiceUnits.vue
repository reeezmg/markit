<script setup lang="ts">
const props=defineProps<{billId:string;modelValue:string[]}>(),emit=defineEmits<{'update:modelValue':[value:string[]]}>()
const scope=useCompanyScope(),rows=ref<any[]>([])
const options=computed(()=>rows.value.filter(row=>['ACTIVE','REPLACED'].includes(row.status)).map(p=>({value:p.id,label:p.reference+' - '+p.name+' - '+(p.serial_number||'No serial')+(p.status==='REPLACED'?' (Replaced)':'')})))
onMounted(async()=>{try{rows.value=await scope.fetch('/api/after-sales/products',{query:{billId:props.billId}})}catch{/* The feature is optional until its migration is installed. */}})
</script>
<template><section v-if="rows.length" class="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700"><UButton :to="{path:'/after-sales',query:{billId,entryCompany:scope.companyId.value}}" color="gray" variant="link" icon="i-heroicons-shield-check" class="p-0">View client coverage and service history</UButton><UFormGroup label="Registered units removed by this edit" help="Choose exact units for quantity reductions or product/client corrections. Removing a replaced original also ends its carried coverage."><USelectMenu :model-value="modelValue" :options="options" multiple value-attribute="value" option-attribute="label" placeholder="Select client units" @update:model-value="value=>emit('update:modelValue',value)"/></UFormGroup></section></template>
