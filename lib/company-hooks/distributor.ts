// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/distributor';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/distributor';
export const useFindManyDistributor = withCompanyRead(hooks.useFindManyDistributor, 'Distributor');
export const useInfiniteFindManyDistributor = withCompanyRead(hooks.useInfiniteFindManyDistributor, 'Distributor');
export const useFindFirstDistributor = withCompanyRead(hooks.useFindFirstDistributor, 'Distributor');
export const useAggregateDistributor = withCompanyRead(hooks.useAggregateDistributor, 'Distributor');
export const useGroupByDistributor = withCompanyRead(hooks.useGroupByDistributor, 'Distributor');
export const useCountDistributor = withCompanyRead(hooks.useCountDistributor, 'Distributor');
