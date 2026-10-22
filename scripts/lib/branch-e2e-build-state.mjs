import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const roots = ['assets', 'auth', 'components', 'composables', 'constants', 'data', 'layouts', 'lib', 'middleware',
  'pages', 'plugins', 'public', 'server', 'services', 'stores', 'types', 'utils'];
const explicit = ['app.vue', 'nuxt.config.ts', 'tailwind.config.ts', 'tsconfig.json', 'schema.zmodel', 'package.json',
  'package-lock.json', 'docs/database/dbMeta.json', 'tests/helpers/readonly-nitro-plugin.ts',
  'tests/helpers/readonly-request-middleware.ts', 'scripts/build-branch-e2e.mjs', 'scripts/lib/branch-e2e-build-state.mjs'];

export function captureBuildSources() {
  const files = new Set(explicit.filter(path => existsSync(join(projectRoot, path))));
  const visit = directory => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:vue|[cm]?js|tsx?|jsx|json|css|scss|sass)$/.test(entry.name)) files.add(relative(projectRoot, path).replaceAll('\\', '/'));
    }
  };
  for (const root of roots) visit(join(projectRoot, root));
  const hashes = {}, combined = createHash('sha256');
  for (const path of [...files].sort()) {
    hashes[path] = createHash('sha256').update(readFileSync(join(projectRoot, path))).digest('hex');
    combined.update(path + '\0' + hashes[path] + '\0');
  }
  return { fingerprint: combined.digest('hex'), files: hashes };
}

export function assertAuditBundleCurrent() {
  const path = join(projectRoot, 'tests/branch-reports/bundled-manifest.json');
  if (!existsSync(path)) throw Error('The bundled audit requires a completed, source-verified build');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.status !== 'ready' || captureBuildSources().fingerprint !== manifest.sources.fingerprint)
    throw Error('The audit bundle is incomplete or its application sources changed; rebuild before testing');
  return manifest;
}
