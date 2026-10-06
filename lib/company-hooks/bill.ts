// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/bill';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/bill';
export const useFindManyBill = withCompanyRead(hooks.useFindManyBill, 'Bill');
export const useInfiniteFindManyBill = withCompanyRead(hooks.useInfiniteFindManyBill, 'Bill');
export const useFindFirstBill = withCompanyRead(hooks.useFindFirstBill, 'Bill');
export const useAggregateBill = withCompanyRead(hooks.useAggregateBill, 'Bill');
export const useGroupByBill = withCompanyRead(hooks.useGroupByBill, 'Bill');
export const useCountBill = withCompanyRead(hooks.useCountBill, 'Bill');
