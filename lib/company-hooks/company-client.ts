// Request-local company scope; generated hooks remain untouched.
import * as hooks from '../hooks/company-client';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/company-client';
export const useFindManyCompanyClient = withCompanyRead(hooks.useFindManyCompanyClient, 'CompanyClient');
export const useInfiniteFindManyCompanyClient = withCompanyRead(hooks.useInfiniteFindManyCompanyClient, 'CompanyClient');
export const useFindFirstCompanyClient = withCompanyRead(hooks.useFindFirstCompanyClient, 'CompanyClient');
export const useAggregateCompanyClient = withCompanyRead(hooks.useAggregateCompanyClient, 'CompanyClient');
export const useGroupByCompanyClient = withCompanyRead(hooks.useGroupByCompanyClient, 'CompanyClient');
export const useCountCompanyClient = withCompanyRead(hooks.useCountCompanyClient, 'CompanyClient');
