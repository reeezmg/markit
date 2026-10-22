import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { createApp, createError, eventHandler, readBody, splitCookiesString, toWebHandler } from 'h3';
import { useChunkedAuthSession } from '../auth/server/utils/chunked-session';
import { normalizeBillingUnits } from '../utils/billing-units';
import { normalizeSizeLabels } from '../utils/size-labels';
import { packSelectedAccounts } from '../server/utils/selected-accounts-codec';

// Reuse the existing read-only audit's local encrypted-session bootstrap.
// Credentials, cookies and page contents stay in memory; this sends only GETs.
const origin = process.env.COUPON_TEST_ORIGIN || 'http://localhost:3000';
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set('options', '-c default_transaction_read_only=on');
const db = new Pool({ connectionString: url.toString(), options: '-c default_transaction_read_only=on' });
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
try {
  assert.equal((await db.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only, 'on');
  const mode: any = await prisma.$queryRawUnsafe('SHOW default_transaction_read_only');
  assert.equal(mode[0].default_transaction_read_only, 'on');
  const harness = readFileSync('tests/run-branch-e2e.ts', 'utf8');
  const source = harness.slice(harness.indexOf('async function cookieFor('), harness.indexOf('\ntry {', harness.indexOf('async function cookieFor(')));
  const bindings = { prisma, db, ts, process, eventHandler, readBody, createError,
    useChunkedAuthSession, packSelectedAccounts, normalizeBillingUnits, normalizeSizeLabels,
    readFileSync, createApp, toWebHandler, Request, origin, assert, splitCookiesString };
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const cookieFor = new Function(...Object.keys(bindings), js + ';return cookieFor;')(...Object.values(bindings));
  const { rows } = await db.query(`SELECT h.id head,b.id branch,hu.user_id FROM companies h
    JOIN company_users hu ON hu.company_id=h.id AND hu.role='admin' AND hu.status=true AND hu.deleted=false
    JOIN companies b ON b.parent_company_id=h.id AND b.status=true
    JOIN company_users bu ON bu.company_id=b.id AND bu.user_id=hu.user_id AND bu.status=true AND bu.deleted=false
    WHERE h.is_head_office=true AND h.parent_company_id IS NULL AND h.status=true ORDER BY h.id,b.id LIMIT 1`);
  assert.ok(rows.length, 'Existing authorized head-office and branch membership required');
  const report: any = { databaseMode: 'read-only bootstrap; GET requests only', checkedAt: new Date().toISOString(), pages: [] };
  for (const context of ['head', 'branch'] as const) {
    const cookies = await cookieFor(rows[0].user_id, rows[0][context]);
    const headers = { cookie: cookies.map((cookie: any) => `${cookie.name}=${cookie.value}`).join('; ') };
    const session = await fetch(origin + '/api/auth/session', { headers, signal: AbortSignal.timeout(180000) });
    assert.equal(session.status, 200);
    const auth: any = await session.json();
    assert.equal(auth.companyId, rows[0][context], 'Server accepts intended company session');
    const response = await fetch(origin + '/coupon', { headers, redirect: 'manual', signal: AbortSignal.timeout(180000) });
    const html = await response.text();
    report.pages.push({ context, status: response.status, hasNuxtContextError: html.includes('A composable that requires access'),
      hasCouponTable: html.includes('Rows per page:') && html.includes('Audience') });
    writeFileSync('tests/branch-reports/coupon-dev-readonly.json', JSON.stringify(report, null, 2) + '\n');
    assert.equal(response.status, 200, `${context} /coupon status`);
    assert.ok(!html.includes('A composable that requires access'), `${context} has no Nuxt context error`);
    assert.ok(html.includes('Rows per page:'), `${context} renders coupon table`);
    console.log(`PASS: ${context} authenticated /coupon renders HTTP 200 without Nuxt context error`);
  }
} finally {
  await prisma.$disconnect();
  await db.end();
}
