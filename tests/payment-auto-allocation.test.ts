import assert from 'node:assert/strict';
import { allocatePurchaseOrderPayment, purchaseOrderDue } from '../utils/purchase-order-payments';

const first={id:'first',due:600},second={id:'second',due:700};
assert.deepEqual(allocatePurchaseOrderPayment(1000,[first]),{first:600});
assert.deepEqual(allocatePurchaseOrderPayment(1000,[first,second]),{first:600,second:400});
assert.deepEqual(allocatePurchaseOrderPayment(1000,[second,first]),{second:700,first:300});
assert.deepEqual(allocatePurchaseOrderPayment(400,[first,second]),{first:400,second:0});
assert.deepEqual(allocatePurchaseOrderPayment(1000,[second]),{second:700});
assert.deepEqual(allocatePurchaseOrderPayment(0,[first]),{first:0});
assert.deepEqual(allocatePurchaseOrderPayment(-10,[first]),{first:0});
assert.deepEqual(allocatePurchaseOrderPayment(0.3,[{id:'a',due:0.1},{id:'b',due:0.2}]),{a:0.1,b:0.2});
const po={totalAmount:1000,paymentAllocations:[{amount:300,payment:{id:'editing'}},{amount:200,payment:{id:'other'}}]};
assert.equal(purchaseOrderDue(po,'editing'),800,'An edited payment can allocate its own previously paid amount');
assert.deepEqual(allocatePurchaseOrderPayment(600,[{id:'po',due:purchaseOrderDue(po,'editing')}]),{po:600});
assert.equal(purchaseOrderDue({...po,paymentAllocations:[{amount:600,payment:{id:'editing'}},{amount:200,payment:{id:'other'}}]}),200,'Saved allocation reduces PO due by its allocated amount');
console.log('Automatic PO allocation passed: selection order, remaining amount, amount changes, removal, cents and edited-payment dues.');
