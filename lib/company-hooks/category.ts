// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/category';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/category';
export const useFindManyCategory = withCompanyRead(hooks.useFindManyCategory, 'Category');
export const useInfiniteFindManyCategory = withCompanyRead(hooks.useInfiniteFindManyCategory, 'Category');
export const useFindFirstCategory = withCompanyRead(hooks.useFindFirstCategory, 'Category');
export const useAggregateCategory = withCompanyRead(hooks.useAggregateCategory, 'Category');
export const useGroupByCategory = withCompanyRead(hooks.useGroupByCategory, 'Category');
export const useCountCategory = withCompanyRead(hooks.useCountCategory, 'Category');
