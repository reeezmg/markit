// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/subcategory';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/subcategory';
export const useFindManySubcategory = withCompanyRead(hooks.useFindManySubcategory, 'Subcategory');
export const useInfiniteFindManySubcategory = withCompanyRead(hooks.useInfiniteFindManySubcategory, 'Subcategory');
export const useFindFirstSubcategory = withCompanyRead(hooks.useFindFirstSubcategory, 'Subcategory');
export const useAggregateSubcategory = withCompanyRead(hooks.useAggregateSubcategory, 'Subcategory');
export const useGroupBySubcategory = withCompanyRead(hooks.useGroupBySubcategory, 'Subcategory');
export const useCountSubcategory = withCompanyRead(hooks.useCountSubcategory, 'Subcategory');
