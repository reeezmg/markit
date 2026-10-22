import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { ref } from 'vue';

const handlers = [
  ['onNameUpdate', 'isUpdatingName'], ['onContactDetailsSave', 'isUpdatingContact'],
  ['onNotesUpdate', 'isUpdatingDescription'], ['onaccSubmit', 'isUpdatingAccount'], ['onaddSubmit', 'isUpdatingAddress'],
  ['onTaxIncludeChange'], ['onAiImageChange'], ['onUserTrackIncludeChange'], ['onCostIncludeChange'],
  ['onPointsValueChange', 'isUpdatingPointsValue'], ['ontimingChange', 'isUpdatingtiming'],
  ['onCategoryChange', 'isUpdatingCategory'],
  ['saveDeliveryConfig', 'isUpdatingDeliveryConfig'], ['onDeliveryTypeChange', 'isUpdatingDeliveryType'],
  ['onStoreIdentitySave', 'isUpdatingStoreIdentity'], ['onAllDeliverySave', 'isUpdatingAllDelivery'],
] as const;

function harness(name: string, profile = false, override?: string, extra: Record<string,any> = {}) {
  const path = override || (profile ? process.env.SETTINGS_PROFILE_SOURCE || 'pages/settings/index.vue'
    : process.env.SETTINGS_STORE_SOURCE || 'pages/settings/store.vue');
  const source = readFileSync(path, 'utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast = ts.createSourceFile('settings.ts', source, ts.ScriptTarget.Latest, true);
  const statement = ast.statements.find(node => name === 'companyInfoWatcher'
    ? ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'watch'
      && node.expression.arguments[1]?.getText(ast).includes('addstate.lat')
    : ts.isFunctionDeclaration(node) ? node.name?.text === name
    : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === name));
  assert.ok(statement, `Handler exists: ${name}`);
  const identifiers = new Set<string>(), functions = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) functions.add(node.expression.text);
    ts.forEachChild(node, visit);
  }; visit(statement); identifiers.delete(name);
  let resolve!: () => void, reject!: (error: Error) => void;
  const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  pending.catch(() => {});
  const writes: any[] = [], sessions: any[] = [], notices: any[] = [];
  const mutation = { mutate: (args: any) => { writes.push(args); }, mutateAsync: (args: any) => { writes.push(args); return pending; } };
  const context: any = { UpdateCompany: mutation, UpsertAddress: mutation, UpdateUser: mutation, UpdateCompanyUser: mutation,
    navigator: { onLine: true }, toast: { add: (value: any) => notices.push(value) }, console: { log() {}, error() {} },
    useAuth: () => ({ session: ref({ companyId: 'fixture-company', id: 'fixture-user' }) }),
    createError: (data: any) => Object.assign(new Error(data.statusMessage), data),
    selectedFile: ref(null), isImageChanged: ref(false), isUpdatingAccount: ref(false), state: { name: 'Fixture profile' },
    timing: { open: '09:00', close: '18:00' }, contactState: { email: 'fixture@example.invalid' },
    addstate: { street: 'Fixture', lat: 1, lng: 1 }, accstate: { accHolderName: 'Fixture' },
    ...extra,
  };
  for (const identifier of identifiers) if (!(identifier in context)) {
    context[identifier] = /^update[A-Z]/.test(identifier) ? async (...args: any[]) => { sessions.push({ name: identifier, args }); }
      : identifier.startsWith('normalize') ? () => 0
      : functions.has(identifier) && !(identifier in globalThis) ? async () => true
      : identifier in globalThis ? (globalThis as any)[identifier]
      : ref(identifier.startsWith('is') ? identifier.endsWith('Changed') : 'fixture-value');
  }
  const names = Object.keys(context);
  const declaration = name === 'companyInfoWatcher'
    ? 'const companyInfoWatcher = ' + (statement as ts.ExpressionStatement & { expression: ts.CallExpression }).expression.arguments[1].getText(ast) + ';'
    : statement.getText(ast);
  const js = ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = new Function(...names, js + ';return ' + name)(...names.map(key => context[key]));
  return { run, context, writes, sessions, notices, resolve, reject, pending };
}

for(const failed of [false,true])test(`product input settings: ${failed?'rejects without session changes':'single atomic save retains submitted toggles'}`,async t=>{
 const current=harness('onInputChange',false,'pages/settings/products.vue',{
  productInputs:[{key:'brand',value:false}],variantInputs:[{key:'qty',value:false}],
  savedBillingUnits:ref(['Nos','Kg']),savedSizeLabels:ref(['Size','Shade']),
  productDimensionFlag:ref(true),sizeDimensionFlag:ref(true),
 });t.after(current.resolve);
 const save=current.run();assert.equal(current.writes.length,1);assert.equal(current.notices.length,0);assert.equal(current.sessions.length,0);
 const data=current.writes[0].data;
 assert.deepEqual(data.productinput.upsert.create,{brand:false,dimension:true});
 assert.deepEqual(data.variantinput.upsert.create,{qty:false,unit:['Nos','Kg'],sizeLabels:['Size','Shade'],sizeDimension:true});
 current.context.productDimensionFlag.value=false;current.context.sizeDimensionFlag.value=false;
 current.run();assert.equal(current.writes.length,1);
 if(failed)current.reject(Object.assign(new Error('fixture rejection'),{statusMessage:'fixture rejection'}));else current.resolve();
 await save;assert.equal(current.context.isUpdatingInputs.value,false);assert.equal(current.notices.length,1);
 assert.equal(current.notices[0].color==='red',failed);assert.equal(current.sessions.length,failed?0:1);
 if(!failed){assert.equal(current.context.savedProductDimensionFlag.value,true);assert.equal(current.context.savedSizeDimensionFlag.value,true);}
});

test('account settings retry clears stale errors and merges only the edited mapping section',async()=>{
 const calls:any[]=[];const state={mappings:{cash:'edited-cash',bank:'stale-bank'}};
 const current=harness('saveMapping',false,'pages/settings/account.vue',{
  busy:ref(''),error:ref('Previous failure'),api:{companyId:ref('fixture-company')},state:()=>state,
  request:async(method:string,path:string,body:any)=>{calls.push({method,path,body});return{mappings:{cash:'saved-cash',bank:'latest-bank'},enabled:true};},
 });
 await current.run({key:'billing',title:'Billing',owner:'erp',fields:{cash:['Cash','CASH']}});
 assert.equal(current.context.error.value,'');assert.equal(current.context.busy.value,'');
 assert.deepEqual(calls.find(call=>call.method==='PUT').body.mappings,{cash:'edited-cash',bank:'latest-bank'});
 assert.equal(current.notices.length,1);
});

for (const [page, name, loading] of [
  ['numbering', 'onPrefixSave', 'isUpdatingPrefixes'],
] as const) for (const failed of [false,true]) test(`${page}: ${failed?'rejected':'delayed'} persistence controls loading/session/success`,async t=>{
  const current=harness(name,false,`pages/settings/${page}.vue`);t.after(current.resolve);
  const save=Promise.resolve(current.run());
  assert.equal(current.writes.length,1);
  assert.equal(current.notices.length,0,'No success before persistence');
  assert.equal(current.sessions.length,0,'No session change before persistence');
  assert.equal(current.context[loading].value,true);
  current.run();assert.equal(current.writes.length,1,'Duplicate clicks cannot start another save');
  if(failed)current.reject(Object.assign(new Error('fixture rejection'),{statusMessage:'fixture rejection'}));else current.resolve();
  await save;
  assert.equal(current.context[loading].value,false);
  assert.equal(current.sessions.length,failed?0:1);
  assert.equal(current.notices.length,1);
  assert.equal(current.notices[0].color==='red',failed);
});

for (const [name, loading] of handlers) for (const fails of [false, true])
  test(`${name}: ${fails ? 'failed request retains errors' : 'successful request waits for persistence'}`, async t => {
    const current = harness(name); t.after(current.resolve);
    const result = Promise.resolve(current.run({}));
    assert.equal(current.writes.length, 1, 'The actual handler starts its database mutation');
    assert.equal(current.notices.length, 0, 'No success toast before the database response');
    assert.equal(current.sessions.length, 0, 'No session change before the database response');
    if (loading) assert.equal(current.context[loading].value, true, 'Loading remains active while saving');
    if (fails) current.reject(Object.assign(new Error('Expected fixture save failure'), { statusMessage: 'Expected fixture save failure' }));
    else current.resolve();
    await result;
    if (loading) assert.equal(current.context[loading].value, false);
    assert.ok(current.notices.length > 0);
    if (fails) {
      assert.equal(current.sessions.length, 0, 'Failed persistence cannot update the session');
      assert.ok(current.notices.every(n => n.color === 'red'), 'A failure cannot also show success');
    } else assert.ok(current.notices.some(n => n.color !== 'red'));
  });

test('profile save keeps loading while persistence is pending and shows only an error on failure', async t => {
  const current = harness('onProfileUpdate', true); t.after(current.resolve);
  const result = current.run();
  assert.equal(current.context.isUpdatingProfile.value, true);
  current.reject(new Error('Expected profile failure')); await result;
  assert.equal(current.context.isUpdatingProfile.value, false);
  assert.ok(current.notices.length > 0);
  assert.ok(current.notices.every(n => n.color === 'red'));
});

for (const profile of [false, true]) test(`${profile ? 'avatar' : 'logo'} upload failure cannot persist a broken image key`, async t => {
  const current = harness(profile ? 'onProfileUpdate' : 'onLogoUpdate', profile); t.after(current.resolve);
  current.context.selectedFile.value = { file: { fixture: true }, uuid: 'fixture-image-key' };
  current.context.awsService[profile ? 'uploadBase64File' : 'uploadBase64Object'] = () => current.pending;
  const result = current.run();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(current.writes.length, 0, 'Upload must finish before saving its image key');
  current.reject(new Error('Expected upload failure')); await result;
  assert.equal(current.writes.length, 0);
  assert.ok(current.notices.every(n => n.color === 'red'));
});

for (const [name, flag, session] of [
  ['onStoreIdentitySave', 'isNameChanged', 'updateStoreUniqueName'],
  ['onContactDetailsSave', 'isPhoneChanged', 'updateStorePhone'],
  ['onAllDeliverySave', 'isDeliveryTypeChanged', 'updateDeliveryType'],
  ['onAllDeliverySave', 'isDeliveryConfigChanged', 'updateDeliveryConfig'],
] as const) test(`${name}: a query refresh cannot skip the saved session fields`, async t => {
  const current = harness(name); t.after(current.resolve);
  const result = current.run({});
  // Model invalidation can refresh CompanyInfo before mutateAsync resolves.
  current.context[flag].value = false;
  current.resolve(); await result;
  assert.ok(current.sessions.some(s => s.name === session), 'Update the session from the submitted fields even after query refresh clears dirty flags');
});

test('delivery configuration does not leave the unrelated bank-details form loading', async t => {
  const current = harness('saveDeliveryConfig'); t.after(current.resolve);
  const result = current.run(); current.resolve(); await result;
  assert.equal(current.context.isUpdatingAccount.value, false);
});

test('store address reload preserves zero coordinates', () => {
  const current = harness('companyInfoWatcher');
  current.run({ address: { lat: 0, lng: 0 } });
  assert.equal(current.context.addstate.lat, 0); assert.equal(current.context.addstate.lng, 0);
  current.run({ address: {} });
  assert.equal(current.context.addstate.lat, null); assert.equal(current.context.addstate.lng, null);
});
