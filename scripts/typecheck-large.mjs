import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = fileURLToPath(new URL('../node_modules/.cache/markit-typecheck.tsbuildinfo', import.meta.url));
mkdirSync(dirname(cache), { recursive: true });
const memory = Number(process.env.TYPECHECK_MEMORY_MB || 8192);
if (!Number.isSafeInteger(memory) || memory <= 0) throw new Error('TYPECHECK_MEMORY_MB must be a positive integer');
const inherited = (process.env.NODE_OPTIONS || '').replace(/--max[-_]old[-_]space[-_]size(?:=|\s+)\d+/g, '').trim();
const env = { ...process.env, NUXT_TELEMETRY_DISABLED: '1',
  NODE_OPTIONS: `${inherited} --max-old-space-size=${memory}`.trim() };

async function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(file, import.meta.url)), ...args],
      { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}
console.log(`Application type check: Node heap limit ${memory} MB; persistent incremental cache in node_modules/.cache.`);
const prepared = await run('../node_modules/@nuxt/cli/bin/nuxi.mjs', ['prepare']);
process.exitCode = prepared || await run('../node_modules/vue-tsc/bin/vue-tsc.js',
  ['--noEmit', '--incremental', '--tsBuildInfoFile', cache]);
