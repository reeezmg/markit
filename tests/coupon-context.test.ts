import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { computed, ref } from 'vue';

test('coupon list query remains reactive after Nuxt setup context ends', () => {
  const source = readFileSync('components/Coupon/CouponList.vue', 'utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast = ts.createSourceFile('coupon.ts', source, ts.ScriptTarget.Latest, true);
  const statements = ast.statements.filter(node => ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(declaration => ['useAuth', 'queryArgs'].includes(declaration.name.getText(ast))))
    .map(node => node.getText(ast)).join('\n');
  let setup = true;
  const auth = { session: ref({ companyId: 'head' }) };
  const bindings = {
    computed, companyScope: { auth },
    useNuxtApp: () => {
      if (!setup) throw Error('[nuxt] instance unavailable outside setup');
      return { $auth: auth };
    },
    selectedType: ref<string[]>([]), selectedAudienceType: ref<string[]>([]),
    selectedStatus: ref<boolean[]>([]), sort: ref({ column: 'id', direction: 'asc' }),
    page: ref(1), pageCount: ref('10'),
  };
  const js = ts.transpileModule(statements, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const query = new Function(...Object.keys(bindings), js + ';return queryArgs;')(...Object.values(bindings));
  setup = false;
  assert.equal(query.value.where.companyId, 'head');
  auth.session.value.companyId = 'branch';
  bindings.page.value = 2;
  bindings.selectedStatus.value = [false];
  assert.equal(query.value.where.companyId, 'branch');
  assert.equal(query.value.where.isActive, false);
  assert.equal(query.value.skip, 10);
});
