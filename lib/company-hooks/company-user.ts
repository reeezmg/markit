// Request-local company scope; generated hooks remain untouched.
import * as hooks from '../hooks/company-user';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/company-user';
export const useFindManyCompanyUser = withCompanyRead(hooks.useFindManyCompanyUser, 'CompanyUser');
export const useInfiniteFindManyCompanyUser = withCompanyRead(hooks.useInfiniteFindManyCompanyUser, 'CompanyUser');
export const useFindFirstCompanyUser = withCompanyRead(hooks.useFindFirstCompanyUser, 'CompanyUser');
export const useAggregateCompanyUser = withCompanyRead(hooks.useAggregateCompanyUser, 'CompanyUser');
export const useGroupByCompanyUser = withCompanyRead(hooks.useGroupByCompanyUser, 'CompanyUser');
export const useCountCompanyUser = withCompanyRead(hooks.useCountCompanyUser, 'CompanyUser');
