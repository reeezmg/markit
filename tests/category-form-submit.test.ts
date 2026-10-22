import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { ref } from 'vue';

function form(edit = false) {
  const path = edit ? 'pages/products/categories/edit/[id].vue' : 'pages/products/categories/add.vue';
  const source = readFileSync(path, 'utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast = ts.createSourceFile('category.ts', source, ts.ScriptTarget.Latest, true);
  const names = edit ? ['saveCategory'] : ['createValue', 'handleSubmit'];
  const statements = ast.statements.filter(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => names.includes(d.name.getText(ast))));
  const writes: any[] = [], notices: any[] = [];
  const fields = Object.fromEntries(['name', 'hsn', 'shortCut', 'description', 'taxType', 'fixedTax', 'thresholdAmount', 'taxBelowThreshold', 'taxAboveThreshold', 'margin', 'targetAudience', 'live', 'files', 'bannerFile', 'subcategory', 'isLoading', 'isCategorySaving', 'category'].map(key => [key, ref(key === 'subcategory' ? [] : key === 'files' ? null : undefined)]));
  const bindings = { ...fields, toast: { add: (notice: any) => notices.push(notice) },
    CreateCategory: { mutateAsync: async (value: any) => { writes.push(value); return {}; } },
    UpdateCategory: { mutateAsync: async (value: any) => { writes.push(value); return {}; } },
    useAuth: () => ({ session: ref({ companyId: 'branch-fixture' }) }),
    categoryStore: { refreshCategories: async () => {}, categories: [] },
    router: { push() {} }, route: { params: { id: 'own-category' } },
    awsService: { deleteObjects: async () => {} }, uploadImage: async () => {},
    refetchCategory: async () => {}, console: { log() {} }, alert() {},
  };
  const js = ts.transpileModule(statements.map(n => n.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const methods = new Function(...Object.keys(bindings), js + ';return {' + names.join(',') + '};')(...Object.values(bindings));
  return { ...methods, fields, writes, notices };
}

for (const edit of [false, true]) test(`category ${edit ? 'edit' : 'create'} rejects a blank name before any write`, async () => {
  const current = form(edit); current.fields.name.value = '   ';
  await (edit ? current.saveCategory() : current.handleSubmit({ preventDefault() {} }));
  assert.equal(current.writes.length, 0);
  assert.ok(current.notices.some((notice: any) => notice.title === 'Category name is required'));
});

test('category create preserves an explicitly inactive status and zero tax', async () => {
  const current = form();
  current.createValue({ name: 'Fixture category', live: false, taxType: 'FIXED', fixedTax: 0, margin: 0 });
  await current.handleSubmit({ preventDefault() {} });
  assert.equal(current.writes.length, 1);
  assert.equal(current.writes[0].data.company.connect.id, 'branch-fixture');
  assert.equal(current.writes[0].data.status, false);
  assert.equal(current.writes[0].data.fixedTax, 0);
});
