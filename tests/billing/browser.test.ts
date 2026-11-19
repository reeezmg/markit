import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, realpathSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute, basename, dirname } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket from 'ws'
import { parse, compileScript } from '@vue/compiler-sfc'
import { baseParse, compile } from '@vue/compiler-dom'
import { build } from 'esbuild'
import { billing, edit, read, root } from './harness'

// Mount the real footer templates and payment terms control with native Nuxt UI stand-ins.
// This verifies template bindings and CSS geometry, not Nuxt UI internals or login.
function summary(file: string) {
  const template = parse(read(file)).descriptor.template!.content
  const tree = baseParse(template)
  const found = new Map<string, any>()
  function visit(node: any) {
    if (node.type === 1) for (const name of ['billing-footer-bar', 'billing-summary']) {
      if (node.props.some((p: any) => p.name === 'class' && p.value?.content.split(/\s+/).includes(name))) found.set(name, node)
    }
    for (const child of node.children || []) visit(child)
  }
  visit(tree); assert.ok(found.has('billing-summary'), 'Desktop summary must exist')
  return compile([...found.values()].map(node => node.loc.source).join('\n'), { mode: 'function' }).code
}

test('Chrome: billing/edit footer actions, labels, alignment and scroll boundaries', { timeout: 90000 }, async t => {
  const chrome = process.env.BILLING_TEST_CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
  assert.ok(chrome, 'Install Chrome/Edge or set BILLING_TEST_CHROME to its executable')
  const entry = `
    import * as Vue from 'vue';
    import { billSaveActionIcon } from './utils/bill-save-action-icon';
    import BillingPaymentTerms from './components/Billing/PaymentTerms.vue';
    import BillingDiscountAdjustment from './components/Billing/DiscountAdjustment.vue';
    function useCompanyScope(){return {fetch:async(url,options)=>{if(options?.method==='POST'){const term={id:'saved-21',kind:'days',...options.body};return {term,terms:[term]}}return {terms:[],canCreate:true}}}}
    Object.assign(globalThis,{useCompanyScope});
    const render = new Function('Vue', ${JSON.stringify('RENDER_CODE')})(Vue);
    const clicked=[];
    const state=Vue.reactive({isMobile:false,subtotal:100,grandTotal:90,discount:10,returnAmt:0,redeemedAmt:0,couponValue:0,paymentMethod:'Cash',paymentOptions:['Cash','UPI','Card','Credit'],selected:null,accounts:[],selectedCouponId:null,couponModel:null,eligibleCoupons:[],phoneNo:'',clientName:'',points:0,isClientLoading:false,isClientLookupLoading:false,showClientSuggestions:false,clientMatches:[],isRedeemPoint:false,redeeming:false,skipPoints:false,isSaving:false,selectedAction:null,actionItems:[],canCreateDraft:true,bill:{isMarkit:false},isOpen:false,issalesReturnModelOpen:false,isProductSearchOpen:false,isClientAddModelOpen:false,isBillDeleteModalOpen:false});
    state.billSaveActionIcon=billSaveActionIcon;state.isInvoiceMode=false;state.tQty=1;state.adjustment=0;
    state.invoicePaymentTerms='Due on receipt';state.invoiceReference='';
    state.dateInput='2026-10-29';state.dueDate='2026-10-29';
    state.invoiceTerms='Due on receipt';state.invoiceDueDate='2026-10-29';
    state.isSavingAcc=false;state.accountLoaded=false;state.clientFound=false;state.couponFound=false;
    const noop=()=>{};
    for(const name of ['handleSave','handleEdit','handleSplit','handleCreateNewDraft','newBill','handleRedeemPoints','handleEnterMainDiscount','handleEnterPayment','openClientSuggestions','handleClientSearchEnter','handleClientSuggestionSelect','handleClearClient','formatCreditPartyOption']) state[name]=()=>{clicked.push(name);if(name==='handleClearClient')state.phoneNo=''};
    const app=Vue.createApp({render,setup:()=>state});
    app.component('UButton',{inheritAttrs:false,props:['icon','label','disabled','loading','color','variant','square','block'],setup(p,{attrs,slots}){return()=>Vue.h('button',{...attrs,disabled:p.disabled,'data-icon':p.icon||'','data-color':p.color||'primary','data-variant':p.variant||'solid',style:{display:'inline-flex',alignItems:'center',justifyContent:'center',height:'32px',flexShrink:0}},[p.icon?Vue.h('span',{'data-icon-shape':p.icon,style:{width:'20px',height:'20px',display:'inline-block'}}):null,slots.default?.()||p.label])}});
    app.component('UInput',{inheritAttrs:false,props:['modelValue','value','type','disabled','icon','loading'],emits:['update:modelValue'],setup(p,{attrs,emit}){return()=>Vue.h('div',{class:'input-wrap'},[Vue.h('input',{...attrs,type:p.type||'text',value:p.modelValue??p.value??'',disabled:p.disabled,onInput:e=>emit('update:modelValue',e.target.value)})])}});
    for(const name of ['USelect','UInputMenu','USelectMenu'])app.component(name,{inheritAttrs:false,props:['modelValue','options','placeholder','disabled'],setup(p,{attrs}){return()=>Vue.h('div',{...attrs,class:[attrs.class,'select-wrap']},[Vue.h('button',{'aria-haspopup':'listbox',disabled:p.disabled},String(p.modelValue?.label||p.modelValue||p.placeholder||''))])}});
    app.component('BillingPaymentTerms',BillingPaymentTerms);
    app.component('BillingDiscountAdjustment',BillingDiscountAdjustment);
    app.component('UPopover',{props:['open','disabled'],emits:['update:open'],setup(p,{emit,slots}){return()=>Vue.h('div',[Vue.h('div',{onClick:()=>{if(!p.disabled)emit('update:open',!p.open)}},slots.default?.()),p.open?slots.panel?.():null])}});
    app.component('UModal',{props:['modelValue'],setup(p,{slots}){return()=>p.modelValue?Vue.h(Vue.Teleport,{to:'body'},slots.default?.()):null}});
    app.component('UCard',{setup(p,{slots}){return()=>Vue.h('div',[slots.header?.(),slots.default?.(),slots.footer?.()])}});
    app.component('UFormGroup',{props:['label'],setup(p,{slots}){return()=>Vue.h('label',[p.label,slots.default?.()])}});
    app.component('UIcon',{setup(){return()=>Vue.h('span')}});
    app.component('UAlert',{props:['title','description'],setup(p){return()=>Vue.h('p',p.title+': '+p.description)}});
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
    const result = await build({ stdin: { contents: entry.replace(JSON.stringify('RENDER_CODE'), JSON.stringify(summary(file))), resolveDir: root, sourcefile: 'billing-browser-fixture.ts', loader: 'ts' }, alias: { '~': resolve(root) }, plugins: [{ name: 'real-billing-controls', setup(builder) { builder.onLoad({ filter: /\.vue$/ }, args => ({ contents: "import {ref,computed,watch,onMounted,onBeforeUnmount} from 'vue';\n" + compileScript(parse(readFileSync(args.path, 'utf8')).descriptor, { id: args.path, inlineTemplate: true }).content, loader: 'ts', resolveDir: dirname(args.path) })) } }], bundle: true, write: false, platform: 'browser', format: 'iife' })
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
  let closeBrowser: undefined | (()=>Promise<any>)
  t.after(async () => {
    await closeBrowser?.().catch(()=>{})
    if (child.exitCode===null) await Promise.race([once(child,'exit'),new Promise(done=>setTimeout(done,2000))])
    if (child.exitCode===null && process.platform==='win32' && child.pid) {
      try {execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})} catch {child.kill()}
    } else if(child.exitCode===null) child.kill()
    const actual=realpathSync(profile),within=relative(realpathSync(tmpdir()),actual)
    assert.ok(within&&!within.startsWith('..')&&!isAbsolute(within)&&basename(actual).startsWith('billing-browser-'))
    await rm(actual,{recursive:true,force:true,maxRetries:15,retryDelay:250})
  })
  const endpoint = await new Promise<string>((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(new Error('Chrome debugging endpoint timed out')), 15000)
    child.on('error', reject); child.stderr!.on('data', data => { output += data; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]) } })
  })
  const ws = new WebSocket(endpoint); await once(ws, 'open'); t.after(() => ws.close())
  let sequence = 0; const pending = new Map<number, any>(), browserErrors: any[] = []
  ws.on('message', data => { const message = JSON.parse(String(data)); if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails); if (message.id) { const p = pending.get(message.id); pending.delete(message.id); if (p) { clearTimeout(p.timer); message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result) } } })
  function command(method: string, params = {}, sessionId?: string): Promise<any> { return new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: '+method)) }, 10000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })) }) }
  closeBrowser=()=>command('Browser.close')
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
    const adjustmentLayout = await evaluate(`(()=>{const d=document.querySelector('[aria-label="Bill discount"]'),a=document.querySelector('[aria-label="Bill adjustment"]'),dr=d.getBoundingClientRect(),ar=a.getBoundingClientRect();return {discountX:dr.x,adjustmentX:ar.x,discountY:dr.y,adjustmentY:ar.y,discountWidth:dr.width,adjustmentWidth:ar.width,plusBlocked:!d.dispatchEvent(new KeyboardEvent('keydown',{key:'+',bubbles:true,cancelable:true}))}})()`)
    assert.ok(adjustmentLayout.adjustmentX>adjustmentLayout.discountX);assert.ok(Math.abs(adjustmentLayout.adjustmentY-adjustmentLayout.discountY)<1);assert.ok(Math.abs(adjustmentLayout.adjustmentWidth-adjustmentLayout.discountWidth)<2);assert.equal(adjustmentLayout.plusBlocked,true)
    await evaluate(`(()=>{for(const [label,value] of [['Bill discount','-2'],['Bill adjustment','2']]){const input=document.querySelector('[aria-label="'+label+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}})()`)
    assert.deepEqual(await evaluate('[__state.discount,__state.adjustment]'),['-2','2'])
    await evaluate(`(()=>{document.querySelector('[aria-label="Add client"]').click();document.querySelector('[aria-label="Product search"]').click();document.querySelector('[aria-label="Sales Return"]').click()})()`)
    assert.deepEqual(await evaluate('[__state.isClientAddModelOpen,__state.isProductSearchOpen,__state.issalesReturnModelOpen]'), [true,true,true])
    await evaluate(`(()=>{document.querySelector('[aria-label="New bill"]').click();[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save').click()})()`)
    assert.deepEqual(await evaluate('__clicked.slice(-2)'), page === 'billing' ? ['handleCreateNewDraft','handleSave'] : ['newBill','handleEdit'])
    {
      const termsState = page==='billing' ? 'invoicePaymentTerms' : 'invoiceTerms'
      const dueState = page==='billing' ? 'dueDate' : 'invoiceDueDate'
      const saveLabel = page==='billing' ? 'Create invoice' : 'Save'
      await evaluate(page==='billing' ? '__state.isInvoiceMode=true' : '__state.bill.invoiceCode="INV-741"')
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
      assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(saveLabel)})`),true)
      assert.equal(await evaluate(`!!document.querySelector('.billing-primary-action button[data-icon="i-heroicons-chevron-up"]')`),true)
      assert.equal(await evaluate(`!!document.querySelector('[aria-label="Account Name"]')`),false)
      assert.equal(await evaluate(`!![...document.querySelectorAll('label')].find(l=>l.textContent.trim()==='Payment')`),false)
      const invoiceLayout = await evaluate(`(()=>{const y=e=>e.getBoundingClientRect().y;const create=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(saveLabel)});return {actions:[create,document.querySelector('[aria-label="Delete"]'),document.querySelector('[aria-label="Sales Return"]')].map(y),fields:['invoice-payment-terms','invoice-due-date'].map(id=>y(document.getElementById(id)))}})()`)
      assert.ok(invoiceLayout.actions.every((y:number)=>Math.abs(y-invoiceLayout.actions[0])<3),JSON.stringify({width,height,...invoiceLayout}))
      assert.ok(invoiceLayout.fields.every((y:number)=>y<invoiceLayout.actions[0]))
      const termTrigger = await evaluate(`(()=>{const b=document.getElementById('invoice-payment-terms');const r=b.getBoundingClientRect();return {tag:b.tagName,text:b.textContent.trim(),width:r.width,height:r.height}})()`)
      assert.equal(termTrigger.tag,'BUTTON');assert.equal(termTrigger.text,'Due on Receipt');assert.ok(termTrigger.width>50&&termTrigger.height>20)
      await evaluate(`document.getElementById('invoice-payment-terms').click()`)
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
      assert.equal(await evaluate(`document.querySelectorAll('[role="option"]').length`),8)
      await evaluate(`(()=>{[...document.querySelectorAll('[role="option"]')].find(b=>b.textContent.trim()==='Net 30').click()})()`)
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
      assert.deepEqual(await evaluate(`[__state.${termsState},__state.${dueState}]`),['Net 30','2026-11-28'])
      assert.equal(await evaluate(`document.getElementById('invoice-payment-terms').textContent.trim()`),'Net 30')
      await evaluate(`document.getElementById('invoice-payment-terms').click()`)
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
      await evaluate(`(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='New Payment Term').click()})()`)
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
      assert.equal(await evaluate(`!!document.querySelector('form[aria-label="New Payment Term"] input[aria-label="Term Name"]')`),true)
      await evaluate(`(()=>{const form=document.querySelector('form[aria-label="New Payment Term"]');for(const [label,value] of [['Term Name','Wholesale 21'],['Due After','21']]){const input=form.querySelector('input[aria-label="'+label+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}})()`)
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
      await evaluate(`document.querySelector('form[aria-label="New Payment Term"]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`)
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
      assert.deepEqual(await evaluate(`[__state.${termsState},__state.${dueState}]`),['Wholesale 21','2026-11-19'])
      assert.equal(await evaluate(`document.querySelector('form[aria-label="New Payment Term"]')===null`),true)
      const subject = await evaluate(`(()=>{const input=document.getElementById('invoice-subject'),bar=document.querySelector('.billing-footer-bar'),qty=bar.firstElementChild,r=input.getBoundingClientRect(),b=bar.getBoundingClientRect(),q=qty.getBoundingClientRect();return {label:document.querySelector('label[for="invoice-subject"]').textContent.trim(),placeholder:input.placeholder,center:r.y+r.height/2,qtyCenter:q.y+q.height/2,right:r.right,barRight:b.right,barPadding:parseFloat(getComputedStyle(bar).paddingRight),dueMin:document.getElementById('invoice-due-date').min}})()`)
      assert.equal(subject.label,'Subject');assert.equal(subject.placeholder,'Let your customer know what this invoice is for')
      assert.ok(Math.abs(subject.center-subject.qtyCenter)<2,JSON.stringify(subject));assert.ok(Math.abs(subject.right-(subject.barRight-subject.barPadding))<2,JSON.stringify(subject))
      assert.equal(subject.dueMin,'2026-10-29')
      await evaluate(`(()=>{const input=document.getElementById('invoice-subject');input.value='Consulting services';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
      assert.equal(await evaluate('__state.invoiceReference'),'Consulting services')
      await evaluate(`(()=>{const input=document.getElementById('invoice-due-date');input.value='2026-12-01';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
      assert.equal(await evaluate(`__state.${dueState}`),'2026-12-01')
      await evaluate('__state.isSaving=true')
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
      assert.deepEqual(await evaluate(`['invoice-subject','invoice-due-date'].map(id=>document.getElementById(id).disabled)`),[true,true])
      await evaluate('__state.isSaving=false')
      if (page==='edit') {
        await evaluate('__state.bill.isMarkit=true')
        await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
        assert.deepEqual(await evaluate(`['invoice-subject','invoice-due-date','invoice-payment-terms'].map(id=>document.getElementById(id).disabled)`),[true,true,true])
        await evaluate('__state.bill.isMarkit=false')
      }
      if (width===1280 && height===720) {
        mkdirSync(root+'tests/billing/reports', { recursive: true })
        const screenshot = await command('Page.captureScreenshot', { format: 'png' }, session)
        writeFileSync(root+`tests/billing/reports/${page}-invoice-footer.png`, Buffer.from(screenshot.data, 'base64'))
      }
      await evaluate(page==='billing' ? '__state.isInvoiceMode=false' : '__state.bill.invoiceCode=null')
      await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
    }
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
