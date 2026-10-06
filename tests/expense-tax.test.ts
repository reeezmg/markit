import assert from 'node:assert/strict';
import {expenseTaxAmounts} from '../utils/expense-tax';
assert.deepEqual(expenseTaxAmounts(1180,180,180),{taxAmount:180,recoverableTaxAmount:180});
assert.deepEqual(expenseTaxAmounts(1180,180,0),{taxAmount:180,recoverableTaxAmount:0});
assert.deepEqual(expenseTaxAmounts(1180,180,90),{taxAmount:180,recoverableTaxAmount:90});
assert.deepEqual(expenseTaxAmounts(500,0,null),{taxAmount:0,recoverableTaxAmount:0});
for(const args of [[1180,180,null],[1180,180,200],[100,180,0],[100,NaN,0],[100,1.111,0]])assert.throws(()=>expenseTaxAmounts(...args as [any,any,any]));
console.log('Expense tax validation passed.');
