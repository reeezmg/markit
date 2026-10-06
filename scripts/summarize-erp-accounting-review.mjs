import fs from 'node:fs';
import path from 'node:path';
const dir='scripts/production-accounting/runs/workflow-review-2026-10-06';
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const raw=read('test-results.json'),persisted=read('persisted-verification.json');
const unavailable=new Map([
 ['tests/erp-company-pages.test.ts','Stale hard-coded company fixtures; commits test data. This run fixtures were restored and this suite is excluded from the safe runner.'],
 ['tests/products-distributor-company-pages.test.ts','Stale hard-coded company fixtures; commits test data. This run fixtures were restored and this suite is excluded from the safe runner.'],
 ['tests/users-clients-company-pages.test.ts','Stale hard-coded company fixtures and failed nontransactional cleanup. Exact fixtures restored; excluded from safe runner.'],
 ['tests/ecomm-order-cancel.test.ts','No cancellable source order with items. Isolated ecommerce integration supplies separate cancellation coverage.'],
]);
const reruns=new Map([
 ['tests/accountant-v2-pages.test.ts',{code:0,reason:'Corrected generic-management page harness to exclude the dedicated Ecommerce route; rerun passed.'}],
 ['tests/account-ledger-writeflow.test.ts',{code:0,reason:'Original cold helper test exposed F15 and its waiting DDL was cancelled. Setup-before-transaction rerun passed.',log:'account-ledger-writeflow-rerun.log'}],
]);
const rerunBytes=fs.readFileSync(path.join(dir,'account-ledger-writeflow-rerun.log'));
const rerunText=rerunBytes.toString(rerunBytes[0]===0xff&&rerunBytes[1]===0xfe?'utf16le':'utf8');
if(!rerunText.includes('Account ledger writeflow test passed.'))throw Error('Warm ledger rerun did not pass');
const interpreted=raw.map(r=>({...r,
 isolation:r.file.includes('company-pages')?'committing fixtures; unsuitable':/ecomm-order-(create|cancel)\.test/.test(r.file)?'outer rollback':r.isolation,
 originalCode:r.code,status:unavailable.has(r.file)?'unavailable':(reruns.get(r.file)?.code??r.code)===0?'passed':'failed',explanation:unavailable.get(r.file)||reruns.get(r.file)?.reason,rerun:reruns.get(r.file)}));
const findings=[...read('sidebar-route-probes.json').findings,...read('billing-ui-probes.json').findings,...read('statement-route-probes.json').findings,
 {name:'Cold legacy-ledger schema setup waits on the caller transaction',defect:true,evidence:'cold-ledger-schema-lock.json'}];
const report=fs.readFileSync(path.join(dir,'workflow-review.md'),'utf8');
const broken=[...report.matchAll(/\]\(\/C:\/markit-v1\/([^)]*)\)/g)].map(m=>m[1].replace(/:\d+$/,'')).filter(p=>!fs.existsSync(path.resolve('..',p)));
if(broken.length)throw Error('Broken source links: '+broken.join(', '));
const output={at:new Date().toISOString(),scope:'Current local ERP sidebar source workflows and installed accounting functions; related storefront order and statement write paths included.',
 findingsConfirmed:findings.filter(f=>f.defect).length,
 suites:{attempted:raw.length,passed:interpreted.filter(r=>r.status==='passed').length,unavailable:interpreted.filter(r=>r.status==='unavailable').length,failed:interpreted.filter(r=>r.status==='failed').length},
 persistedVerification:persisted,
 fixtureRestoration:read('fixture-restoration-verification.json'),
 checks:{reportTypecheck:'passed',accountantTypecheck:'failed: four errors',recurringTypecheck:'failed: broad Nuxt declaration graph errors',browserWalkthrough:'not performed',applicationFixesDeployed:false},
 testResults:interpreted,findings};
fs.writeFileSync(path.join(dir,'review-summary.json'),JSON.stringify(output,null,2));
const table=['# Suite results','',`Interpreted: ${output.suites.passed} passed, ${output.suites.unavailable} unavailable/unsuitable, ${output.suites.failed} remaining failed suites. Original and rerun results are preserved separately.`,
 '', '| Suite | Isolation | Result | Explanation |','|---|---|---|---|',...interpreted.map(r=>`| ${r.file} | ${r.isolation} | ${r.status} | ${r.explanation||'See '+r.log} |`)];
fs.writeFileSync(path.join(dir,'test-matrix.md'),table.join('\n')+'\n');
console.log(JSON.stringify({findings:output.findingsConfirmed,suites:output.suites,persistedVerification:persisted,brokenSourceLinks:broken.length},null,2));
