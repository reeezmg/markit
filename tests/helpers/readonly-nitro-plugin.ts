import { defineNitroPlugin } from 'nitropack/runtime';
import { pool } from '../../server/db';
import { prisma } from '../../server/prisma';

// Loaded only by the isolated end-to-end server. Refuse to serve any page/API
// until the actual server-side clients have proven they cannot write.
export default defineNitroPlugin(async () => {
  const formTests = process.env.BRANCH_E2E_FORM_TESTS === '1' && /^BRANCH_E2E_[A-Z0-9_]+$/.test(process.env.BRANCH_E2E_RECORD_PREFIX || '');
  const pg = await pool.query('SHOW default_transaction_read_only');
  const orm: any = await prisma.$queryRawUnsafe('SHOW default_transaction_read_only');
  if (formTests) {
    if (pg.rows[0]?.default_transaction_read_only !== 'off' || orm[0]?.default_transaction_read_only !== 'off')
      throw new Error('Branch E2E server refused startup: test form database must allow fixture writes');
    console.info('[branch-e2e] Actual Nitro clients verified TEST FORM MODE.');
    return;
  }
  if (pg.rows[0]?.default_transaction_read_only !== 'on' || orm[0]?.default_transaction_read_only !== 'on') {
    throw new Error('Branch E2E server refused startup: database clients must both be read-only');
  }
  console.info('[branch-e2e] Actual Nitro PostgreSQL and Prisma clients verified READ ONLY.');
});
