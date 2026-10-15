import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createApp, eventHandler, readBody, splitCookiesString, toWebHandler, useSession } from 'h3';
import { useChunkedAuthSession } from '../auth/server/utils/chunked-session';
import { packSelectedAccounts, unpackSelectedAccounts } from '../server/utils/selected-accounts-codec';

async function main() {
  const config = { name: 'nuxt-session', password: 'cookie-size-test-password-over-32-characters', cookie: { secure: true, sameSite: 'none' as const, maxAge: 31536000 } };
  const fixture = {
    id: 'test-user', email: 'test@example.invalid', companyId: 'test-company', companyPhone: '12345',
    companyName: 'Test store', role: 'admin', plan: 'pro',
    address: { street: 'Test street', city: 'Test city' },
    refundPolicy: 'Refund policy. '.repeat(150), returnPolicy: 'Return policy. '.repeat(150),
    selectedAccountsPacked: packSelectedAccounts({ companyId: 'test-company', version: 2,
      defaults: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`group-${i}`,
        Object.fromEntries(Array.from({ length: 8 }, (_, j) => [`role-${j}`, randomUUID()]))])) }),
  };
  const app = createApp();
  const compile = (file: string, bindings: Record<string, unknown>) => {
    const js = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText.replace(/^import .*;\r?\n/gm, '').replace('export default', 'return');
    return new Function(...Object.keys(bindings), js)(...Object.values(bindings));
  };
  const company = { ...fixture, id: fixture.companyId, name: fixture.companyName,
    status: true, phone: fixture.companyPhone, type: 'RETAIL',
    productinput: { name: true, brand: true, category: true },
    variantinput: { name: true, qty: true, sizes: true } };
  const bindings = { eventHandler, readBody,
    useAuthSession: (event: any) => useChunkedAuthSession(event, config),
    loadSelectedAccounts: async () => unpackSelectedAccounts(fixture.selectedAccountsPacked),
    packSelectedAccounts, unpackSelectedAccounts,
    findUserByEmail: async () => ({ id: fixture.id, email: fixture.email, password: 'test-hash',
      companies: [{ status: true, deleted: false, companyId: fixture.companyId, role: 'admin', company }] }),
    hash: async () => 'test-hash', getPurchaseExpenseCategoryId: async () => 'test-category',
    getHeadOfficeAdmin: async () => null, ensureHeadOfficeBranchMemberships: async () => {},
    normalizeBillingUnits: (value: unknown) => value || [], normalizeSizeLabels: (value: unknown) => value || [],
  };
  app.use('/real-login', compile('auth/server/api/auth/login.post.ts', bindings));
  app.use('/real-session', compile('auth/server/api/auth/session.get.ts', bindings));
  app.use('/old-login', eventHandler(async event => {
    const session = await useSession(event, config);
    await session.update(await readBody(event));
    return { ok: true };
  }));
  app.use('/login', eventHandler(async event => {
    const session = await useChunkedAuthSession(event, config);
    await session.update(await readBody(event));
    return { ok: true };
  }));
  app.use('/session', eventHandler(async event => (await useChunkedAuthSession(event, config)).data));
  app.use('/logout', eventHandler(async event => { await (await useChunkedAuthSession(event, config)).clear(); return { ok: true }; }));
  const fetch = toWebHandler(app);
  const jar = new Map<string, string>();
  let rejected = 0;
  let largest = 0;
  async function request(path: string, body?: unknown) {
    const res = await fetch(new Request('https://localhost' + path, {
      method: body ? 'POST' : 'GET', headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    for (const header of splitCookiesString(res.headers.get('set-cookie') || '')) {
      const pair = header.split(';')[0];
      const index = pair.indexOf('=');
      const key = pair.slice(0, index), value = pair.slice(index + 1);
      if (/max-age=0/i.test(header)) { jar.delete(key); continue; }
      // Model the browser's rejection of oversized cookies.
      if (Buffer.byteLength(pair) > 4096) { rejected++; continue; }
      largest = Math.max(largest, Buffer.byteLength(header));
      assert.match(header, /HttpOnly/i); assert.match(header, /Secure/i); assert.match(header, /SameSite=None/i);
      jar.set(key, value);
    }
    assert.equal(res.status, 200, await res.clone().text());
    return res.json();
  }
  await request('/old-login', fixture);
  assert.ok(rejected > 0, 'Old login cookie is rejected by a browser');
  assert.equal((await request('/session')).id, undefined, 'Oversized old cookie reproduces empty session');
  jar.clear(); rejected = 0;
  await request('/login', fixture);
  assert.ok(jar.size > 1, 'Large sessions use multiple safe-sized cookies');
  assert.deepEqual(await request('/session'), fixture, 'Full session survives browser cookie limits');
  await request('/login', { companyPhone: '67890' });
  assert.equal((await request('/session')).companyPhone, '67890');
  assert.equal((await request('/session')).selectedAccountsPacked, fixture.selectedAccountsPacked);
  const validJar = new Map(jar);
  jar.delete('nuxt-session.0');
  assert.equal((await request('/session')).id, undefined, 'Incomplete chunks cannot authenticate');
  jar.clear(); for (const [key, value] of validJar) jar.set(key, value);
  jar.set('nuxt-session.0', 'tampered');
  assert.equal((await request('/session')).id, undefined, 'Tampered chunks cannot authenticate');
  jar.clear(); for (const [key, value] of validJar) jar.set(key, value);
  await request('/login', { refundPolicy: '', returnPolicy: '', selectedAccountsPacked: '' });
  assert.equal(jar.size, 1, 'Shrinking session clears obsolete chunks');
  assert.equal((await request('/session')).id, 'test-user');
  await request('/logout'); assert.equal(jar.size, 0);
  await request('/old-login', { id: 'legacy-user', email: 'legacy@example.invalid' });
  assert.equal((await request('/session')).id, 'legacy-user', 'Existing single-cookie sessions remain valid');
  await request('/login', fixture); await request('/logout');
  assert.equal(jar.size, 0, 'Logout clears every session chunk');
  await request('/real-login', { email: fixture.email, password: 'test-password' });
  const actualSession = await request('/real-session');
  assert.equal(actualSession.id, fixture.id, 'Actual login and session handlers retain identity');
  assert.equal(actualSession.companyPhone, fixture.companyPhone);
  assert.equal(actualSession.refundPolicy, fixture.refundPolicy);
  assert.deepEqual(actualSession.selectedAccounts, unpackSelectedAccounts(fixture.selectedAccountsPacked));
  assert.equal(actualSession.selectedAccountsPacked, undefined);
  assert.equal(rejected, 0);
  console.log(`Session cookie regression passed: reproduced old empty response, large-session roundtrip, settings updates, legacy compatibility, tamper protection and logout; largest Set-Cookie ${largest} bytes.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
