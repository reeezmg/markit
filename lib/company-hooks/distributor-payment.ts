// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/distributor-payment';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/distributor-payment';
export const useFindManyDistributorPayment = withCompanyRead(hooks.useFindManyDistributorPayment, 'DistributorPayment');
export const useInfiniteFindManyDistributorPayment = withCompanyRead(hooks.useInfiniteFindManyDistributorPayment, 'DistributorPayment');
export const useFindFirstDistributorPayment = withCompanyRead(hooks.useFindFirstDistributorPayment, 'DistributorPayment');
export const useAggregateDistributorPayment = withCompanyRead(hooks.useAggregateDistributorPayment, 'DistributorPayment');
export const useGroupByDistributorPayment = withCompanyRead(hooks.useGroupByDistributorPayment, 'DistributorPayment');
export const useCountDistributorPayment = withCompanyRead(hooks.useCountDistributorPayment, 'DistributorPayment');
