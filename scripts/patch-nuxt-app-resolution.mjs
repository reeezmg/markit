import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Backport https://github.com/nuxt/nuxt/pull/32993 to the installed Nuxt.
// Publish resolved collections together, rather than exposing intermediate
// arrays to concurrent app regeneration. No middleware warnings are suppressed.
const require = createRequire(import.meta.url);
const packagePath = require.resolve('nuxt/package.json');
const { version } = JSON.parse(await readFile(packagePath, 'utf8'));
if (version === '3.17.4') {
  const shared = join(dirname(packagePath), 'dist/shared');
  let found = false;
  for (const filename of await readdir(shared)) {
    if (!filename.startsWith('nuxt.') || !filename.endsWith('.mjs')) continue;
    const path = join(shared, filename);
    const source = await readFile(path, 'utf8');
    const start = source.indexOf('async function resolveApp(nuxt, app) {');
    if (start < 0) continue;
    found = true;
    const hook = source.indexOf('  await nuxt.callHook("app:resolve", app);', start);
    if (hook < 0) throw new Error('Nuxt app-resolution hook not found; review the backport.');
    const original = source.slice(start, hook);
    if (original.includes('Object.assign(app, { middleware, plugins, configs, layouts });')) continue;
    for (const name of ['layouts', 'middleware', 'plugins', 'configs']) {
      const initial = name === 'layouts' ? '{}' : '[]';
      if (!original.includes(`app.${name} = ${initial};`)) {
        throw new Error(`Unexpected Nuxt ${name} initialization; review the backport.`);
      }
    }
    let patched = original;
    for (const name of ['layouts', 'middleware', 'plugins', 'configs']) {
      patched = patched.replaceAll(`app.${name}`, name);
      const initial = name === 'layouts' ? '{}' : '[]';
      const declaration = ['middleware', 'plugins'].includes(name) ? 'let' : 'const';
      patched = patched.replace(`${name} = ${initial};`, `${declaration} ${name} = ${initial};`);
    }
    patched += '  Object.assign(app, { middleware, plugins, configs, layouts });\n';
    await writeFile(path, source.slice(0, start) + patched + source.slice(hook));
  }
  if (!found) throw new Error('Nuxt app-resolution implementation not found; review the backport.');
}
