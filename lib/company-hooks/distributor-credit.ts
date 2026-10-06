// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/distributor-credit';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/distributor-credit';
export const useFindManyDistributorCredit = withCompanyRead(hooks.useFindManyDistributorCredit, 'DistributorCredit');
export const useInfiniteFindManyDistributorCredit = withCompanyRead(hooks.useInfiniteFindManyDistributorCredit, 'DistributorCredit');
export const useFindFirstDistributorCredit = withCompanyRead(hooks.useFindFirstDistributorCredit, 'DistributorCredit');
export const useAggregateDistributorCredit = withCompanyRead(hooks.useAggregateDistributorCredit, 'DistributorCredit');
export const useGroupByDistributorCredit = withCompanyRead(hooks.useGroupByDistributorCredit, 'DistributorCredit');
export const useCountDistributorCredit = withCompanyRead(hooks.useCountDistributorCredit, 'DistributorCredit');
