import { defineEventHandler } from 'h3';
import { writeDistributorCredit } from '../../utils/distributor-credit-write';
export default defineEventHandler(writeDistributorCredit);
