import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { parse, compileTemplate } from '@vue/compiler-sfc';
import ts from 'typescript';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(dir, entry.name)) : entry.name.endsWith('.vue') ? [join(dir, entry.name)] : []);
}

test('every Storetools page parses and compiles, including branch controls and dynamic routes', () => {
  const pages = files('pages');
  const problems: string[] = [];
  const inventory = pages.map(file => {
    const source = readFileSync(file, 'utf8');
    const { descriptor, errors } = parse(source, { filename: file });
    for (const error of errors) problems.push(`${file}: ${String(error)}`);
    if (descriptor.template) {
      const result = compileTemplate({ source: descriptor.template.content, filename: file, id: file,
        compilerOptions: { expressionPlugins: ['typescript'] } });
      for (const error of result.errors) problems.push(`${file}: ${String(error)}`);
    }
    for (const block of [descriptor.script, descriptor.scriptSetup].filter(Boolean)) {
      const result = ts.transpileModule(block!.content, { fileName: file + (block!.lang === 'ts' ? '.ts' : '.js'),
        reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, allowJs: true } });
      for (const error of result.diagnostics ?? []) if (error.category === ts.DiagnosticCategory.Error) {
        problems.push(`${file}: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`);
      }
    }
    const path = relative('pages', file).replaceAll('\\', '/');
    const section = path.split('/')[0].replace('.vue', '');
    const hasChild = source.includes('<NuxtPage');
    const scope = source.match(/useCompanyScope\(([^)]*)\)/)?.[1] ?? null;
    const publicPage = ['index.vue', 'login.vue', 'register.vue', 'forgot-password.vue', 'terms.vue', 'landing.vue',
      'launching.vue', 'storelanding.vue', 'nonetwork.vue', 'blogs.vue'].includes(path) || section === 'blogs';
    const sessionAreas = ['settings', 'ecommerce-cms', 'order', 'ai', 'storefront', 'statement', 'notifications', 'cleanup', 'offline', 'accounts'];
    const inheritedAreas = ['reports', 'dashboard', 'accountant', 'investments', 'accounts'];
    const mode = publicPage ? 'public/auth'
      : hasChild ? 'route shell'
      : scope !== null || source.includes('useSettingsCompany(') ? 'local company scope'
      : path === 'settings/branches.vue' ? 'head-office organization management'
      : inheritedAreas.includes(section) ? 'parent company scope'
      : sessionAreas.includes(section) ? 'sidebar company'
      : source.replace(/<!--[^]*?-->/g, '').trim().length < 250 ? 'redirect/stub'
      : section === 'receipt' ? 'record owner/public share'
      : section === 'saleshistory' ? 'record owner'
      : 'component/session scope';
    return { page: path, mode, scope, apiPaths: [...new Set(source.match(/\/api\/[\w/-]+/g) ?? [])],
      verification: 'Vue template + script syntax; not an authenticated browser walkthrough' };
  });
  mkdirSync('tests/branch-reports', { recursive: true });
  writeFileSync('tests/branch-reports/page-audit.json', JSON.stringify({ pages: inventory.length, problems, inventory }, null, 2) + '\n');
  assert.deepEqual(problems, []);
  console.log(`Compiled ${pages.length} pages; scope inventory: tests/branch-reports/page-audit.json`);
});

test('company dropdown, coupon and report Vue components compile', () => {
  for (const file of ['components/CompanyTableFilter.vue', 'components/CompanyFormField.vue', 'components/CompanyControlPlacement.vue', 'components/ErpPageNavbar.vue', 'components/TeamsDropdown.vue',
    ...files('components/Coupon')]) {
    const { descriptor, errors } = parse(readFileSync(file, 'utf8'), { filename: file });
    assert.deepEqual(errors, [], file);
    const result = compileTemplate({ source: descriptor.template!.content, filename: file, id: file,
      compilerOptions: { expressionPlugins: ['typescript'] } });
    assert.deepEqual(result.errors, [], file);
  }
});

test('page v-model bindings do not reassign plain constants', () => {
  const problems: string[] = [];
  for (const file of files('pages')) {
    const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file });
    if (!descriptor.template || !descriptor.scriptSetup) continue;
    const source = ts.createSourceFile(file + '.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
    const plainConstants = new Set<string>();
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const value = declaration.initializer;
        if (ts.isObjectLiteralExpression(value) || ts.isArrayLiteralExpression(value) ||
            ts.isStringLiteral(value) || ts.isNumericLiteral(value) ||
            value.kind === ts.SyntaxKind.TrueKeyword || value.kind === ts.SyntaxKind.FalseKeyword ||
            (ts.isCallExpression(value) && ts.isIdentifier(value.expression) && value.expression.text === 'reactive'))
          plainConstants.add(declaration.name.text);
      }
    }
    for (const match of descriptor.template.content.matchAll(/\bv-model(?::[\w-]+)?(?:\.[\w-]+)*=["']([A-Za-z_$][\w$]*)["']/g)) {
      if (plainConstants.has(match[1])) problems.push(`${file}: v-model cannot reassign const ${match[1]}; use a writable ref`);
    }
  }
  assert.deepEqual(problems, []);
});

test('page script language matches generic Vue API calls', () => {
  const problems: string[] = [];
  for (const file of files('pages')) {
    const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file });
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (!block || ['ts', 'tsx'].includes(block.lang || '')) continue;
      const source = ts.createSourceFile(file + '.ts', block.content, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.typeArguments?.length && ts.isIdentifier(node.expression) &&
            ['ref', 'computed', 'reactive', 'shallowRef', 'useState', 'useFetch', 'useAsyncData'].includes(node.expression.text))
          problems.push(`${file}: generic ${node.expression.text} call needs a TypeScript script block`);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  assert.deepEqual(problems, []);
});
