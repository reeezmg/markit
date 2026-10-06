// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/client';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/client';
export const useFindManyClient = withCompanyRead(hooks.useFindManyClient, 'Client');
export const useInfiniteFindManyClient = withCompanyRead(hooks.useInfiniteFindManyClient, 'Client');
export const useFindFirstClient = withCompanyRead(hooks.useFindFirstClient, 'Client');
export const useAggregateClient = withCompanyRead(hooks.useAggregateClient, 'Client');
export const useGroupByClient = withCompanyRead(hooks.useGroupByClient, 'Client');
export const useCountClient = withCompanyRead(hooks.useCountClient, 'Client');
