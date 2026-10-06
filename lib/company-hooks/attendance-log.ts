// Request-local company scope; generated hooks remain untouched.
import * as hooks from '../hooks/attendance-log';
import { withCompanyRead } from '~/composables/useCompanyScope';
export * from '../hooks/attendance-log';
export const useFindManyAttendanceLog = withCompanyRead(hooks.useFindManyAttendanceLog, 'AttendanceLog');
export const useInfiniteFindManyAttendanceLog = withCompanyRead(hooks.useInfiniteFindManyAttendanceLog, 'AttendanceLog');
export const useFindFirstAttendanceLog = withCompanyRead(hooks.useFindFirstAttendanceLog, 'AttendanceLog');
export const useAggregateAttendanceLog = withCompanyRead(hooks.useAggregateAttendanceLog, 'AttendanceLog');
export const useGroupByAttendanceLog = withCompanyRead(hooks.useGroupByAttendanceLog, 'AttendanceLog');
export const useCountAttendanceLog = withCompanyRead(hooks.useCountAttendanceLog, 'AttendanceLog');
