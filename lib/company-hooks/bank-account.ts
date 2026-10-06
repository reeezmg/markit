// Scoped adapters; generated hooks remain untouched.
import * as hooks from '../hooks/bank-account';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/bank-account';
export const useFindManyBankAccount = withCompanyRead(hooks.useFindManyBankAccount, 'BankAccount');
export const useInfiniteFindManyBankAccount = withCompanyRead(hooks.useInfiniteFindManyBankAccount, 'BankAccount');
export const useFindFirstBankAccount = withCompanyRead(hooks.useFindFirstBankAccount, 'BankAccount');
export const useAggregateBankAccount = withCompanyRead(hooks.useAggregateBankAccount, 'BankAccount');
export const useGroupByBankAccount = withCompanyRead(hooks.useGroupByBankAccount, 'BankAccount');
export const useCountBankAccount = withCompanyRead(hooks.useCountBankAccount, 'BankAccount');
