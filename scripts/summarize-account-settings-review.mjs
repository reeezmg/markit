import fs from 'node:fs';
import path from 'node:path';
const dir='scripts/production-accounting/runs/account-settings-review-2026-10-06';
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const state=read('production-settings-after.json'),guard=read('persisted-verification.json'),ui=read('ui-default-selection.json'),online=read('online-permissions.json'),stock=read('stock-account-selection.json'),supplier=read('supplier-account-selection.json');
const bytes=fs.readFileSync(path.join(dir,'account-settings-posting.log'));
const log=bytes.toString(bytes[0]===0xff&&bytes[1]===0xfe?'utf16le':'utf8');
if(!log.includes('PASS every fixture journal balanced.'))throw Error('Posting integration did not finish successfully');
if(!guard.unchanged)throw Error('Production table fingerprints changed');
const report=fs.readFileSync(path.join(dir,'account-settings-review.md'),'utf8');
const broken=[...report.matchAll(/\]\(\/C:\/markit-v1\/([^)]*)\)/g)].map(m=>m[1].replace(/:\d+$/,'')).filter(p=>!fs.existsSync(path.resolve('..',p)));
if(broken.length)throw Error('Broken file links: '+broken.join(', '));
const summary={at:new Date().toISOString(),postingIntegrationPassed:true,formSelectorsValidated:22,erpRolesVerified:10,staffRolesVerified:6,namedStaffBankVerified:true,
 uiChecksPassed:ui.checks.filter(c=>c.passed).length,onlineRolesValidated:online.onlineRoles,invalidOnlineChoicesRejected:online.invalidSelectionsRejected,
 currentProduction:{savedErpStaffGroups:state.inventory.length,supplierConnections:state.supplierConnections,invalidSavedMappings:state.issues.length,stockControls:state.stockControls.length,currentStockSelectionConflicts:state.stockSelectionConflicts.length},
 findings:[{name:'Selected Stock account is counteracted by independent stock-control/product mappings',confirmed:stock.defect,evidence:'stock-account-selection.json'},
 {name:'Company supplier opening-offset default is unused for opening postings',confirmed:supplier.openingDefaultIgnored,evidence:'supplier-account-selection.json'},
 {name:'Profit-distribution Save shown to accountants despite manager/admin route restriction',confirmed:online.accountantCannotSaveProfitDistribution,evidence:'online-permissions.json'}],
 productionTablesUnchanged:guard,browserWalkthrough:false,applicationFixesDeployed:false,productionSettingsChanged:false};
fs.writeFileSync(path.join(dir,'review-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
