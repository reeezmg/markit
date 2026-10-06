// Request-local company scope; generated hooks remain untouched.
import * as hooks from '../hooks/shift-assignment';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/shift-assignment';
export const useFindManyShiftAssignment = withCompanyRead(hooks.useFindManyShiftAssignment, 'ShiftAssignment');
export const useInfiniteFindManyShiftAssignment = withCompanyRead(hooks.useInfiniteFindManyShiftAssignment, 'ShiftAssignment');
export const useFindFirstShiftAssignment = withCompanyRead(hooks.useFindFirstShiftAssignment, 'ShiftAssignment');
export const useAggregateShiftAssignment = withCompanyRead(hooks.useAggregateShiftAssignment, 'ShiftAssignment');
export const useGroupByShiftAssignment = withCompanyRead(hooks.useGroupByShiftAssignment, 'ShiftAssignment');
export const useCountShiftAssignment = withCompanyRead(hooks.useCountShiftAssignment, 'ShiftAssignment');
