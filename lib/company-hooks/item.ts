// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/item';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/item';
export const useFindManyItem = withCompanyRead(hooks.useFindManyItem, 'Item');
export const useInfiniteFindManyItem = withCompanyRead(hooks.useInfiniteFindManyItem, 'Item');
export const useFindFirstItem = withCompanyRead(hooks.useFindFirstItem, 'Item');
export const useAggregateItem = withCompanyRead(hooks.useAggregateItem, 'Item');
export const useGroupByItem = withCompanyRead(hooks.useGroupByItem, 'Item');
export const useCountItem = withCompanyRead(hooks.useCountItem, 'Item');
