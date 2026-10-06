// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/account';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/account';
export const useFindManyAccount = withCompanyRead(hooks.useFindManyAccount, 'Account');
export const useInfiniteFindManyAccount = withCompanyRead(hooks.useInfiniteFindManyAccount, 'Account');
export const useFindFirstAccount = withCompanyRead(hooks.useFindFirstAccount, 'Account');
export const useAggregateAccount = withCompanyRead(hooks.useAggregateAccount, 'Account');
export const useGroupByAccount = withCompanyRead(hooks.useGroupByAccount, 'Account');
export const useCountAccount = withCompanyRead(hooks.useCountAccount, 'Account');
