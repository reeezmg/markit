// Request-local company scope; generated hooks remain untouched.
import * as hooks from '../hooks/attendance';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/attendance';
export const useFindManyAttendance = withCompanyRead(hooks.useFindManyAttendance, 'Attendance');
export const useInfiniteFindManyAttendance = withCompanyRead(hooks.useInfiniteFindManyAttendance, 'Attendance');
export const useFindFirstAttendance = withCompanyRead(hooks.useFindFirstAttendance, 'Attendance');
export const useAggregateAttendance = withCompanyRead(hooks.useAggregateAttendance, 'Attendance');
export const useGroupByAttendance = withCompanyRead(hooks.useGroupByAttendance, 'Attendance');
export const useCountAttendance = withCompanyRead(hooks.useCountAttendance, 'Attendance');
