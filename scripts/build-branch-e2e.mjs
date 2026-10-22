import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { captureBuildSources } from './lib/branch-e2e-build-state.mjs';

assert.ok(process.env.DATABASE_URL, 'The existing test environment must define DATABASE_URL');
const database = new URL(process.env.DATABASE_URL);
database.searchParams.set('options', '-c default_transaction_read_only=on');
const memory = Number(process.env.BRANCH_E2E_MEMORY_MB || 8192);
assert.ok(Number.isSafeInteger(memory) && memory > 0, 'BRANCH_E2E_MEMORY_MB must be positive');
const origin = `http://127.0.0.1:${Number(process.env.BRANCH_E2E_PORT || 3107)}`;
mkdirSync('tests/branch-reports', { recursive: true });
writeFileSync('tests/branch-reports/e2e.env', '# The audit build inherits its read-only database environment in memory.\n');
const manifest = { status: 'building', startedAt: new Date().toISOString(), heapMB: memory, sources: captureBuildSources() };
const saveManifest = () => writeFileSync('tests/branch-reports/bundled-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
saveManifest();
console.log(`Building frozen audit source: ${Object.keys(manifest.sources.files).length} files; heap ${memory} MB.`);
const child = spawn(process.execPath, ['--expose-gc', 'node_modules/@nuxt/cli/bin/nuxi.mjs', 'build', '--dotenv', 'tests/branch-reports/e2e.env'], {
  windowsHide: true, stdio: 'inherit', env: {
    ...process.env, DATABASE_URL: database.toString(), PGOPTIONS: '-c default_transaction_read_only=on',
    BRANCH_E2E_FORM_TESTS: '', BRANCH_E2E_RECORD_PREFIX: '', NODE_OPTIONS: `--max-old-space-size=${memory}`,
    NODE_ENV: 'production', NUXT_TELEMETRY_DISABLED: '1', MARKIT_E2E_BUILD_DIR: resolve('.nuxt-branch-e2e'),
    BASE_URL: origin + '/api/model', NUXT_PUBLIC_BASE_URL: origin + '/api/model',
  },
});
child.on('error', error => { manifest.status = 'failed'; saveManifest(); console.error(error.message); process.exitCode = 1; });
child.on('exit', code => {
  manifest.finishedAt = new Date().toISOString();
  if (code !== 0) { manifest.status = 'failed'; saveManifest(); process.exitCode = code ?? 1; return; }
  const current = captureBuildSources();
  if (current.fingerprint !== manifest.sources.fingerprint) {
    manifest.status = 'stale';
    manifest.changedSources = [...new Set([...Object.keys(current.files), ...Object.keys(manifest.sources.files)])]
      .filter(path => current.files[path] !== manifest.sources.files[path]);
    console.error('Audit build sources changed; the bundle cannot be used as verification.');
    process.exitCode = 1;
  } else { manifest.status = 'ready'; console.log('Audit bundle verified against unchanged application sources.'); }
  saveManifest();
});
