import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { transformSync } from 'esbuild';
const files = [...new Set(execFileSync('git', ['ls-files', '--modified', '--others', '--exclude-standard'], { encoding: 'utf8' }).split(/\r?\n/))];
let checked = 0;
const failures = [];
for (const file of files) {
  if (!fs.existsSync(file) || !/\.(vue|ts)$/.test(file) || file.startsWith('lib/hooks/')) continue;
  try {
    const source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.vue')) {
      const parsed = parse(source, { filename: file });
      if (parsed.errors.length) throw parsed.errors[0];
      if (parsed.descriptor.scriptSetup) compileScript(parsed.descriptor, { id: file });
      if (parsed.descriptor.template) {
        const result = compileTemplate({ source: parsed.descriptor.template.content, filename: file, id: file });
        if (result.errors.length) throw result.errors[0];
      }
    } else transformSync(source, { loader: 'ts' });
    checked++;
  } catch (error) { failures.push({ file, message: String(error.message || error).slice(0, 350) }); }
}
console.log(JSON.stringify({ checked, failures }, null, 2));
if (failures.length) process.exitCode = 1;
