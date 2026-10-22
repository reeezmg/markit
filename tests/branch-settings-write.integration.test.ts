import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { enhance } from '@zenstackhq/runtime';
import { prisma } from '../server/prisma';
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope';

// Real enhanced model client + production organization guard, with run-owned
// companies/user only. All fixture records roll back; no messages or uploads.
const prefix = 'BRANCH_E2E_SETTINGS_' + randomUUID(), userId = randomUUID();
const ids = [randomUUID(), randomUUID()], transaction = prisma.$transaction.bind(prisma);
const rollback = new Error('Settings fixture rollback');
const report: any = { startedAt: new Date().toISOString(), mode: 'real enhanced model writes; rollback-only',
  schemaChanges: false, existingRecords: [], fixtureIds: { companies: ids, user: userId }, results: [], cleanup: 'pending' };
const save = () => writeFileSync('tests/branch-reports/settings-writes-followup.json', JSON.stringify(report, null, 2) + '\n');
save();
try {
  await transaction(async tx => {
    await tx.user.create({ data: { id: userId, email: prefix.toLowerCase() + '@example.invalid', password: 'unused-fixture-password' } });
    for (const [index, id] of ids.entries()) {
      await tx.company.create({ data: { id, name: prefix + '_' + index, type: 'seller', plan: 'pro', category: [], deliveryType: [], deliveryMode: [],
        ...(index === 0 ? { isHeadOffice: true } : { parentCompanyId: ids[0] }) } });
      await tx.companyUser.create({ data: { userId, companyId: id, role: 'admin', code: 1, name: 'Run-owned settings user' } });
    }
    (prisma as any).$transaction = async (callback: any) => callback(tx);
    try {
      const client = enhance(prisma, { user: { id: userId, role: 'admin' } });
      for (const [index, companyId] of ids.entries()) {
        const role = index === 0 ? 'head' : 'branch';
        const scoped = scopeOrganizationModelReads(client, companyId, index === 0 ? ids : [companyId]);
        const data = { storeUniqueName: 'e2e_' + companyId.replaceAll('-', ''), phone: 'fixture-phone',
          email: 'store@example.invalid', description: 'Run-owned description', thankYouNote: 'Fixture thanks',
          refundPolicy: 'Fixture refund', returnPolicy: 'Fixture return', accHolderName: 'Fixture holder',
          accountNo: 'fixture-account', ifsc: 'FIXT0000001', bankName: 'Fixture bank', gstin: 'fixture-gstin', upiId: 'fixture@example',
          isTaxIncluded: false, isAiImage: false, isUserTrackIncluded: false, isCostIncluded: false, pointsValue: 0,
          category: ['Men'], deliveryType: ['pickup'], deliveryMode: ['self'], deliveryRadius: 1, deliveryDiscount: 0, codCharge: 0 };
        await scoped.company.update({ where: { id: companyId }, data });
        const saved = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
        for (const [key, value] of Object.entries(data)) assert.deepEqual((saved as any)[key], value, role + ': ' + key);
        const prefixes={billPrefix:'INV',expensePrefix:'EX',distributorPrefix:'SUP',distributorPaymentPrefix:'PAY',distributorCreditPrefix:'CR',clientPrefix:'CU',userPrefix:'ST',accountPrefix:'AC'};
        await scoped.company.update({where:{id:companyId},data:{...prefixes,printerLabelSize:'50x38 mm'}});
        const numbered=await tx.company.findUniqueOrThrow({where:{id:companyId}});
        for(const [key,value]of Object.entries(prefixes))assert.equal((numbered as any)[key],value);
        assert.equal(numbered.printerLabelSize,'50x38 mm');
        const inputData={productinput:{upsert:{create:{name:true,brand:false,dimension:true},update:{name:true,brand:false,dimension:true}}},
          variantinput:{upsert:{create:{qty:false,unit:['Nos','Kg'],sizeLabels:['Size','Shade'],sizeDimension:true},update:{qty:false,unit:['Nos','Kg'],sizeLabels:['Size','Shade'],sizeDimension:true}}}};
        await scoped.company.update({where:{id:companyId},data:inputData});
        await scoped.company.update({where:{id:companyId},data:inputData});
        const inputs=await tx.company.findUniqueOrThrow({where:{id:companyId},include:{productinput:true,variantinput:true}});
        assert.equal(inputs.productinput?.dimension,true);assert.equal(inputs.productinput?.brand,false);
        assert.equal(inputs.variantinput?.sizeDimension,true);assert.equal(inputs.variantinput?.qty,false);
        assert.deepEqual(inputs.variantinput?.unit,['Nos','Kg']);assert.deepEqual(inputs.variantinput?.sizeLabels,['Size','Shade']);
        const requestKey={companyId,pageName:'ecommerce_requests',key:'request_rules'};
        await scoped.generalPreference.upsert({where:{companyId_pageName_key:requestKey},create:{...requestKey,value:{cancellation:{enabled:true,windowHours:0},allowPartialItemRequests:false},active:true},update:{value:{cancellation:{enabled:false,windowHours:12}}}});
        await scoped.generalPreference.upsert({where:{companyId_pageName_key:requestKey},create:{...requestKey,value:{}},update:{value:{cancellation:{enabled:false,windowHours:12}}}});
        assert.deepEqual((await tx.generalPreference.findUniqueOrThrow({where:{companyId_pageName_key:requestKey}})).value,{cancellation:{enabled:false,windowHours:12}});
        await scoped.address.upsert({ where: { companyId }, create: { company: { connect: { id: companyId } }, street: 'Fixture street', city: 'Fixture city', lat: 0, lng: 0 },
          update: { street: 'Fixture street', city: 'Fixture city', lat: 0, lng: 0 } });
        await scoped.address.upsert({ where: { companyId }, create: { company: { connect: { id: companyId } }, street: 'unused' },
          update: { street: 'Edited fixture street' } });
        assert.equal((await tx.address.findUniqueOrThrow({ where: { companyId } })).street, 'Edited fixture street');
        await scoped.companyUser.update({ where: { companyId_userId: { companyId, userId } }, data: { name: role + ' fixture alias' } });
        assert.equal((await tx.companyUser.findUniqueOrThrow({ where: { companyId_userId: { companyId, userId } } })).name, role + ' fixture alias');
        await scoped.user.update({ where: { id: userId }, data: { image: prefix + '/' + role + '-avatar' } });
        assert.equal((await tx.user.findUniqueOrThrow({ where: { id: userId } })).image, prefix + '/' + role + '-avatar');
        if (index === 0) {
          await scoped.company.update({ where: { id: ids[1] }, data: { thankYouNote: 'Head-office branch edit' } });
          assert.equal((await tx.company.findUniqueOrThrow({ where: { id: ids[1] } })).thankYouNote, 'Head-office branch edit');
        } else {
          await assert.rejects(scoped.company.update({ where: { id: ids[0] }, data: { description: 'Forbidden branch update' } }));
          await assert.rejects(scoped.address.upsert({ where: { companyId: ids[0] }, create: { companyId: ids[0] }, update: { street: 'Forbidden' } }));
          assert.equal((await tx.company.findUniqueOrThrow({ where: { id: ids[0] } })).description, data.description);
        }
        report.results.push({ company: role, status: 'passed', checks: ['store-identity', 'contact', 'descriptions-and-policies', 'bank-details',
          'feature-toggles', 'zero-points', 'delivery-settings', 'address-create-edit-zero-coordinates', 'company-user-alias', 'profile-image-model-write',
          'document-prefixes','printer-label-size','atomic-product-fields-dimensions-units-size-labels-create-edit','request-preferences-create-edit',
          index === 0 ? 'head-office-edits-authorized-branch' : 'branch-cannot-edit-head-office'] }); save();
      }
    } finally { (prisma as any).$transaction = transaction; }
    throw rollback;
  }, { maxWait: 15000, timeout: 120000 }).catch(error => { if (error !== rollback) throw error; });
} catch (error: any) {
  report.error = { message: error.statusMessage || error.message, code: error.code }; process.exitCode = 1;
} finally {
  (prisma as any).$transaction = transaction;
  assert.equal(await prisma.company.count({ where: { id: { in: ids } } }), 0);
  assert.equal(await prisma.user.count({ where: { id: userId } }), 0);
  report.cleanup = 'verified: all run-owned settings companies/user and related records rolled back';
  report.finishedAt = new Date().toISOString(); save(); await prisma.$disconnect();
  console.log(report.error ? 'FAIL: see settings-writes-followup.json' : 'PASS: both-role settings model writes, reload and company isolation; rollback verified');
}
