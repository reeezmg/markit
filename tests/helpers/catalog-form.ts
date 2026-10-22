import assert from 'node:assert/strict';

export async function testCatalogForm(context: {
  model: 'brand' | 'collection' | 'category'; company: string; companyId: string; sidebarCompanyId: string;
  targetCompany: string; selectCompanyId?: string; prefix: string; prisma: any; report: any;
  save(): void; snapshot(): Promise<void>; visit(route: string): Promise<void>; assertRunning(): void;
  evaluate(expression: string): Promise<any>; idle(): boolean; errors(): any[]; warnings(): any[]; timeout: number;
}) {
  const { model, company, companyId } = context;
  const plural = model === 'brand' ? 'brands' : model === 'category' ? 'categories' : 'collections';
  const label = model === 'brand' ? 'Brand' : model === 'category' ? 'Category' : 'Collection';
  const name = context.prefix + company.toUpperCase() + '_' + model.toUpperCase();
  const list = '/products/' + plural;
  const result: any = { company, targetCompany: context.targetCompany, form: model, name, status: 'running', steps: [], errors: [], hydrationWarnings: [] };
  context.report.forms.push(result); context.save();
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (condition: () => Promise<any>, label: string) => {
    const deadline = Date.now() + context.timeout;
    while (Date.now() < deadline) { context.assertRunning(); if (await condition()) return; await pause(300); }
    throw Error(`${model} form timed out: ${label}`);
  };
  const clean = async () => {
    await waitFor(async () => context.idle(), 'API and component requests settled');
    assert.equal(context.errors().length, 0, 'Form must finish without API/JavaScript errors');
    assert.equal(context.warnings().length, 0, 'Form must hydrate without mismatches');
  };
  const visit = async (route: string) => {
    await context.visit(route);
    assert.equal(context.report.pages.at(-1)?.status, 'passed', `Form page must pass: ${route}`);
  };
  const click = async (text: string, selector = 'button') => {
    assert.ok(await context.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(text)});if(!e)return false;e.click();return true})()`), 'Visible control: ' + text);
  };
  const fill = async (selector: string, value: string) => {
    assert.ok(await context.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`), 'Input: ' + selector);
  };
  const record = () => context.prisma[model].findFirst({ where: { name, companyId } });
  const assertSidebar = async () => {
    const current = await context.evaluate("(async()=>{const response=await fetch('/api/auth/session');if(!response.ok)throw Error('Session verification failed');return (await response.json()).companyId})()");
    assert.equal(current, context.sidebarCompanyId, 'A local form selection must preserve the authenticated sidebar company');
  };
  const action = async (text: string) => {
    const search = model === 'brand' ? 'input[placeholder="Search brand..."]' : 'input[placeholder="Search..."]';
    await fill(search, name);
    await waitFor(async () => context.idle() && await context.evaluate(`!![...document.querySelectorAll('tr')].find(e=>e.textContent.includes(${JSON.stringify(name)}))`), 'fixture row in filtered list');
    assert.ok(await context.evaluate(`(()=>{const row=[...document.querySelectorAll('tr')].find(e=>e.textContent.includes(${JSON.stringify(name)}));const button=row?.querySelector('button[aria-haspopup="menu"]')||row?.querySelector('td:last-child button');if(!button)return false;button.click();return true})()`), 'Fixture row actions');
    await waitFor(async () => context.evaluate(`!![...document.querySelectorAll('[role="menuitem"]')].find(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(text)})`), 'action menu');
    await click(text, '[role="menuitem"]');
  };
  try {
    await visit(list + '/add');
    if (context.selectCompanyId) {
      assert.ok(await context.evaluate(`(()=>{const select=[...document.querySelectorAll('select')].find(s=>s.getClientRects().length&&[...s.options].some(o=>o.value===${JSON.stringify(context.selectCompanyId)}));if(!select)return false;select.value=${JSON.stringify(context.selectCompanyId)};select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`), 'Head-office form offers the authorized branch');
      await waitFor(async () => context.evaluate(`new URL(location.href).searchParams.get('entryCompany')===${JSON.stringify(context.selectCompanyId)}`), 'form route reflects the selected company');
      await clean(); await assertSidebar();
      result.steps.push('head-office form selected branch without switching the sidebar company');
    }
    await click('Save'); await pause(500);
    assert.equal(await record(), null, 'Invalid form must not create a fixture');
    await waitFor(async () => context.evaluate(`document.body.innerText.includes(${JSON.stringify(label + ' name is required')})`), 'required-name feedback visible');
    assert.ok(await context.evaluate("!!document.querySelector('input[type=text]')"));
    result.steps.push('required name rejected'); context.save();
    await fill('input[type="text"]', name);
    await fill(model === 'category' ? '#hsn' : 'textarea', model === 'category' ? '6109' : 'Created through the seller browser form');
    await click('Save');
    await waitFor(async () => !!await record(), 'create persisted');
    const created = await record(); assert.equal(created.companyId, companyId);
    await context.snapshot();
    await waitFor(async () => await context.evaluate(`location.pathname===${JSON.stringify(list)}`), 'return to list');
    await clean();
    await assertSidebar();
    result.steps.push('created through browser form in the correct company'); context.save();
    await visit(list);
    await action('Edit');
    const edit = list + '/edit/' + created.id;
    await waitFor(async () => context.idle() && await context.evaluate(`location.pathname===${JSON.stringify(edit)}&&document.querySelector('input[type=text]')?.value===${JSON.stringify(name)}`), 'edit form loaded through row action');
    const description = model === 'category' ? '6205' : 'Edited and reloaded ' + name;
    const editedField = model === 'category' ? 'hsn' : 'description';
    await fill(model === 'category' ? '#hsn' : 'textarea', description);
    await click('Save ' + label);
    await waitFor(async () => (await record())?.[editedField] === description, 'edit persisted');
    await clean(); await context.snapshot();
    await visit(edit);
    assert.equal(await context.evaluate(`document.querySelector(${JSON.stringify(model === 'category' ? '#hsn' : 'textarea')})?.value`), description, 'Edited value survives full reload');
    result.steps.push('edited through row action and verified after reload'); context.save();
    await visit(list);
    await action('Delete');
    await waitFor(async () => context.evaluate(`!![...document.querySelectorAll('[role="dialog"]')].find(e=>e.textContent.includes(${JSON.stringify('Delete ' + label)}))`), 'delete confirmation');
    await click('Delete', '[role="dialog"] button');
    await waitFor(async () => !await record(), 'delete persisted');
    await clean();
    await assertSidebar();
    result.steps.push('deleted through confirmation and verified in database');
    result.status = 'passed';
  } catch (error: any) {
    result.status = 'failed'; result.error = error.message; process.exitCode = 1;
  } finally {
    result.errors = [...context.errors()]; result.hydrationWarnings = [...context.warnings()];
    context.save(); console.log(`${label} form ${company}: ${result.status}`);
  }
}
