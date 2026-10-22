import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import { Pool } from 'pg';

// Catalog inspection only. Never creates schemas, tables, indexes or test records.
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set('options', '-c default_transaction_read_only=on');
const pool = new Pool({ connectionString: url.toString() });
try {
  assert.equal((await pool.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only, 'on');
  const schema = url.searchParams.get('schema') || 'public';
  const { rows } = await pool.query('SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1', [schema]);
  const tables = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
    tables.get(row.table_name)!.add(row.column_name);
  }
  const missingTables: any[] = [], missingColumns: any[] = [];
  const implicitRelations = new Map<string, number>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = model.dbName || model.name;
    if (!tables.has(table)) missingTables.push({ model: model.name, table });
    else for (const field of model.fields.filter(field => field.kind !== 'object')) {
      const column = field.dbName || field.name;
      if (!tables.get(table)!.has(column)) missingColumns.push({ model: model.name, table, column });
    }
    for (const field of model.fields.filter(field => field.kind === 'object' && field.isList && !field.relationFromFields?.length && field.relationName))
      implicitRelations.set(field.relationName!, (implicitRelations.get(field.relationName!) || 0) + 1);
  }
  const missingImplicitJoinTables = [...implicitRelations].filter(([name, count]) => count === 2 && !tables.has('_' + name)).map(([name]) => '_' + name);
  const report = { checkedAt: new Date().toISOString(), schema, modelsChecked: Prisma.dmmf.datamodel.models.length,
    databaseMode: 'read-only (verified)', missingTables, missingColumns, missingImplicitJoinTables };
  mkdirSync('tests/branch-reports', { recursive: true });
  writeFileSync('tests/branch-reports/schema-compatibility.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`Read-only schema inspection: ${report.modelsChecked} models; ${missingTables.length} missing tables, ${missingColumns.length} missing columns, ${missingImplicitJoinTables.length} missing implicit joins.`);
  for (const row of missingTables) console.log(`Missing table: ${row.model} -> ${row.table}`);
} finally { await pool.end(); }
