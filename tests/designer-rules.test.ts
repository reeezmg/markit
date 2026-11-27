import test from 'node:test'
import assert from 'node:assert/strict'
import { applyDesignerRules, ruleMatches, priceComparisonRule, designerRuleSchema, type DesignerRule } from '../utils/designer-rules'
import { originalLabelTemplate, newElement, elementIsVisible, elementIsStruck, effectivePrintElement, templateSchema } from '../utils/print-templates'
import { defaultQuoteDesign, normalizeQuoteDesign, newQuoteDesignSection } from '../utils/quote-design'
import { quoteDocumentRuleValues, quoteItemRuleValues } from '../utils/quote-bindings'

const rule = (patch: Partial<DesignerRule> = {}): DesignerRule => ({id:'test',match:'all',action:'show',conditions:[{field:'amount',operator:'gt',source:'value',value:'0'}],...patch})
test('conditions compare numbers and fields, retain zero, reject missing/invalid numeric values and match all/any', () => {
  const compare=priceComparisonRule('show')
  for (const [price,expected] of [[0,true],[90,true],[100,false],[110,false],[-1,false],[null,false],['',false],['nonsense',false],[NaN,false]] as const) {
    assert.equal(ruleMatches(compare,key=>({sprice:100,dprice:price})[key as 'sprice'|'dprice']),expected,String(price))
  }
  assert.equal(ruleMatches(rule({match:'any',conditions:[{field:'a',operator:'empty',source:'value',value:''},{field:'b',operator:'eq',source:'value',value:'upi'}]}),key=>({a:'filled',b:'UPI'})[key as 'a'|'b']),true)
  for (const operator of ['lt','lte','gt','gte'] as const) assert.equal(ruleMatches(rule({conditions:[{field:'missing',operator,source:'value',value:'0'}]}),()=>undefined),false)
  assert.equal(ruleMatches(rule({conditions:[{field:'amount',operator:'eq',source:'value',value:'0'}]}),()=>0),true)
  assert.equal(ruleMatches(rule({conditions:[{field:'amount',operator:'filled',source:'value',value:''}]}),()=>0),true)
  assert.equal(ruleMatches(rule({conditions:[{field:'amount',operator:'contains',source:'value',value:'card'}]}),()=>'CREDIT CARD'),true)
})
test('rule actions restore the base appearance when unmatched, combine visibility gates and never unhide a hidden layer', () => {
  const layer={visible:true,color:'#111111',bold:false,rules:[rule({action:'bold'}),rule({id:'paint',action:'color',color:'#ff0000'})]}
  const before=JSON.stringify(layer),matched=applyDesignerRules(layer,()=>2)
  assert.equal(matched.bold,true);assert.equal(matched.fontWeight,700);assert.equal(matched.color,'#ff0000')
  assert.equal(applyDesignerRules(layer,()=>0).bold,false);assert.equal(applyDesignerRules(layer,()=>0).color,'#111111');assert.equal(JSON.stringify(layer),before)
  assert.equal(applyDesignerRules({visible:false,rules:[rule()]},()=>2).visible,false)
  assert.equal(applyDesignerRules({visible:true,rules:[rule(),rule({id:'hide',action:'hide'})]},()=>2).visible,false)
  assert.equal(applyDesignerRules({visible:true,rules:[rule()]},()=>0).visible,false)
})
test('format and paint actions use one evaluator for text, images, frames and shapes', () => {
  for(const action of ['strike','italic','underline'] as const) assert.equal(applyDesignerRules({rules:[rule({action})]},()=>1)[action],true)
  const fills=[{color:'#123456',opacity:1,visible:true}]
  const text=applyDesignerRules({kind:'text',fills,rules:[rule({action:'background',color:'#00ff00'})]},()=>1)
  assert.equal(text.background,'#00ff00');assert.equal(text.fills,fills)
  for(const kind of ['image','shape','frame']) {
    const box=applyDesignerRules({kind,fills,rules:[rule({action:'background',color:'#00ff00'}),rule({id:'stroke',action:'borderColor',color:'#ff0000'})]},()=>1)
    assert.equal(box.background,'#00ff00');assert.equal(box.fills,undefined);assert.equal(box.borderColor,'#ff0000')
  }
})
test('shared rule schema bounds and colour validation survive quote/print settings without executable conditions', () => {
  assert.equal(designerRuleSchema.safeParse(rule({action:'color'})).success,false)
  assert.equal(designerRuleSchema.safeParse(rule({conditions:[]})).success,false)
  assert.equal(designerRuleSchema.safeParse({...rule(),action:'eval'}).success,false)
  const label=originalLabelTemplate();assert.ok(templateSchema.safeParse(label).success)
  assert.equal(label.elements.some(e=>e.visibility||e.strikeThrough),false)
  const design=defaultQuoteDesign(),text=newQuoteDesignSection('text','condition-text');text.rules=[rule({action:'strike'})];design.sections.push(text)
  assert.deepEqual(normalizeQuoteDesign(JSON.parse(JSON.stringify(design))).sections.at(-1)!.rules,text.rules)
})
test('old saved label/receipt conditions are evaluated as shared rules without mutating the source', () => {
  const element={...newElement('field',50),field:'sprice',visibility:'discount' as const,strikeThrough:'discount' as const,whenField:'product.name'}
  const data={sprice:100,dprice:90,product:{name:'Shirt'}},before=JSON.stringify(element)
  assert.equal(elementIsVisible(element,data),true);assert.equal(elementIsStruck(element,data),true)
  const result=effectivePrintElement(element,data)
  assert.equal(result.rules!.length,3);assert.equal(result.whenField,undefined);assert.equal(result.visibility,undefined);assert.equal(result.strikeThrough,undefined)
  assert.equal(elementIsVisible(element,{...data,product:{name:''}}),false)
  assert.equal(elementIsVisible({...element,visibility:'no-discount'}, {...data,dprice:null}),true)
  assert.equal(JSON.stringify(element),before)
  const payment={...newElement('text',72),whenField:'receiptUpiPayment'}
  assert.equal(elementIsVisible(payment,{paymentMethod:'cash',grandTotal:100,upiId:'shop@upi',receiptUpiPayment:'stale cached link'}),false,'Conditions must use the same payment-aware value as linked content')
})
test('quote condition values use raw amounts and quantities and required values cannot be conditionally hidden', () => {
  const data=quoteDocumentRuleValues({total:250,adjustment:-5,items:[]},{currency:'INR'})
  assert.equal(data.total,250);assert.equal(data['total-adjustment'],-5)
  assert.equal(quoteItemRuleValues({quantity:2,unit:'pcs',rate:10},0)['row-quantity'],2)
  const design=defaultQuoteDesign();design.sections.find(s=>s.kind==='totals')!.rules=[rule()]
  assert.throws(()=>normalizeQuoteDesign(design))
})
