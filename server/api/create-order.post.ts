// Example: /api/create-order.ts
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  // key_id: process.env.RAZORPAY_KEY_ID,
  key_id: 'rzp_test_6SpABoo17DzC1t',
  // key_secret: process.env.RAZORPAY_SECRET
  key_secret: 'yzQ4M5czsCBSeAfJjzgiTVMt'
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const payment_capture = 1;
  const amount = body.amount;
  const currency = 'INR';

  const options = {
    amount: amount,
    currency,
    receipt: `receipt_${Date.now()}`,
    payment_capture
  };

  const response = await razorpay.orders.create(options);
  return response;
});
