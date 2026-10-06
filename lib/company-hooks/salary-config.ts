// Request-local company scope; generated hooks remain untouched.
import * as hooks from '../hooks/salary-config';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/salary-config';
export const useFindManySalaryConfig = withCompanyRead(hooks.useFindManySalaryConfig, 'SalaryConfig');
export const useInfiniteFindManySalaryConfig = withCompanyRead(hooks.useInfiniteFindManySalaryConfig, 'SalaryConfig');
export const useFindFirstSalaryConfig = withCompanyRead(hooks.useFindFirstSalaryConfig, 'SalaryConfig');
export const useAggregateSalaryConfig = withCompanyRead(hooks.useAggregateSalaryConfig, 'SalaryConfig');
export const useGroupBySalaryConfig = withCompanyRead(hooks.useGroupBySalaryConfig, 'SalaryConfig');
export const useCountSalaryConfig = withCompanyRead(hooks.useCountSalaryConfig, 'SalaryConfig');
