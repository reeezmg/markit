import { defineEventHandler, createError } from 'h3';
import { saveDistributorPayment } from '../../../utils/distributor-payment-save';

export default defineEventHandler(event => {
  const id = event.context.params?.id;
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Payment id is required' });
  return saveDistributorPayment(event, id);
});
