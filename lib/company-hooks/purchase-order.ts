// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/purchase-order';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/purchase-order';
export const useFindManyPurchaseOrder = withCompanyRead(hooks.useFindManyPurchaseOrder, 'PurchaseOrder');
export const useInfiniteFindManyPurchaseOrder = withCompanyRead(hooks.useInfiniteFindManyPurchaseOrder, 'PurchaseOrder');
export const useFindFirstPurchaseOrder = withCompanyRead(hooks.useFindFirstPurchaseOrder, 'PurchaseOrder');
export const useAggregatePurchaseOrder = withCompanyRead(hooks.useAggregatePurchaseOrder, 'PurchaseOrder');
export const useGroupByPurchaseOrder = withCompanyRead(hooks.useGroupByPurchaseOrder, 'PurchaseOrder');
export const useCountPurchaseOrder = withCompanyRead(hooks.useCountPurchaseOrder, 'PurchaseOrder');
