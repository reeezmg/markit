// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/purchase-return';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/purchase-return';
export const useFindManyPurchaseReturn = withCompanyRead(hooks.useFindManyPurchaseReturn, 'PurchaseReturn');
export const useInfiniteFindManyPurchaseReturn = withCompanyRead(hooks.useInfiniteFindManyPurchaseReturn, 'PurchaseReturn');
export const useFindFirstPurchaseReturn = withCompanyRead(hooks.useFindFirstPurchaseReturn, 'PurchaseReturn');
export const useAggregatePurchaseReturn = withCompanyRead(hooks.useAggregatePurchaseReturn, 'PurchaseReturn');
export const useGroupByPurchaseReturn = withCompanyRead(hooks.useGroupByPurchaseReturn, 'PurchaseReturn');
export const useCountPurchaseReturn = withCompanyRead(hooks.useCountPurchaseReturn, 'PurchaseReturn');
