import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createModelRequestFetch } from '../utils/model-request-fetch';

test('SSR model requests authenticate on the app origin and retain native response handling', async () => {
  const requests: any[] = [];
  const server = createServer((request, response) => {
    requests.push(request.headers);
    response.statusCode = request.headers.cookie === 'session=e2e-only' ? 200 : 401;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ authenticated: response.statusCode === 200 }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    assert.equal((await fetch(origin + '/api/model/brand/findMany')).status, 401,
      'The former bare SSR fetch does not carry the browser session');
    const modelFetch = createModelRequestFetch({ endpoint: '/api/model', requestURL: origin + '/products/brands', cookie: 'session=e2e-only' });
    const response = await modelFetch('/api/model/brand/findMany', { headers: { 'x-company-id': 'branch', accept: 'application/json' } });
    assert.equal(response.status, 200);
    assert.equal(response.bodyUsed, false, 'The SDK receives an unconsumed native Response');
    assert.deepEqual(await response.json(), { authenticated: true });
    assert.equal(requests.at(-1)['x-company-id'], 'branch');
    assert.equal((await modelFetch('/api/model/brand/findMany', { credentials: 'omit' })).status, 401);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('SSR model session cookies are never forwarded to another origin or another API path', async () => {
  const requests: Array<{ input: any; init: RequestInit }> = [];
  const modelFetch = createModelRequestFetch({ endpoint: 'https://app.test/api/model', requestURL: 'https://app.test/products',
    cookie: 'session=e2e-only', fetcher: async (input, init = {}) => { requests.push({ input, init }); return new Response('{}'); } });
  await modelFetch('https://other.test/api/model/brand/findMany');
  await modelFetch('/api/model-lookalike/brand/findMany');
  await modelFetch('/api/unrelated');
  for (const request of requests) assert.equal(new Headers(request.init.headers).has('cookie'), false);
  const input = new Request('https://app.test/api/model/brand/findMany', { headers: { 'x-company-id': 'branch' } });
  await modelFetch(input, { headers: { accept: 'application/json' } });
  assert.equal(requests.at(-1)!.input, input, 'Native Request bodies/options are preserved');
  assert.equal(new Headers(requests.at(-1)!.init.headers).get('cookie'), 'session=e2e-only');
  assert.equal(new Headers(requests.at(-1)!.init.headers).get('x-company-id'), 'branch');
});
