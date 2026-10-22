import assert from 'node:assert/strict';

export async function testSettingsFailure(context: {
  company: string; report: any; save(): void; visit(route: string): Promise<void>;
  evaluate(expression: string): Promise<any>; errors(): any[]; idle(): boolean; assertRunning(): void; timeout: number;
  targetCompanyId?: string; loggedCompanyId?: string;
  mutation?(): { path: string; companyId?: string } | undefined;
}) {
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (condition: () => Promise<any>, label: string) => {
    const end = Date.now() + context.timeout;
    while (Date.now() < end) { context.assertRunning(); if (await condition()) return; await pause(200); }
    throw Error('Settings failure test timed out: ' + label);
  };
  const sessionHash = () => context.evaluate(`(async()=>{const r=await fetch('/api/auth/session');if(!r.ok)throw Error('Session read failed');
    const s=await r.json();const value=JSON.stringify({companyId:s.companyId,storeUniqueName:s.storeUniqueName,name:s.name,image:s.image,logo:s.logo,
      billPrefix:s.billPrefix,expensePrefix:s.expensePrefix,printerLabelSize:s.printerLabelSize,productInputs:s.productInputs,variantInputs:s.variantInputs});
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).join(',')})()`);
  if (context.targetCompanyId) {
    const result: any = { company: context.company, action: 'select branch in settings and retain it across tabs', status: 'running' };
    context.report.settingsSelections ||= []; context.report.settingsSelections.push(result); context.save();
    try {
      await context.visit('/settings/numbering');
      const before = await sessionHash();
      assert.ok(await context.evaluate(`(()=>{const e=[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value===${JSON.stringify(context.targetCompanyId)}));if(!e)return false;e.value=${JSON.stringify(context.targetCompanyId)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`));
      await wait(() => context.evaluate(`new URLSearchParams(location.search).get('entryCompany')===${JSON.stringify(context.targetCompanyId)}&&!!document.querySelector('input[type=text]')`), 'selected branch numbering');
      await wait(async () => context.idle(), 'branch settings loaded');
      assert.equal(await sessionHash(), before);
      const prefix = await context.evaluate(`(async()=>{const r=await fetch('/api/organization/context?companyId='+${JSON.stringify(context.targetCompanyId)});if(!r.ok)throw Error('Context rejected');const c=await r.json();return c.billPrefix||''})()`);
      assert.equal(await context.evaluate(`document.querySelector('input[type=text]').value`), prefix, 'Numbering form shows the selected branch value');
      assert.ok(await context.evaluate(`(()=>{const a=[...document.querySelectorAll('a')].find(a=>{const u=new URL(a.href);return u.pathname==='/settings/products'&&u.searchParams.get('entryCompany')===${JSON.stringify(context.targetCompanyId)}});if(!a)return false;a.click();return true})()`));
      await wait(() => context.evaluate(`location.pathname==='/settings/products'&&new URLSearchParams(location.search).get('entryCompany')===${JSON.stringify(context.targetCompanyId)}`), 'branch retained across settings tabs');
      await wait(async () => context.idle(), 'product settings loaded');
      assert.equal(await sessionHash(), before);
      result.status = 'passed'; result.sessionUnchanged = true; result.branchValuesLoaded = true; result.tabSelectionRetained = true;
    } catch (error: any) { result.status = 'failed'; result.error = error.message; throw error; }
    finally { context.save(); }
  }
  const cases: any[] = [
    { form: 'store-identity-rejected-save', route: '/settings/store', label: 'Save Store Identity',
      selector: `(()=>[...document.querySelectorAll('input[type=text]')].find(e=>e.getClientRects().length&&e.closest('div.rounded-xl')?.textContent.includes('markit.com/store/')))()`,
      value: 'branch_e2e_blocked_save', error: 'Error updating store identity', success: 'Store identity updated', path: '/api/model/company/update' },
    { form: 'profile-rejected-save', route: '/settings', label: 'Update Profile',
      selector: `(()=>[...document.querySelectorAll('input')].find(e=>e.getClientRects().length&&e.type==='text'))()`,
      value: 'BRANCH_E2E_BLOCKED_PROFILE', error: 'Error updating profile', success: 'Profile updated successfully', path: '/api/model/user/update' },
    {form:'numbering-rejected-save',route:'/settings/numbering',label:'Save Prefixes',selector:`document.querySelector('input[type=text]')`,value:'E2E_PREFIX',error:'Error updating prefixes',success:'Prefixes updated',path:'/api/model/company/update'},
    {form:'product-inputs-rejected-save',route:'/settings/products',label:'Save Inputs',edit:`(()=>{const e=[...document.querySelectorAll('input[type=checkbox]')].find(e=>e.getClientRects().length);if(!e)return false;e.click();return true})()`,error:'Error updating Product and Variant inputs',success:'Product and Variant inputs updated',path:'/api/model/company/update'},
    {form:'requests-rejected-save',route:'/settings/requests',label:'Save settings',edit:`(()=>{const e=[...document.querySelectorAll('[role=switch],input[type=checkbox]')].find(e=>e.getClientRects().length);if(!e)return false;e.click();return true})()`,error:'Could not save request settings',success:'Request settings saved',path:'/api/model/generalPreference/upsert'},
    {form:'printer-label-rejected-save',route:'/settings/printer',label:'Save Printer Label Size',menu:true,error:'Error updating printer label size',success:'Printer label size updated',path:'/api/model/company/update'},
    {form:'account-mapping-rejected-save',route:'/settings/account',label:'Save billing & sales',edit:'true',error:'This action is blocked by the read-only page audit',success:'Billing & sales account settings saved',path:'/api/accountant/erp'},
  ];
  context.report.settingsFailureForms ||= [];
  for (const entry of cases) {
    const result: any = { company: context.company, form: entry.form, status: 'running', expectedMutationBlock: entry.path };
    context.report.settingsFailureForms.push(result); context.save();
    try {
      await context.visit(entry.route + (context.targetCompanyId ? '?entryCompany=' + encodeURIComponent(context.targetCompanyId) : ''));
      const page = context.report.pages.at(-1);
      assert.equal(page.hydrationWarnings?.length || 0, 0);
      assert.ok(page.mounted && !page.loadingQueries && !page.failedQueries && !page.loadingAsyncData && !page.failedAsyncData);
      const knownMap = (error: any) => ['maps-billing-required', 'BillingNotEnabledMapError'].includes(error.category);
      assert.ok(page.errors.every(knownMap), 'Only the already-known Maps billing error may remain on the store page');
      result.externalMapErrors = page.errors.filter(knownMap);
      const before = await sessionHash();
      if (context.targetCompanyId) {
        assert.equal(await context.evaluate(`document.querySelector('select')?.value`), context.targetCompanyId);
        assert.equal(await context.evaluate(`(async()=>{const r=await fetch('/api/auth/session');return (await r.json()).companyId})()`), context.loggedCompanyId);
        result.scope = 'branch-managed-with-head-office-session';
        const destination = entry.form === 'store-identity-rejected-save' ? '/accountant/opening-balances'
          : entry.form === 'account-mapping-rejected-save' ? '/accountant/chart-of-accounts'
          : entry.form === 'profile-rejected-save' ? '/saleshistory' : null;
        if (destination) {
          assert.ok(await context.evaluate(`[...document.querySelectorAll('a')].some(a=>{const u=new URL(a.href);return u.pathname===${JSON.stringify(destination)}&&u.searchParams.get('entryCompany')===${JSON.stringify(context.targetCompanyId)}})`), 'Related accounting/history links retain the branch');
          result.relatedLinkRetainsBranch = true;
        }
      }
      if (entry.menu) {
        const previous = await context.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>['50x25mm','50x38 mm','Select Printer Label Size'].includes(e.textContent.trim()));if(!b)throw Error('Printer size menu missing');const value=b.textContent.trim();b.click();return value})()`);
        const next = previous === '50x25mm' ? '50x38 mm' : '50x25mm';
        await wait(async () => context.evaluate(`[...document.querySelectorAll('[role=option]')].some(e=>e.getClientRects().length&&e.textContent.includes(${JSON.stringify(next)}))`), 'printer menu options');
        assert.ok(await context.evaluate(`(()=>{const e=[...document.querySelectorAll('[role=option]')].find(e=>e.getClientRects().length&&e.textContent.includes(${JSON.stringify(next)}));if(!e)return false;e.click();return true})()`));
      } else
      assert.ok(await context.evaluate(entry.edit || `(()=>{const e=${entry.selector};if(!e)return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(entry.value)});
        e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`));
      await wait(async () => context.evaluate(`!![...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(entry.label)}&&!e.disabled)`), 'save enabled');
      const errorOffset = context.errors().length;
      assert.ok(await context.evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(entry.label)});if(!e)return false;e.click();return true})()`));
      await wait(async () => context.errors().slice(errorOffset).some(e => e.kind === 'audit-blocked' && e.status === 409 && e.path === entry.path), 'real mutation request rejected by the read-only server');
      if (context.targetCompanyId && entry.form !== 'profile-rejected-save') {
        const mutation = context.mutation?.();
        assert.equal(mutation?.path, entry.path);
        assert.equal(mutation?.companyId, context.targetCompanyId, 'Actual save request targets the selected branch');
        result.branchMutationVerified = true;
      }
      await wait(async () => context.idle() && await context.evaluate(`document.body.innerText.includes(${JSON.stringify(entry.error)})`), 'error feedback rendered');
      assert.equal(await context.evaluate(`document.body.innerText.includes(${JSON.stringify(entry.success)})`), false, 'A failed save must not display success');
      assert.ok(await context.evaluate(`!![...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(entry.label)}&&!e.disabled)`), 'Save is available again after failure');
      assert.equal(await sessionHash(), before, 'Rejected persistence leaves the auth snapshot unchanged');
      const added = context.errors().slice(errorOffset);
      assert.ok(added.every(e => knownMap(e) || e.kind === 'audit-blocked' && e.status === 409 && e.path === entry.path), 'No unrelated API or JavaScript errors');
      result.observedErrors = added; result.status = 'passed';
      result.checks = ['native-http-409', 'error-without-success', 'loading-released', 'session-unchanged'];
    } catch (error: any) { result.status = 'failed'; result.error = error.message; result.errorStack = error.stack; process.exitCode = 1; }
    context.save(); console.log(`Settings failure form ${context.company} ${entry.form}: ${result.status}`);
  }
}
