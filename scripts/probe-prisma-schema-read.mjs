import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { accountingTestDatabaseUrl } from './lib/accounting-test-database.mjs';
import fs from 'node:fs';
dotenv.config({ quiet: true });
const original = process.env.DATABASE_URL;
const dir = process.env.PRISMA_SCHEMA_REPORT_DIR || 'scripts/production-accounting/runs/prisma-schema-read-2026-10-06';
fs.mkdirSync(dir, { recursive: true });
for (const [connection, databaseUrl] of [['pooled', original], ['direct', accountingTestDatabaseUrl(original)]]) {
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff',
      '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
      { env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = '';
    child.stdout.on('data', chunk => output += chunk);
    child.stderr.on('data', chunk => error += chunk);
    child.on('error', e => resolve({ code: null, error: e.message }));
    child.on('exit', code => { fs.writeFileSync(`${dir}/${connection}-diff.sql`, output); resolve({ code, error: error.replaceAll(databaseUrl, '[REDACTED]'),
      schemaDiffProduced: output.includes('CREATE') || output.includes('ALTER') || output.includes('DROP'),
      outputBytes: Buffer.byteLength(output) }); });
  });
  console.log(JSON.stringify({ connection, ...result }));
}
