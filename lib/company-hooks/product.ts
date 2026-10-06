// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/product';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/product';
export const useFindManyProduct = withCompanyRead(hooks.useFindManyProduct, 'Product');
export const useInfiniteFindManyProduct = withCompanyRead(hooks.useInfiniteFindManyProduct, 'Product');
export const useFindFirstProduct = withCompanyRead(hooks.useFindFirstProduct, 'Product');
export const useAggregateProduct = withCompanyRead(hooks.useAggregateProduct, 'Product');
export const useGroupByProduct = withCompanyRead(hooks.useGroupByProduct, 'Product');
export const useCountProduct = withCompanyRead(hooks.useCountProduct, 'Product');
