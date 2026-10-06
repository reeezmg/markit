<script setup lang="ts">
const tax=defineModel<number|string>('tax',{default:0});
const recoverable=defineModel<number|string|null>('recoverable',{default:null});
const treatment=ref('');
watch([tax,recoverable],()=>{
 if(Number(tax.value)<=0){treatment.value='';return;}
 if(recoverable.value===null||recoverable.value===''){if(treatment.value!=='partial')treatment.value='';return;}
 if(treatment.value!=='partial')treatment.value=Number(recoverable.value)===0?'none':Number(recoverable.value)===Number(tax.value)?'full':'partial';
},{immediate:true});
function changeTax(){recoverable.value=null;treatment.value='';}
function choose(){recoverable.value=treatment.value==='full'?Number(tax.value):treatment.value==='none'?0:null;}
</script>
<template>
 <UFormGroup label="Tax included in amount"><UInput v-model="tax" type="number" min="0" step="0.01" placeholder="0.00" @update:model-value="changeTax" /></UFormGroup>
 <UFormGroup v-if="Number(tax)>0" label="Tax recovery" required>
  <USelect v-model="treatment" placeholder="Select treatment" :options="[{label:'Recoverable',value:'full'},{label:'Non-recoverable',value:'none'},{label:'Partly recoverable',value:'partial'}]" @update:model-value="choose" />
 </UFormGroup>
 <UFormGroup v-if="Number(tax)>0 && treatment==='partial'" label="Recoverable tax amount" required><UInput v-model="recoverable" type="number" min="0" :max="Number(tax)" step="0.01" /></UFormGroup>
</template>
