// Request-local company scope; generated hooks remain untouched.
import * as hooks from '../hooks/salary-payment';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/salary-payment';
export const useFindManySalaryPayment = withCompanyRead(hooks.useFindManySalaryPayment, 'SalaryPayment');
export const useInfiniteFindManySalaryPayment = withCompanyRead(hooks.useInfiniteFindManySalaryPayment, 'SalaryPayment');
export const useFindFirstSalaryPayment = withCompanyRead(hooks.useFindFirstSalaryPayment, 'SalaryPayment');
export const useAggregateSalaryPayment = withCompanyRead(hooks.useAggregateSalaryPayment, 'SalaryPayment');
export const useGroupBySalaryPayment = withCompanyRead(hooks.useGroupBySalaryPayment, 'SalaryPayment');
export const useCountSalaryPayment = withCompanyRead(hooks.useCountSalaryPayment, 'SalaryPayment');
