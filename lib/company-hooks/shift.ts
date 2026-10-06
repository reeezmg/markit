// Request-local company scope; generated hooks remain untouched.
import * as hooks from '../hooks/shift';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/shift';
export const useFindManyShift = withCompanyRead(hooks.useFindManyShift, 'Shift');
export const useInfiniteFindManyShift = withCompanyRead(hooks.useInfiniteFindManyShift, 'Shift');
export const useFindFirstShift = withCompanyRead(hooks.useFindFirstShift, 'Shift');
export const useAggregateShift = withCompanyRead(hooks.useAggregateShift, 'Shift');
export const useGroupByShift = withCompanyRead(hooks.useGroupByShift, 'Shift');
export const useCountShift = withCompanyRead(hooks.useCountShift, 'Shift');
