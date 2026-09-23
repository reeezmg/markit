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
        // Cashfree has no list-orders endpoint in the current Payments API.
        // Fetching a deliberately unknown order exercises the supported Get
        // Order endpoint without creating a test transaction. A 404 means the
        // credentials were authenticated and only the synthetic order is absent.
        const checkOrderId = `markit_check_${Date.now()}`;
        const res = await fetch(`${base}/pg/orders/${checkOrderId}`, {
          headers: {
            'x-client-id': credentials.appId,
            'x-client-secret': credentials.secretKey,
            'x-api-version': '2026-01-01',
          },
        });
        if (!res.ok && res.status !== 404) {
          const err = await res.json().catch(() => ({})) as any;
          throw createError({ statusCode: 400, statusMessage: err?.message || 'Invalid Cashfree credentials' });
        }
        return { ok: true, message: 'Cashfree credentials verified' };
      }

      case 'phonepe': {
        const isProd = credentials.environment === 'PROD';
        const tokenUrl = isProd
          ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
          : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token';
        const clientId = credentials.clientId || '';
        const clientSecret = credentials.clientSecret || '';
        const clientVersion = credentials.clientVersion || '1';
        const body = new URLSearchParams({
          client_id: clientId,
          client_version: clientVersion,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
        });
        const res = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as any;
          throw createError({
            statusCode: 400,
            statusMessage: err?.message || err?.error_description || 'Invalid PhonePe credentials or environment',
          });
        }
        const token = await res.json() as any;
        if (!token?.access_token) {
          throw createError({ statusCode: 400, statusMessage: 'PhonePe did not return an access token' });
        }
        return { ok: true, message: 'PhonePe credentials verified' };
      }
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
