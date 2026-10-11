import { defineEventHandler } from 'h3';
import { saveDistributorPayment } from '../../utils/distributor-payment-save';

export default defineEventHandler(event => saveDistributorPayment(event));
