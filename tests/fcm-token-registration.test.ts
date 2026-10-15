import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createApp, eventHandler, readBody, createError, useSession, toWebHandler } from 'h3';

async function main() {
  const config = { name: 'fcm-test-auth', password: 'fcm-test-password-at-least-32-characters', cookie: { secure: false } };
  const rows = new Map<string, any>();
  let writes = 0;
  const prisma = { pushToken: { upsert: async ({ where, create, update }: any) => {
    writes++;
    const key = JSON.stringify(where.userId_deviceId);
    rows.set(key, rows.has(key) ? { ...rows.get(key), ...update } : create);
  } } };
  const js = ts.transpileModule(readFileSync('server/api/savefcmtoken.post.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/^import .*\r?\n/gm, '').replace('export default', 'return');
  const requireAuthSession = async (event: any) => {
    const session = await useSession(event, config);
    if (!session.data.email) throw createError({ statusCode: 401 });
    return session;
  };
  const handler = new Function('prisma', 'defineEventHandler', 'readBody', 'createError', 'requireAuthSession', js)(
    prisma, eventHandler, readBody, createError, requireAuthSession,
  );
  const app = createApp();
  app.use('/login', eventHandler(async event => {
    const session = await useSession(event, config);
    const body = await readBody(event);
    await session.update(body);
    return { ok: true };
  }));
  app.use('/api/savefcmtoken', handler);
  const request = toWebHandler(app);
  const login = await request(new Request('http://localhost/login', {
    method: 'POST', body: JSON.stringify({ id: 'session-user', email: 'test@example.invalid' }),
    headers: { 'content-type': 'application/json' },
  }));
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const post = (body: unknown, auth = true) => request(new Request('http://localhost/api/savefcmtoken', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));
  const body = { fcmToken: 'test-fcm-token', deviceId: 'test-device', deviceInfo: { userAgent: 'test-browser' } };
  assert.equal((await post(body)).status, 200, 'No browser userId is required');
  assert.equal([...rows.values()][0].userId, 'session-user');
  assert.equal((await post({ ...body, fcmToken: 'replacement', userId: 'spoofed-user' })).status, 200);
  assert.equal(rows.size, 1, 'Existing device is updated');
  assert.equal([...rows.values()][0].token, 'replacement');
  assert.equal([...rows.values()][0].userId, 'session-user', 'Body cannot choose the user');
  const before = writes;
  for (const invalid of [null, {}, { ...body, deviceId: ' ' }, { ...body, fcmToken: 12 }]) {
    assert.equal((await post(invalid)).status, 400);
  }
  assert.equal((await post(body, false)).status, 401);
  assert.equal(writes, before, 'Invalid and unauthenticated requests cannot write');
  console.log('FCM token registration tests passed (encrypted session; mocked database).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
