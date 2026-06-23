export default defineEventHandler(async (event) => {
  const { gateway, credentials } = await readBody<{
    gateway: string;
    credentials: Record<string, string>;
  }>(event);

  try {
    switch (gateway) {
      case 'razorpay': {
        const auth = Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString('base64');
        const res = await fetch('https://api.razorpay.com/v1/payments?count=1', {
          headers: { Authorization: `Basic ${auth}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as any;
          throw createError({ statusCode: 400, statusMessage: err?.error?.description || 'Invalid Razorpay credentials' });
        }
        return { ok: true, message: 'Razorpay credentials verified' };
      }

      case 'cashfree': {
        const base = credentials.environment === 'TEST'
          ? 'https://sandbox.cashfree.com'
          : 'https://api.cashfree.com';
        const res = await fetch(`${base}/pg/orders?limit=1`, {
          headers: {
            'x-client-id': credentials.appId,
            'x-client-secret': credentials.secretKey,
            'x-api-version': '2023-08-01',
          },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as any;
          throw createError({ statusCode: 400, statusMessage: err?.message || 'Invalid Cashfree credentials' });
        }
        return { ok: true, message: 'Cashfree credentials verified' };
      }

      case 'phonepe':
        return { ok: true, message: 'Saved. Test by initiating a ₹1 UPI payment in your app.' };
      case 'payu':
        return { ok: true, message: 'Saved. Test by initiating a ₹1 test payment.' };
      case 'paytm':
        return { ok: true, message: 'Saved. Test using the Paytm staging environment.' };

      default:
        return { ok: true, message: 'Credentials accepted.' };
    }
  } catch (e: any) {
    if (e.statusCode) throw e;
    throw createError({ statusCode: 502, statusMessage: `Could not reach ${gateway} API: ${e.message}` });
  }
});
