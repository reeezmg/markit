// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/variant';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/variant';
export const useFindManyVariant = withCompanyRead(hooks.useFindManyVariant, 'Variant');
export const useInfiniteFindManyVariant = withCompanyRead(hooks.useInfiniteFindManyVariant, 'Variant');
export const useFindFirstVariant = withCompanyRead(hooks.useFindFirstVariant, 'Variant');
export const useAggregateVariant = withCompanyRead(hooks.useAggregateVariant, 'Variant');
export const useGroupByVariant = withCompanyRead(hooks.useGroupByVariant, 'Variant');
export const useCountVariant = withCompanyRead(hooks.useCountVariant, 'Variant');
