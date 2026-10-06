// Request-local company scope; generated hooks remain untouched.
import * as hooks from '../hooks/attendance-adjustment';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/attendance-adjustment';
export const useFindManyAttendanceAdjustment = withCompanyRead(hooks.useFindManyAttendanceAdjustment, 'AttendanceAdjustment');
export const useInfiniteFindManyAttendanceAdjustment = withCompanyRead(hooks.useInfiniteFindManyAttendanceAdjustment, 'AttendanceAdjustment');
export const useFindFirstAttendanceAdjustment = withCompanyRead(hooks.useFindFirstAttendanceAdjustment, 'AttendanceAdjustment');
export const useAggregateAttendanceAdjustment = withCompanyRead(hooks.useAggregateAttendanceAdjustment, 'AttendanceAdjustment');
export const useGroupByAttendanceAdjustment = withCompanyRead(hooks.useGroupByAttendanceAdjustment, 'AttendanceAdjustment');
export const useCountAttendanceAdjustment = withCompanyRead(hooks.useCountAttendanceAdjustment, 'AttendanceAdjustment');
