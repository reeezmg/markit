// Request-local company scope; generated hooks remain untouched.
import * as hooks from '../hooks/payroll-adjustment';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/payroll-adjustment';
export const useFindManyPayrollAdjustment = withCompanyRead(hooks.useFindManyPayrollAdjustment, 'PayrollAdjustment');
export const useInfiniteFindManyPayrollAdjustment = withCompanyRead(hooks.useInfiniteFindManyPayrollAdjustment, 'PayrollAdjustment');
export const useFindFirstPayrollAdjustment = withCompanyRead(hooks.useFindFirstPayrollAdjustment, 'PayrollAdjustment');
export const useAggregatePayrollAdjustment = withCompanyRead(hooks.useAggregatePayrollAdjustment, 'PayrollAdjustment');
export const useGroupByPayrollAdjustment = withCompanyRead(hooks.useGroupByPayrollAdjustment, 'PayrollAdjustment');
export const useCountPayrollAdjustment = withCompanyRead(hooks.useCountPayrollAdjustment, 'PayrollAdjustment');
