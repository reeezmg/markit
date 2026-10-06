// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/collection';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/collection';
export const useFindManyCollection = withCompanyRead(hooks.useFindManyCollection, 'Collection');
export const useInfiniteFindManyCollection = withCompanyRead(hooks.useInfiniteFindManyCollection, 'Collection');
export const useFindFirstCollection = withCompanyRead(hooks.useFindFirstCollection, 'Collection');
export const useAggregateCollection = withCompanyRead(hooks.useAggregateCollection, 'Collection');
export const useGroupByCollection = withCompanyRead(hooks.useGroupByCollection, 'Collection');
export const useCountCollection = withCompanyRead(hooks.useCountCollection, 'Collection');
