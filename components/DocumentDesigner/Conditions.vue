<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ruleMatches, type DesignerRule, type RuleResolver } from '~/utils/designer-rules'
import type { QuoteBindingField } from '~/utils/quote-bindings'
const props = defineProps<{ rules?: DesignerRule[]; fields: QuoteBindingField[]; resolve: RuleResolver; text?: boolean; protected?: boolean }>()
const emit = defineEmits<{ change: [rules: DesignerRule[]] }>()
const pending = ref<DesignerRule[] | null>(null)
watch(() => props.rules, () => { pending.value = null })
const rules = computed(() => pending.value || props.rules || [])
function change(value: DesignerRule[]) { pending.value = value; emit('change', value) }
const fields = computed(() => props.fields.filter(field => field.kind === 'text'))
const actions = computed(() => [
  ...(!props.protected ? [{value:'show',label:'Show only when matched'}, {value:'hide',label:'Hide when matched'}] : []),
  ...(props.text ? [{value:'strike',label:'Strikethrough'}, {value:'bold',label:'Bold'}, {value:'italic',label:'Italic'}, {value:'underline',label:'Underline'}, {value:'color',label:'Text colour'}] : []),
  {value:'background',label:'Background / fill colour'}, {value:'borderColor',label:'Stroke colour'},
])
const operators = [{value:'filled',label:'Has a value'}, {value:'empty',label:'Is empty'}, {value:'eq',label:'Equals'}, {value:'neq',label:'Does not equal'}, {value:'lt',label:'Less than'}, {value:'lte',label:'Less than or equal'}, {value:'gt',label:'Greater than'}, {value:'gte',label:'Greater than or equal'}, {value:'contains',label:'Contains'}]
function update(index: number, patch: Partial<DesignerRule>) {
  change(rules.value.map((rule, i) => i === index ? { ...rule, ...patch } : rule))
}
function condition(index: number, row: number, patch: Partial<DesignerRule['conditions'][number]>) {
  update(index, {conditions: rules.value[index].conditions.map((value,i) => i === row ? {...value,...patch} : value)})
}
function add() {
  const field = fields.value[0]?.key; if (!field) return
  change([...rules.value, {id:crypto.randomUUID(),match:'all',action:props.protected ? props.text ? 'bold' : 'borderColor' : 'show',color:'#000000',conditions:[{field,operator:'filled',source:'value',value:''}]}])
}
const value = (event: Event) => (event.target as HTMLInputElement).value
</script>
<template>
  <section class="conditions" aria-label="Conditions properties">
    <div class="title"><h3>Conditions</h3><button type="button" aria-label="Add condition rule" :disabled="!fields.length || (rules?.length || 0) >= 16" @click="add">+ Add rule</button></div>
    <p v-if="!rules?.length">Use data to control this layer's visibility or appearance.</p>
    <p v-if="protected">Required document values stay visible. Formatting rules are available.</p>
    <article v-for="(rule,index) in rules" :key="rule.id" class="rule" :aria-label="`Condition rule ${index+1}`">
      <div class="title"><label>Match<select :value="rule.match" :aria-label="`Rule ${index+1} matching`" @change="update(index,{match:value($event) as DesignerRule['match']})"><option value="all">All conditions</option><option value="any">Any condition</option></select></label><button type="button" :aria-label="`Remove rule ${index+1}`" @click="change(rules.filter((_,i)=>i!==index))">Remove</button></div>
      <div v-for="(test,row) in rule.conditions" :key="row" class="test">
        <select :value="test.field" :aria-label="`Rule ${index+1} field ${row+1}`" @change="condition(index,row,{field:value($event)})"><option v-if="!fields.some(field=>field.key===test.field)" :value="test.field">{{ test.field }}</option><option v-for="field in fields" :key="field.key" :value="field.key">{{ field.group }} / {{ field.label }}</option></select>
        <select :value="test.operator" :aria-label="`Rule ${index+1} operator ${row+1}`" @change="condition(index,row,{operator:value($event) as DesignerRule['conditions'][number]['operator']})"><option v-for="operator in operators" :key="operator.value" :value="operator.value">{{ operator.label }}</option></select>
        <div v-if="!['filled','empty'].includes(test.operator)" class="compare">
          <select :value="test.source" :aria-label="`Rule ${index+1} comparison source ${row+1}`" @change="condition(index,row,{source:value($event) as 'value'|'field',value:value($event)==='field'?fields[0]?.key||'':''})"><option value="value">Value</option><option value="field">Another field</option></select>
          <select v-if="test.source==='field'" :value="test.value" :aria-label="`Rule ${index+1} comparison field ${row+1}`" @change="condition(index,row,{value:value($event)})"><option v-if="!fields.some(field=>field.key===test.value)" :value="test.value">{{ test.value }}</option><option v-for="field in fields" :key="field.key" :value="field.key">{{ field.group }} / {{ field.label }}</option></select>
          <input v-else :value="test.value" maxlength="2000" :aria-label="`Rule ${index+1} value ${row+1}`" @change="condition(index,row,{value:value($event)})" />
        </div>
        <button v-if="rule.conditions.length>1" type="button" :aria-label="`Remove rule ${index+1} condition ${row+1}`" @click="update(index,{conditions:rule.conditions.filter((_,i)=>i!==row)})">Remove condition</button>
      </div>
      <button type="button" :disabled="rule.conditions.length>=8" :aria-label="`Add condition to rule ${index+1}`" @click="update(index,{conditions:[...rule.conditions,{field:fields[0]?.key||rule.conditions[0].field,operator:'filled',source:'value',value:''}]})">+ Condition</button>
      <label>Action<select :value="rule.action" :aria-label="`Rule ${index+1} action`" @change="update(index,{action:value($event) as DesignerRule['action'],color:rule.color||'#000000'})"><option v-for="action in actions" :key="action.value" :value="action.value">{{ action.label }}</option></select></label>
      <input v-if="['color','background','borderColor'].includes(rule.action)" type="color" :value="rule.color||'#000000'" :aria-label="`Rule ${index+1} colour`" @input="update(index,{color:value($event)})" />
      <p class="result" role="status">Current data: {{ ruleMatches(rule,resolve) ? 'matches' : 'does not match' }}. {{ rule.action==='show'?'Hidden when this rule does not match.':'Otherwise keeps its normal appearance.' }}</p>
      <p v-if="rule.action==='borderColor'">Set stroke width in Stroke to make the outline visible.</p>
    </article>
  </section>
</template>
<style scoped>
.conditions{padding:14px 16px;border-top:1px solid #e8e8e8;display:grid;gap:10px;font:11px Arial,sans-serif}.title{display:flex;align-items:center;justify-content:space-between;gap:8px}h3,p{margin:0}h3{font-size:11px}p{color:#777;font-size:10px;line-height:1.5}.rule,.test{display:grid;gap:8px}.rule{padding:10px;border:1px solid #e5e7eb;border-radius:6px}.test{border-bottom:1px solid #eee;padding-bottom:8px}.compare{display:grid;grid-template-columns:80px minmax(0,1fr);gap:5px}label{display:grid;gap:5px;color:#777;font-size:10px}select,input{box-sizing:border-box;min-width:0;width:100%;padding:6px;border:1px solid #eee;border-radius:4px;background:#f5f5f5;color:#222;font:11px Arial,sans-serif}button{padding:5px;border:0;border-radius:4px;background:#f5f5f5;color:#444;font:10px Arial,sans-serif;cursor:pointer}button:disabled{opacity:.4;cursor:default}.result{color:#555}input[type=color]{height:30px}
</style>
