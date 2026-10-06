import assert from 'node:assert/strict';
import {summarizeOutwardBills as summarize} from '../server/utils/report-gst-source';
const r=summarize([{grand_total:106.2,entries:[{value:118,tax:18,qty:1,hsn:'1',category:'A'}]},{grand_total:100,entries:[{value:100,tax:0,qty:1}]},{grand_total:-59,entries:[{value:59,tax:18,qty:1,return:true}]}]);
assert.equal(r.kpi.totalInvoiceValue,147.2);assert.equal(r.kpi.totalTax,7.2);assert.equal(r.kpi.totalTaxableValue,140);assert.equal(r.rateSummary.find(r=>r.taxRate===0)?.taxableValue,100);
assert.equal(summarize([{grand_total:200,entries:[{value:100,qty:1},{value:100,qty:1}]}]).kpi.totalInvoiceValue,200);
assert.equal(summarize([{grand_total:10,entries:[]}]).kpi.unallocatedInvoiceValue,10);
console.log('GST source: tax-inclusive invoice discount, returns, zero rate, no duplicate invoice totals and missing tax detail passed');
