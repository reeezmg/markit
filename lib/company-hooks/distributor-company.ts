// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/distributor-company';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/distributor-company';
export const useFindManyDistributorCompany = withCompanyRead(hooks.useFindManyDistributorCompany, 'DistributorCompany');
export const useInfiniteFindManyDistributorCompany = withCompanyRead(hooks.useInfiniteFindManyDistributorCompany, 'DistributorCompany');
export const useFindFirstDistributorCompany = withCompanyRead(hooks.useFindFirstDistributorCompany, 'DistributorCompany');
export const useAggregateDistributorCompany = withCompanyRead(hooks.useAggregateDistributorCompany, 'DistributorCompany');
export const useGroupByDistributorCompany = withCompanyRead(hooks.useGroupByDistributorCompany, 'DistributorCompany');
export const useCountDistributorCompany = withCompanyRead(hooks.useCountDistributorCompany, 'DistributorCompany');
