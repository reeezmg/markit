export default defineEventHandler(async (event) => {
  const { provider, credentials } = await readBody<{
    provider: string;
    credentials: Record<string, string>;
  }>(event);

  try {
    switch (provider) {
      case 'shiprocket': {
        const res = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        });
        const data = await res.json().catch(() => ({})) as any;
        if (!data.token) {
          throw createError({ statusCode: 400, statusMessage: data.message || 'Invalid Shiprocket credentials' });
        }
        return { ok: true, message: 'Shiprocket login successful' };
      }

      case 'delhivery': {
        const res = await fetch('https://track.delhivery.com/api/p/edit/', {
          headers: { Authorization: `Token ${credentials.apiToken}`, Accept: 'application/json' },
        });
        if (res.status === 401 || res.status === 403) {
          throw createError({ statusCode: 400, statusMessage: 'Invalid Delhivery API token' });
        }
        return { ok: true, message: 'Delhivery token verified' };
      }

      case 'xpressbees': {
        const res = await fetch('https://ship.xpressbees.com/api/users/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: credentials.clientId, password: credentials.clientSecret }),
        });
        const data = await res.json().catch(() => ({})) as any;
        if (!data.status) {
          throw createError({ statusCode: 400, statusMessage: data.message || 'Invalid XpressBees credentials' });
        }
        return { ok: true, message: 'XpressBees credentials verified' };
      }

      case 'dunzo': {
        const base = credentials.environment === 'TEST'
          ? 'https://apis-staging.dunzo.in'
          : 'https://apis.dunzo.in';
        const res = await fetch(`${base}/api/v1/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: credentials.clientId, client_secret: credentials.clientSecret }),
        });
        if (!res.ok) {
          throw createError({ statusCode: 400, statusMessage: 'Invalid Dunzo credentials' });
        }
        return { ok: true, message: 'Dunzo credentials verified' };
      }

      case 'bluedart':
      case 'ecomexpress':
      case 'shadowfax':
      case 'dtdc':
      case 'pickrr':
      case 'ekart':
        return { ok: true, message: 'Credentials saved. Create a test shipment to verify.' };

      case 'speedpost':
        return { ok: true, message: 'Credentials saved. Tracking will be available for all shipments.' };

      default:
        return { ok: true, message: 'Credentials accepted.' };
    }
  } catch (e: any) {
    if (e.statusCode) throw e;
    throw createError({ statusCode: 502, statusMessage: `Could not reach ${provider} API: ${e.message}` });
  }
});
