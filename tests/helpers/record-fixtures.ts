import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

/** Explicit test-database fixtures for detail pages. Financial fixtures stay in
 * draft/zero-value state; browser requests remain read-only. Never clone user data.
 */
export class RecordFixtures {
  records: Array<{ model: string; id: string; companyId: string; data: any; state: string }> = [];
  cleanup = 'pending';
  counters: Record<string, any> = {};
  constructor(private prisma: any, private prefix: string, private path: string) { this.save(); }
  save() { writeFileSync(this.path, JSON.stringify({ prefix: this.prefix, existingRecords: [], records: this.records, counters: this.counters,
    counterPolicy: 'Normal fixture numbering gaps are retained; counters are never rewound.', cleanup: this.cleanup }, null, 2) + '\n'); }
  async add(model: string, companyId: string, data: any) {
    const id = randomUUID();
    assert.equal(await this.prisma[model].count({ where: { id } }), 0);
    const record = { model, id, companyId, data, state: 'planned' };
    this.records.push(record); this.save(); // Backup before each fixture write.
    const created = await this.prisma[model].create({ data: { ...data, id,
      ...(['distributor', 'trynbuy'].includes(model) ? {} : { companyId }) } });
    record.state = 'created'; this.save();
    return created;
  }
  async seed(companyId: string, userId: string) {
    this.counters[companyId] = { before: await this.prisma.company.findUnique({ where: { id: companyId },
      select: { billCounter: true, invoiceCounter: true, returnCounter: true } }) }; this.save();
    const name = this.prefix + 'DETAIL';
    await this.add('collection', companyId, { name, description: 'Run-owned detail-page fixture' });
    const category = await this.prisma.category.findFirst({ where: { companyId }, select: { id: true } });
    await this.add('product', companyId, { name, description: 'Run-owned detail-page fixture', categoryId: category?.id,
      variants: { create: [{ name: 'Run-owned variant', companyId, sprice: 0, pprice: 0,
        items: { create: [{ companyId, size: 'M', qty: 1, initialQty: 1, soldQty: 0 }] } }] } });
    await this.add('bankAccount', companyId, { bankName: name, accHolderName: 'Run-owned archive fixture', openingBalance: 0 });
    await this.add('statementBatch', companyId, { userId, sourceFileName: name + '.csv', rows: { create: [
      { sno: 1, date: '2026-10-01', description: 'Run-owned unexecuted statement row', debit: 0, credit: 0, balance: 0 },
    ] } });
    await this.add('payrollCycle', companyId, { name, month: 10, year: 2060, status: 'DRAFT',
      paymentDate: new Date('2060-10-31T00:00:00Z'), periodStart: new Date('2060-10-01T00:00:00Z'), periodEnd: new Date('2060-10-31T00:00:00Z'),
      lines: { create: [{ companyId, userId, baseSalary: 0, netPay: 0 }] } });
    await this.add('accountantManualJournal', companyId, { entryNumber: name, notes: 'Run-owned unposted draft',
      journalDate: new Date('2026-10-01T00:00:00Z'), status: 'DRAFT' });
    await this.add('accountantInvestor', companyId, { name, profile: {}, accounts: {} });
    const supplier = await this.add('distributor', companyId, { name, companies: { create: [{ companyId, openingDue: 0 }] } });
    await this.add('purchaseReturn', companyId, { distributorId: supplier.id, remarks: name, totalAmount: 0 });
    await this.add('bill', companyId, { createdAt: new Date(), isMarkit: true, type: 'STANDARD',
      subtotal: 0, grandTotal: 0, paymentStatus: 'PENDING', paymentMethod: 'Cash' });
    await this.add('trynbuy', companyId, { checkoutMethod: 'trynbuy', deliveryType: 'pickup', subtotal: 0,
      company: { connect: [{ id: companyId }] } });
  }
  id(model: string, companyId: string) { return this.records.find(r => r.model === model && r.companyId === companyId)?.id; }
  async removeAll() {
    for (const record of [...this.records].reverse()) {
      // IDs and owners are fixed before creation; cleanup cannot select ordinary records.
      const ownership = record.model === 'distributor' ? { companies: { some: { companyId: record.companyId } } }
        : record.model === 'trynbuy' ? { company: { some: { id: record.companyId } } } : { companyId: record.companyId };
      const where = { id: record.id, ...ownership };
      const current = await this.prisma[record.model].findFirst({ where });
      if (record.model === 'distributor' && current)
        await this.prisma.distributorCompany.delete({ where: { distributorId_companyId: { distributorId: record.id, companyId: record.companyId } } });
      if (current) await this.prisma[record.model].delete({ where: { id: record.id } });
      assert.equal(await this.prisma[record.model].count({ where: { id: record.id } }), 0);
      record.state = 'removed'; this.save();
    }
    for (const companyId of Object.keys(this.counters)) this.counters[companyId].after = await this.prisma.company.findUnique({ where: { id: companyId },
      select: { billCounter: true, invoiceCounter: true, returnCounter: true } });
    this.cleanup = 'verified: all run-owned detail fixtures removed'; this.save();
  }
}
