<script setup lang="ts">
import type { ServiceField } from '~/utils/after-sales'
const props=defineProps<{fields:ServiceField[];modelValue:Record<string,any>}>()
const emit=defineEmits<{'update:modelValue':[value:Record<string,any>]}>()
function update(key:string,value:any){emit('update:modelValue',{...props.modelValue,[key]:value})}
</script>
<template><div class="grid grid-cols-1 gap-4 sm:grid-cols-2"><UFormGroup v-for="field in fields" :key="field.key" :label="field.label+(field.unit?' ('+field.unit+')':'')" :help="field.required?'Required before completion':undefined"><USelect v-if="field.type==='BOOLEAN'" :model-value="modelValue[field.key]===undefined?'':String(modelValue[field.key])" :options="[{value:'',label:'Not recorded'},{value:'true',label:'Yes'},{value:'false',label:'No'}]" @update:model-value="value=>update(field.key,value===''?undefined:value==='true')"/><UInput v-else :type="field.type==='NUMBER'?'number':field.type==='DATE'?'date':'text'" :model-value="modelValue[field.key]??''" :step="field.type==='NUMBER'?'any':undefined" @update:model-value="value=>update(field.key,field.type==='NUMBER'&&value!==''?Number(value):value)"/></UFormGroup></div></template>
