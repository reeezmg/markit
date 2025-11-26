import { defineEventHandler, getQuery } from 'h3';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);

  // Build the origin Electric Cloud API URL
  const originUrl = new URL('/v1/shape', 'https://api.electric-sql.cloud');

  // Copy query parameters
  for (const key in query) {
    if (query[key])
      originUrl.searchParams.set(key, query[key] as string);
  }

  // Append required source_id and secret
  originUrl.searchParams.set('source_id', '78581d4f-f03e-4be0-9e15-f1cd435f89b9');
  originUrl.searchParams.set('secret', 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzb3VyY2VfaWQiOiI3ODU4MWQ0Zi1mMDNlLTRiZTAtOWUxNS1mMWNkNDM1Zjg5YjkiLCJpYXQiOjE3NTAzMjIwMzB9.0akvDUiyBeUPywyS9xv8hxWShGcavtfZF4aymGzwriw');

  // Proxy the request to Electric Cloud
  const electricRes = await fetch(originUrl.toString());

  // Clean up headers
  const headers = new Headers(electricRes.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');

  // Return the proxied response
  return new Response(electricRes.body, {
    status: electricRes.status,
    statusText: electricRes.statusText,
    headers,
  });
});
