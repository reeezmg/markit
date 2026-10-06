// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/brand';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/brand';
export const useFindManyBrand = withCompanyRead(hooks.useFindManyBrand, 'Brand');
export const useInfiniteFindManyBrand = withCompanyRead(hooks.useInfiniteFindManyBrand, 'Brand');
export const useFindFirstBrand = withCompanyRead(hooks.useFindFirstBrand, 'Brand');
export const useAggregateBrand = withCompanyRead(hooks.useAggregateBrand, 'Brand');
export const useGroupByBrand = withCompanyRead(hooks.useGroupByBrand, 'Brand');
export const useCountBrand = withCompanyRead(hooks.useCountBrand, 'Brand');
