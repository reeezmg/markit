import assert from 'node:assert/strict';
import { planEcommerceReturn } from '../utils/ecommerce-accounting';
const sale = { gross: 18, redeemed: 130, tax: 18, delivery: 20, cod: 10,
  items: [{ entryId: 'e', itemId: 'i', qty: 2, value: 118, unitCost: 40, returned: false }] };
const first = planEcommerceReturn(sale, [], { items: [{ entryId: 'e', qty: 1 }] });
const second = planEcommerceReturn(sale, [{ action: 'RETURN', ...first.metadata }], { items: [{ entryId: 'e', qty: 1 }], refundDelivery: true, refundCod: true });
assert.equal(Math.round((first.metadata.credited + second.metadata.credited) * 100), 1800, 'Never refund rewards as cash');
assert.equal(first.metadata.restoredPoints + second.metadata.restoredPoints, 130);
for (const plan of [first, second]) assert.equal(plan.lines.reduce((sum, l) => sum + Math.round(l.amount * 100), 0), 0);
assert.throws(() => planEcommerceReturn(sale, [], { items: [{ entryId: 'e', qty: 1 }, { entryId: 'e', qty: 1 }] }), /quantities/);
assert.throws(() => planEcommerceReturn(sale, [], { items: [{ entryId: 'e', qty: 3 }] }), /quantities/);
const free = planEcommerceReturn({ ...sale, gross: 0, redeemed: 148 }, [], { items: [{ entryId: 'e', qty: 2 }], refundDelivery: true, refundCod: true });
assert.equal(free.metadata.credited, 0); assert.equal(free.metadata.restoredPoints, 148);
console.log('Return planner passed: partial rewards allocation, exact full refund limit, points restoration, balancing and quantity guards.');
