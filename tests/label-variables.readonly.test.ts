import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { readLabelVariables } from '../server/utils/labelVariables';

config({ path: '.env', quiet: true });
const db = new PrismaClient();
try {
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const item = await tx.item.findFirst({
      where: { variant: { product: { purchaseorderId: { not: null } } } },
      select: { id: true, companyId: true },
    }) || await tx.item.findFirst({ select: { id: true, companyId: true } });
    assert.ok(item, 'No saved item available for read-only verification');
    const rows = await readLabelVariables(tx as unknown as PrismaClient, item.companyId, [item.id], []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].itemId, item.id);
    assert.ok(rows[0].variables.company);
    assert.ok(rows[0].variables.product);
    assert.ok(rows[0].variables.variant);
    const custom = await tx.productCustomField.findMany({ where: { companyId: item.companyId, active: true }, select: { scope: true, key: true, label: true, type: true } });
    assert.ok(Array.isArray(custom));
    console.log('PASS live company/product/variant/item and linked supplier lookup in a READ ONLY transaction');
    console.log('PASS live custom-field catalogue lookup');
  }, { timeout: 20000 });
} finally { await db.$disconnect(); }
