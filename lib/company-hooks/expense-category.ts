// Request-local company scope; generated hooks remain untouched.
import * as hooks from '../hooks/expense-category';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/expense-category';
export const useFindManyExpenseCategory = withCompanyRead(hooks.useFindManyExpenseCategory, 'ExpenseCategory');
export const useInfiniteFindManyExpenseCategory = withCompanyRead(hooks.useInfiniteFindManyExpenseCategory, 'ExpenseCategory');
export const useFindFirstExpenseCategory = withCompanyRead(hooks.useFindFirstExpenseCategory, 'ExpenseCategory');
export const useAggregateExpenseCategory = withCompanyRead(hooks.useAggregateExpenseCategory, 'ExpenseCategory');
export const useGroupByExpenseCategory = withCompanyRead(hooks.useGroupByExpenseCategory, 'ExpenseCategory');
export const useCountExpenseCategory = withCompanyRead(hooks.useCountExpenseCategory, 'ExpenseCategory');
