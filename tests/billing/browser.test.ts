import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket from 'ws'
import { parse } from '@vue/compiler-sfc'
import { baseParse, compile } from '@vue/compiler-dom'
import { build } from 'esbuild'
import { billing, edit, read, root } from './harness'

// Mount the real summary template in Chrome with native stand-ins for Nuxt UI.
// This verifies template bindings and CSS geometry, not Nuxt UI internals or login.
function summary(file: string) {
  const template = parse(read(file)).descriptor.template!.content
  const tree = baseParse(template)
  let found: any
  function visit(node: any) {
    if (node.type === 1 && node.props.some((p: any) => p.name === 'class' && p.value?.content.split(/\s+/).includes('billing-summary'))) found = node
    if (!found) for (const child of node.children || []) visit(child)
  }
  visit(tree); assert.ok(found, 'Desktop summary must exist')
  return compile(found.loc.source, { mode: 'function' }).code
}

test('Chrome: billing/edit footer actions, labels, alignment and scroll boundaries', { timeout: 90000 }, async t => {
  const chrome = process.env.BILLING_TEST_CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  assert.ok(chrome, 'Install Chrome/Edge or set BILLING_TEST_CHROME to its executable')
  const entry = `
    import * as Vue from 'vue';
    const render = new Function('Vue', ${JSON.stringify('RENDER_CODE')})(Vue);
    const clicked=[];
    const state=Vue.reactive({isMobile:false,subtotal:100,grandTotal:90,discount:10,returnAmt:0,redeemedAmt:0,couponValue:0,paymentMethod:'Cash',paymentOptions:['Cash','UPI','Card','Credit'],selected:null,accounts:[],selectedCouponId:null,couponModel:null,eligibleCoupons:[],phoneNo:'',clientName:'',points:0,isClientLoading:false,isClientLookupLoading:false,showClientSuggestions:false,clientMatches:[],isRedeemPoint:false,redeeming:false,skipPoints:false,isSaving:false,selectedAction:null,actionItems:[],canCreateDraft:true,bill:{isMarkit:false},isOpen:false,issalesReturnModelOpen:false,isProductSearchOpen:false,isClientAddModelOpen:false,isBillDeleteModalOpen:false});
    state.isSavingAcc=false;state.accountLoaded=false;state.clientFound=false;state.couponFound=false;
    const noop=()=>{};
    for(const name of ['handleSave','handleEdit','handleSplit','handleCreateNewDraft','newBill','handleRedeemPoints','handleEnterMainDiscount','handleEnterPayment','openClientSuggestions','handleClientSearchEnter','handleClientSuggestionSelect','handleClearClient','formatCreditPartyOption']) state[name]=()=>{clicked.push(name);if(name==='handleClearClient')state.phoneNo=''};
    const app=Vue.createApp({render,setup:()=>state});
    app.component('UButton',{inheritAttrs:false,props:['icon','disabled','loading','color','variant','square','block'],setup(p,{attrs,slots}){return()=>Vue.h('button',{...attrs,disabled:p.disabled,'data-icon':p.icon||'','data-color':p.color||'primary','data-variant':p.variant||'solid',style:{display:'inline-flex',alignItems:'center',justifyContent:'center',height:'32px',flexShrink:0}},[p.icon?Vue.h('span',{'data-icon-shape':p.icon,style:{width:'20px',height:'20px',display:'inline-block'}}):null,slots.default?.()])}});
    app.component('UInput',{inheritAttrs:false,props:['modelValue','value','type','disabled','icon','loading'],emits:['update:modelValue'],setup(p,{attrs,emit}){return()=>Vue.h('div',{class:'input-wrap'},[Vue.h('input',{...attrs,type:p.type||'text',value:p.modelValue??p.value??'',disabled:p.disabled,onInput:e=>emit('update:modelValue',e.target.value)})])}});
    for(const name of ['USelect','UInputMenu','USelectMenu'])app.component(name,{inheritAttrs:false,props:['modelValue','options','placeholder','disabled'],setup(p,{attrs}){return()=>Vue.h('div',{...attrs,class:[attrs.class,'select-wrap']},[Vue.h('button',{'aria-haspopup':'listbox',disabled:p.disabled},String(p.modelValue?.label||p.modelValue||p.placeholder||''))])}});
    app.component('UDropdown',{setup(p,{slots}){return()=>Vue.h('div',slots.default?.())}});
    app.component('UBadge',{setup(p,{slots}){return()=>Vue.h('span',slots.default?.())}});
    app.mount('#summary');
    const rows=Number(new URLSearchParams(location.search).get('rows')||1);
    document.querySelector('tbody').innerHTML=Array.from({length:rows},(_,i)=>'<tr><td>Item '+(i+1)+'</td></tr>').join('');
    const measure=()=>{const card=document.querySelector('.billing-card'),header=document.querySelector('thead'),row=document.querySelector('tbody tr'),footer=document.querySelector('footer');const min=header.getBoundingClientRect().height+row.getBoundingClientRect().height+25;card.style.setProperty('--billing-table-min-height',min+'px');card.style.setProperty('--billing-card-min-height',(min+footer.getBoundingClientRect().height+52)+'px')};
    measure();new ResizeObserver(measure).observe(document.querySelector('footer'));
    window.__state=state;window.__clicked=clicked;window.__ready=true;
  `
  const css = read('assets/css/billing-layout.css') + `
    *{box-sizing:border-box}body{margin:0;font-family:Arial}button,input{font:12px/20px Arial;border:1px solid #ddd;border-radius:5px;padding:5px 8px;min-width:0}button{cursor:pointer;background:#ff730d;color:white}input{height:32px;width:100%;background:white}.input-wrap,.select-wrap{min-width:0;width:100%}.select-wrap>button{width:100%;background:white;color:#334155;text-align:left}.billing-page{height:100vh;display:flex;flex-direction:column;overflow:auto;padding:4px}.billing-card{border:1px solid #ddd}header{height:50px;padding:14px}footer{border-top:1px solid #ddd}.billing-table-scroll{padding:12px}table{width:100%;border-collapse:collapse}thead{height:30px}tbody tr{height:40px}.billing-summary{display:grid}.flex{display:flex}.flex-1{flex:1;min-width:0}.flex-row{flex-direction:row}.flex-col{flex-direction:column}.gap-2{gap:8px}.block{display:block}.w-full{width:100%}.relative{position:relative}.items-center{align-items:center}.justify-center{justify-content:center}.font-bold{font-weight:bold}.px-3{padding-left:12px;padding-right:12px}.billing-summary-total{border:1px solid #ddd;border-radius:5px}.billing-summary-actions>button,.billing-search-actions>button{flex:1;min-width:0}
  `
  const bundles: Record<string, string> = {}
  for (const [name, file] of [['billing', billing], ['edit', edit]]) {
    const result = await build({ stdin: { contents: entry.replace(JSON.stringify('RENDER_CODE'), JSON.stringify(summary(file))), resolveDir: root, sourcefile: 'billing-browser-fixture.js' }, bundle: true, write: false, platform: 'browser', format: 'iife' })
    bundles[name] = result.outputFiles[0].text
  }
  const server = createServer((req, res) => {
    const page = req.url?.startsWith('/edit') ? 'edit' : 'billing'
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><meta charset="utf-8"><style>${css}</style><div class="billing-page"><div class="billing-card"><header>ERP</header><div class="billing-card-body"><div class="billing-table-scroll"><table><thead><tr><th>Items</th></tr></thead><tbody></tbody></table></div></div><footer><div id="summary"></div></footer></div></div><script>${bundles[page].replace(/<\/script/gi, '<\\/script')}</script>`)
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close())
  const address = server.address() as any, profile = mkdtempSync(join(tmpdir(), 'billing-browser-'))
  const child = spawn(chrome, ['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=0','--remote-allow-origins=*',`--user-data-dir=${profile}`,'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  t.after(async () => { child.kill(); if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))]); rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) })
  const endpoint = await new Promise<string>((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(new Error('Chrome debugging endpoint timed out')), 15000)
    child.on('error', reject); child.stderr!.on('data', data => { output += data; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]) } })
  })
  const ws = new WebSocket(endpoint); await once(ws, 'open'); t.after(() => ws.close())
  let sequence = 0; const pending = new Map<number, any>(), browserErrors: any[] = []
  ws.on('message', data => { const message = JSON.parse(String(data)); if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails); if (message.id) { const p = pending.get(message.id); pending.delete(message.id); if (p) { clearTimeout(p.timer); message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result) } } })
  function command(method: string, params = {}, sessionId?: string): Promise<any> { return new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: '+method)) }, 10000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })) }) }
  const target = await command('Target.createTarget', { url: 'about:blank' }), attached = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }), session = attached.sessionId
  await command('Runtime.enable', {}, session)
  const evaluate = async (expression: string) => { const r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value }
  for (const page of ['billing', 'edit']) for (const [width, height, rows] of [[1280,720,1],[1024,600,25],[1280,280,1]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, session)
    await command('Page.navigate', { url: `http://127.0.0.1:${address.port}/${page}?rows=${rows}` }, session)
    for (let i=0;i<100;i++) { if (await evaluate('window.__ready === true')) break; await new Promise(resolve => setTimeout(resolve, 50)) }
    assert.equal(await evaluate('window.__ready'), true, JSON.stringify(browserErrors))
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    const metrics = await evaluate(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};const panel=document.querySelector('.billing-page'),table=document.querySelector('.billing-table-scroll'),summary=document.querySelector('.billing-summary'),phone=document.querySelector('.billing-client-input-row');return {columns:getComputedStyle(summary).gridTemplateColumns.split(' ').length,panelScroll:panel.scrollHeight>panel.clientHeight+1,tableScroll:table.scrollHeight>table.clientHeight+1,phone:[...phone.children].map(rect),font:[...summary.querySelectorAll('label,input,[aria-haspopup]')].map(e=>getComputedStyle(e).fontSize),totals:[...summary.querySelectorAll('.billing-summary-total>div')].map(e=>[...e.children].map(rect)),labels:[...summary.querySelectorAll('label')].map(e=>e.textContent.trim()),buttons:[...summary.querySelectorAll('.billing-search-actions button')].map(e=>({text:e.textContent.trim(),icon:e.dataset.icon})),min:parseFloat(getComputedStyle(document.querySelector('.billing-card')).getPropertyValue('--billing-card-min-height'))}})()`)
    assert.equal(metrics.columns, 5); assert.equal(metrics.panelScroll, metrics.min + 8 > height, `${page} ${width}x${height}`)
    if (rows === 25) assert.equal(metrics.tableScroll, true)
    assert.ok(metrics.phone.every((r: any) => Math.abs(r.y - metrics.phone[0].y) < 1)); assert.equal(metrics.phone.length, page === 'edit' ? 3 : 2)
    assert.ok(metrics.font.every((size: string) => size === '12px')); assert.ok(metrics.labels.every((text: string) => !/\s/.test(text)))
    assert.ok(metrics.totals.every(([label, value]: any[]) => value.y >= label.bottom - 1)); assert.deepEqual(metrics.buttons, [{ text: 'New', icon: '' }, { text: 'Search', icon: '' }])
    await evaluate(`(()=>{document.querySelector('[aria-label="Add client"]').click();document.querySelector('[aria-label="Product search"]').click();document.querySelector('[aria-label="Sales Return"]').click()})()`)
    assert.deepEqual(await evaluate('[__state.isClientAddModelOpen,__state.isProductSearchOpen,__state.issalesReturnModelOpen]'), [true,true,true])
    await evaluate(`(()=>{document.querySelector('[aria-label="New bill"]').click();[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save').click()})()`)
    assert.deepEqual(await evaluate('__clicked.slice(-2)'), page === 'billing' ? ['handleCreateNewDraft','handleSave'] : ['newBill','handleEdit'])
    if (page==='edit') {
      await evaluate('__state.bill.isMarkit=true')
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
      assert.deepEqual(await evaluate('[...document.querySelectorAll("[aria-label=\\"New bill\\"],[aria-label=\\"Product search\\"],[aria-label=\\"Add client\\"]")].map(b=>b.disabled)'), [true,true,true])
      await evaluate('__state.bill.isMarkit=false')
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
    }
    if (width===1280 && height===720) {
      mkdirSync(root+'tests/billing/reports', { recursive: true })
      const screenshot = await command('Page.captureScreenshot', { format: 'png' }, session)
      writeFileSync(root+`tests/billing/reports/${page}-footer.png`, Buffer.from(screenshot.data, 'base64'))
    }
  }
})
