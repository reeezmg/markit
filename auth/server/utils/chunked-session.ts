import { deleteCookie, getCookie, sealSession, setCookie, unsealSession, useSession } from 'h3';
import type { H3Event, SessionConfig } from 'h3';

// Browsers discard an individual cookie larger than about 4 KB. Keep H3's
// encrypted session intact, but split its transport when company settings grow.
const CHUNK_SIZE = 3000;
const MAX_CHUNKS = 8;

export async function useChunkedAuthSession<T extends Record<string, any>>(event: H3Event, config: SessionConfig) {
  const name = config.name || 'h3';
  const primary = getCookie(event, name);
  const match = /^chunks:(\d+)$/.exec(primary || '');
  if (match && !event.context.sessions?.[name]) {
    const count = Number(match[1]);
    if (count > 0 && count <= MAX_CHUNKS) {
      const chunks = Array.from({ length: count }, (_, i) => getCookie(event, `${name}.${i}`));
      if (chunks.every(Boolean)) {
        try {
          const unsealed = await unsealSession(event, config, chunks.join(''));
          if (typeof unsealed.id === 'string' && typeof unsealed.createdAt === 'number' &&
              unsealed.data && typeof unsealed.data === 'object') {
            event.context.sessions ||= Object.create(null);
            event.context.sessions[name] = { id: unsealed.id, createdAt: unsealed.createdAt, data: unsealed.data };
          }
        } catch {
          // Invalid or incomplete sessions follow H3's normal unauthenticated path.
        }
      }
    }
  }
  // H3 continues to read old single cookies. Only writing is handled here.
  const session = await useSession<T>(event, { ...config, cookie: false });
  const options = { httpOnly: true, secure: true, path: '/', sameSite: 'lax' as const,
    ...(config.maxAge ? { expires: new Date(Date.now() + config.maxAge * 1000) } : {}),
    ...(config.cookie || {}) };
  const removeChunks = (from = 0) => {
    for (let i = from; i < MAX_CHUNKS; i++) {
      if (getCookie(event, `${name}.${i}`) || i < writtenChunks) deleteCookie(event, `${name}.${i}`, options);
    }
  };
  let writtenChunks = 0;
  const manager = {
    get id() { return session.id; },
    get data() { return session.data; },
    async update(update: Parameters<typeof session.update>[0]) {
      await session.update(update);
      const sealed = await sealSession(event, config);
      const count = Math.ceil(sealed.length / CHUNK_SIZE);
      if (count > MAX_CHUNKS) throw new Error('Auth session exceeds supported cookie size');
      if (count === 1) {
        setCookie(event, name, sealed, options);
        removeChunks();
        writtenChunks = 0;
      } else {
        setCookie(event, name, `chunks:${count}`, options);
        for (let i = 0; i < count; i++) setCookie(event, `${name}.${i}`, sealed.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), options);
        removeChunks(count);
        writtenChunks = count;
      }
      return manager;
    },
    async clear() {
      await session.clear();
      deleteCookie(event, name, options);
      removeChunks();
      writtenChunks = 0;
      return manager;
    },
  };
  return manager;
}
