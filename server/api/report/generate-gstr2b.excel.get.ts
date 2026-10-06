import {defineEventHandler} from 'h3';
import report from './gstr2b.get';
import {gstExcel} from '~/server/utils/report-gst-excel';
export default defineEventHandler(async event=>gstExcel(event,await report(event),'gstr2b'));
