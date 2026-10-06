// Request-local company scope; generated hooks remain untouched.
import * as hooks from '../hooks/payroll-cycle';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/payroll-cycle';
export const useFindManyPayrollCycle = withCompanyRead(hooks.useFindManyPayrollCycle, 'PayrollCycle');
export const useInfiniteFindManyPayrollCycle = withCompanyRead(hooks.useInfiniteFindManyPayrollCycle, 'PayrollCycle');
export const useFindFirstPayrollCycle = withCompanyRead(hooks.useFindFirstPayrollCycle, 'PayrollCycle');
export const useAggregatePayrollCycle = withCompanyRead(hooks.useAggregatePayrollCycle, 'PayrollCycle');
export const useGroupByPayrollCycle = withCompanyRead(hooks.useGroupByPayrollCycle, 'PayrollCycle');
export const useCountPayrollCycle = withCompanyRead(hooks.useCountPayrollCycle, 'PayrollCycle');
