import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket from 'ws'
import { build } from 'esbuild'
import { parse, compileScript, compileStyle } from '@vue/compiler-sfc'

test('Chrome: quote and sales order pages retain drafts, preferences, saves, filters and print', { timeout: 180000 }, async t => {
  const browser = [process.env.QUOTE_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => file && existsSync(file))
  assert.ok(browser, 'Install Chrome/Edge or set QUOTE_TEST_BROWSER')
  const entry = `
    import * as Vue from 'vue';
    import * as Router from 'vue-router';
    import Quotes from './pages/erp/quotes/index.vue';
    import SalesOrders from './pages/erp/sales-orders/index.vue';
    import AddSalesOrder from './pages/erp/sales-orders/add.vue';
    import EditSalesOrder from './pages/erp/sales-orders/edit/[orderId].vue';
    import {quoteTotals} from './utils/erp-quote';
    import {salesOrderForEditor} from './utils/sales-order';
    import AddQuote from './pages/erp/quotes/add.vue';
    import EditQuote from './pages/erp/quotes/edit/[quoteId].vue';
    import InvoiceDrafts from './pages/erp/invoice-drafts.vue';
    import PublicQuote from './pages/quote/[token].vue';
    import {emptyQuotePreferences} from './utils/quote-preferences';
    import PrintPreview from './components/Quotes/PrintPreview.vue';
    let salesOrder=null,salesOrderPreferences=emptyQuotePreferences(),failOrderFirst=true;
    const calls=[],toasts=[];let saved=null,failFirst=true,failStaff=true,failPreferences=true,preferences=emptyQuotePreferences(),publicStatus='SENT';
    const staff={id:'staff',name:'Alex',code:7,email:'alex@example.test'};
    const router=Router.createRouter({history:Router.createWebHistory(),routes:[
      {path:'/erp/sales-orders',component:SalesOrders},{path:'/erp/sales-orders/add',component:AddSalesOrder},{path:'/erp/sales-orders/edit/:orderId',component:EditSalesOrder},
      {path:'/erp/quotes',component:Quotes},{path:'/erp/quotes/add',component:AddQuote},
      {path:'/erp/quotes/edit/:quoteId',component:EditQuote},
      {path:'/erp/invoice-drafts',component:InvoiceDrafts},{path:'/quote/:token',component:PublicQuote},
    ]});
    const customer={id:'customer',name:'Customer',phone:'1234567890'};
    const product={id:'stock',barcode:'ABC',size:'M',variant:{id:'variant',name:'Blue',sprice:118,discount:10,tax:18,unit:'pcs',product:{name:'Shirt',brand:{name:'Acme'},category:{name:'Clothing',taxType:'FIXED',fixedTax:18},collection:{name:'Summer'}}}};
    const fetch=async(url,options={})=>{
      calls.push({url,...options,body:options.body?JSON.parse(JSON.stringify(options.body)):undefined});
      if(url==='/api/sales-orders/preferences'){
        if(options.method==='PUT')salesOrderPreferences=JSON.parse(JSON.stringify(options.body));
        return {preferences:salesOrderPreferences,canManage:true};
      }
      if(url.startsWith('/api/sales-orders')){
        if(options.method==='DELETE'){salesOrder=null;return {success:true}}
        if(options.method==='POST'||options.method==='PUT'){
          if(failOrderFirst){failOrderFirst=false;throw Error('Order save unavailable')}
          const input=JSON.parse(JSON.stringify(options.body));salesOrder={...input,id:'order',orderNumber:'SO-00001',revision:'order-revision-'+calls.length,clientName:'Customer',clientPhone:'1234567890',total:quoteTotals(salesOrderForEditor(input)).total,invoiced:false,paymentStatus:'UNPAID'};
          return {id:salesOrder.id,orderNumber:salesOrder.orderNumber,revision:salesOrder.revision};
        }
        if(url==='/api/sales-orders')return {rows:salesOrder?[salesOrder]:[],total:salesOrder?1:0,summary:{}};
        return {...salesOrder,documentDesign:salesOrderPreferences.documentDesign};
      }
      if(url==='/api/quotes/preferences'){
        if(options.method==='PUT'){if(failPreferences){failPreferences=false;throw Error('Preference save failed')}preferences=JSON.parse(JSON.stringify(options.body))}
        return {preferences,canManage:true};
      }
      if(url==='/api/quote-share'){
        if(options.method==='POST'){publicStatus=options.body.decision;return {success:true,status:publicStatus}}
        return {quote:{...saved,status:publicStatus,quoteNumber:'QT-PUBLIC',documentDesign:preferences.documentDesign},company:{companyName:'Store',currency:'INR'},canRespond:preferences.allowCustomerApproval&&publicStatus==='SENT'};
      }
      if(url.endsWith('/share'))return {path:'/quote/example',phone:'1234567890',quoteNumber:saved.quoteNumber};
      if(url.endsWith('/workflow')){saved.workflow={invoiceId:'bill',invoiceNumber:101,emailStatus:'Not requested'};return {success:true,workflow:saved.workflow}}
      if(url.includes('findManyClient'))return [customer];
      if(url.includes('searchItems'))return [product];
      if(url==='/api/getuser'){if(failStaff){failStaff=false;throw Error('Staff unavailable')}return [staff]}
      if(options.method==='POST'||options.method==='PUT'){
        if(failFirst){failFirst=false;throw Error('Failed to fetch')}
        saved={...JSON.parse(JSON.stringify(options.body)),id:'quote',quoteNumber:'QT-00001',revision:'revision-'+calls.length,clientName:'Customer',clientPhone:'1234567890',total:190.66};
        if(saved.status==='ACCEPTED'&&preferences.conversion==='draft')saved.workflow={conversion:'draft',invoiceDraft:{quote:{...saved}}};
        return {id:saved.id,quoteNumber:saved.quoteNumber,revision:saved.revision};
      }
      if(options.method==='DELETE'){saved=null;return {success:true}}
      if(url==='/api/quotes'){const rows=saved&&(!options.query?.drafts||saved.workflow?.invoiceDraft)?[saved]:[];return {rows,total:rows.length}}
      if(url==='/api/quotes/quote')return {...saved,documentDesign:preferences.documentDesign};
      throw Error('Unexpected request: '+url);
    };
    Object.assign(globalThis,Vue,{
      definePageMeta(){},useHead(){},useToast:()=>({add:value=>toasts.push(value)}),
      $fetch:fetch,
      useRoute:Router.useRoute,
      useCompanyScope:()=>({ready:Promise.resolve(),companyId:Vue.ref('company'),auth:{session:Vue.ref({companyId:'company',companyName:'Demo Store',currency:'INR',isTaxIncluded:true})},fetch}),
      useAsyncData:async(key,fn,options)=>{
        const data=Vue.ref(null),pending=Vue.ref(false),error=Vue.ref(null);
        const refresh=async()=>{try{data.value=await fn();error.value=null}catch(e){error.value=e}};
        await refresh();if(options?.watch)Vue.watch(options.watch,refresh);
        return {data,pending,error,refresh};
      }
    });
    const h=Vue.h,app=Vue.createApp({render:()=>h(Router.RouterView,null,{
      default:({Component,route})=>Component?h(Vue.Suspense,null,{default:()=>h(Component,{key:route.fullPath})}):null,
    })});app.use(router);
    for(const name of ['UDashboardPanelContent','UFormGroup','UCard'])app.component(name,{inheritAttrs:false,props:['label'],setup(p,{attrs,slots}){return()=>h('div',attrs,[p.label?h('label',p.label):null,slots.header?.(),slots.default?.(),slots.footer?.()])}});
    app.component('UInput',{inheritAttrs:false,props:['modelValue','type','loading'],emits:['update:modelValue'],setup(p,{attrs,emit}){return()=>h('input',{...attrs,type:p.type||'text',value:p.modelValue,onInput:e=>emit('update:modelValue',e.target.value)})}});
    app.component('UTextarea',{inheritAttrs:false,props:['modelValue'],emits:['update:modelValue'],setup(p,{attrs,emit}){return()=>h('textarea',{...attrs,value:p.modelValue,onInput:e=>emit('update:modelValue',e.target.value)})}});
    app.component('USelect',{inheritAttrs:false,props:['modelValue','options'],emits:['update:modelValue'],setup(p,{attrs,emit}){return()=>h('select',{...attrs,value:p.modelValue,onChange:e=>emit('update:modelValue',e.target.value)},p.options.map(o=>h('option',{value:typeof o==='object'?o.value:o},typeof o==='object'?o.label:o)))}});
    app.component('UButton',{inheritAttrs:false,props:{type:{default:'button'},disabled:Boolean,loading:Boolean,to:[String,Object]},setup(p,{attrs,slots}){return()=>h('button',{...attrs,type:p.type,disabled:p.disabled||p.loading,onClick:e=>{attrs.onClick?.(e);if(p.to)router.push(p.to)}},slots.default?.())}});
    app.component('UAlert',{props:['title','description'],setup:p=>()=>h('div',{role:'alert'},p.title+': '+p.description)});
    app.component('UBadge',{setup:(p,{slots})=>()=>h('span',slots.default?.())});
    app.component('UModal',{props:['modelValue'],setup:(p,{slots})=>()=>p.modelValue?h('div',{role:'dialog'},slots.default?.()):null});
    app.component('USlideover',{props:['modelValue','side'],setup:(p,{slots})=>()=>p.modelValue?h('div',{role:'dialog','data-side':p.side},slots.default?.()):null});
    app.component('UCheckbox',{inheritAttrs:false,props:['modelValue','label'],emits:['update:modelValue'],setup:(p,{attrs,emit})=>()=>h('label',[h('input',{...attrs,type:'checkbox',checked:p.modelValue,onChange:e=>emit('update:modelValue',e.target.checked)}),p.label])});
    app.component('UTable',{props:['rows','columns','sort'],emits:['update:sort'],setup(p,{slots,emit}){return()=>{
      const headers=p.columns.map(c=>h('th',c.sortable?h('button',{'aria-label':'Sort '+c.label,onClick:()=>emit('update:sort',{column:c.key,direction:'asc'})},c.label):c.label));
      const rows=p.rows.map(row=>h('tr',p.columns.map(c=>h('td',slots[c.key+'-data']?slots[c.key+'-data']({row}):String(row[c.key]||'')))));
      return h('table',[h('thead',h('tr',headers)),h('tbody',rows)]);
    }}});
    app.component('UDropdown',{props:['items'],setup(p,{slots}){const open=Vue.ref(false);return()=>h('div',[h('div',{onClick:()=>open.value=!open.value},slots.default?.()),open.value?p.items.flat().map(item=>h('button',{'aria-label':item.label,disabled:item.disabled,onClick:()=>{item.click?.();if(item.to)router.push(item.to);open.value=false}},item.label)):null])}});
    app.component('USelectMenu',{props:['options','modelValue'],emits:['update:modelValue'],setup(p,{slots,emit}){const open=Vue.ref(false);return()=>h('div',[h('div',{onClick:()=>open.value=!open.value},slots.default?.()),open.value?p.options.map(column=>h('label',[h('input',{type:'checkbox','aria-label':'Show '+column.label,checked:p.modelValue.some(c=>c.key===column.key),onChange:e=>emit('update:modelValue',e.target.checked?[...p.modelValue,column]:p.modelValue.filter(c=>c.key!==column.key))}),column.label])):null])}});
    app.component('UPopover',{setup(p,{slots}){const open=Vue.ref(false);return()=>h('div',[h('div',{onClick:()=>open.value=!open.value},slots.default?.()),open.value?slots.panel?.({close:()=>open.value=false}):null])}});
    app.component('DatePicker',{setup:()=>()=>null});app.component('UIcon',{setup:()=>()=>null});
    app.component('UPagination',{setup:()=>()=>null});app.component('CompanyFormField',{setup:()=>()=>null});
    app.component('BillingAddClient',{setup:()=>()=>null});app.component('QuotesPrintPreview',PrintPreview);
    window.quoteFixture={calls,toasts,exports:[],router};
    router.push('/erp/quotes?entryCompany=company').then(()=>router.isReady()).then(()=>app.mount('#app'));
  `
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: 'quote-fixture.ts' },
    bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '~': process.cwd() },
    plugins: [{ name: 'quote-vue', setup(builder) {
      builder.onLoad({filter:/erp-document-export\.client\.ts$/},()=>({contents:'export async function exportDocumentTable(kind,title,columns,rows){window.quoteFixture.exports.push({kind,title,columns,rows})}',loader:'ts'}));
      builder.onLoad({ filter: /\.vue$/ }, args => {
        const { descriptor } = parse(readFileSync(args.path, 'utf8'), { filename: args.path })
        const id = createHash('sha1').update(args.path).digest('hex').slice(0, 8)
        const css = descriptor.styles.map(style => compileStyle({ source: style.content, filename: args.path, id: 'data-v-' + id, scoped: !!style.scoped }).code).join('\n')
        const script = compileScript(descriptor, { id, inlineTemplate: true }).content.replace('export default', 'const component =')
        return { contents: script + '\ncomponent.__scopeId = ' + JSON.stringify('data-v-' + id) + '; export default component; const style = document.createElement("style"); style.textContent = ' + JSON.stringify(css) + '; document.head.appendChild(style);', loader: 'ts', resolveDir: dirname(args.path) }
      })
    } }],
  })
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end('<!doctype html><meta charset="utf-8"><div id="app"></div><script>' + bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + '</script>')
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const cache = resolve('node_modules/.cache/quote-browser'); mkdirSync(cache, { recursive: true })
  const profile = mkdtempSync(resolve(cache, 'profile-'))
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--no-default-browser-check', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  t.after(() => { child.kill() })
  const endpoint = await new Promise<string>((done, fail) => {
    let output = ''; const timer = setTimeout(() => fail(Error('Chrome launch timed out')), 15000)
    child.on('error', error => { clearTimeout(timer); fail(error) })
    child.stderr!.on('data', data => { output += data; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); done(match[1]) } })
  })
  const socket = new WebSocket(endpoint); await once(socket, 'open')
  t.after(() => socket.terminate())
  let seq = 0; const waiting = new Map<number, any>(); const errors: any[] = []
  socket.on('message', raw => {
    const response = JSON.parse(String(raw))
    if (response.method === 'Runtime.exceptionThrown') errors.push(response.params.exceptionDetails)
    const task = waiting.get(response.id)
    if (task) { waiting.delete(response.id); response.error ? task.reject(response.error) : task.resolve(response.result) }
  })
  const command = (method: string, params: any = {}) => new Promise<any>((resolve, reject) => {
    const id = ++seq; waiting.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }))
  })
  const { targetInfos } = await command('Target.getTargets')
  const target = targetInfos.find((target: any) => target.type === 'page')
  const attached = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true })
  const sessionId = attached.sessionId
  const pageCommand = (method: string, params: any = {}) => new Promise<any>((resolve, reject) => {
    const id = ++seq; waiting.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, sessionId }))
  })
  await pageCommand('Runtime.enable')
  await pageCommand('Page.navigate', { url: `http://127.0.0.1:${(server.address() as any).port}` })
  const evaluate = async (expression: string) => {
    const result = await pageCommand('Runtime.evaluate', { expression: `(async()=>{${expression}})()`, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  await evaluate(`for(let i=0;i<100&&!document.querySelector('[aria-label="Search quotes"]');i++)await new Promise(r=>setTimeout(r,50));return !!document.querySelector('[aria-label="Search quotes"]')`).then(ready => assert.ok(ready, JSON.stringify(errors)))
  const result = await evaluate(`
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
    const fill=(label,value)=>{const el=document.querySelector('[aria-label="'+label+'"]');if(!el)throw Error('Missing '+label);el.value=value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))};
    const check=(ok,message)=>{if(!ok)throw Error(message)};
    check(location.pathname==='/erp/quotes'&&!document.querySelector('[aria-label="Search customer"]'),'Quotes did not open the table');
    button('Preference').click();await wait(50);
    check(!!document.querySelector('[aria-label="Quote preferences"]')&&document.querySelector('[data-side="right"]'),'Preferences not opened on the right');
    fill('Default quote terms','Delivery after approval.');fill('Default quote notes','Please include your quote reference.');
    check(!document.querySelector('[aria-label="Modern quote template"]'),'Old template choices remain');document.querySelector('[aria-label="Hide zero-value quote items"]').click();
    document.querySelector('[aria-label="Allow customer quote approval"]').click();document.querySelector('[aria-label="Convert accepted quotes to draft invoices"]').click();await wait(20);
    button('Save preferences').click();await wait(40);check(document.body.textContent.includes('Preference save failed'),'Preference failure hidden');
    check(document.querySelector('[aria-label="Default quote terms"]').value==='Delivery after approval.','Preference failure cleared input');
    button('Save preferences').click();await wait(50);check(!document.querySelector('[aria-label="Quote preferences"]'),'Preferences did not close after save');
    button('Preference').click();await wait(40);button('Design quote').click();await wait(60);
    check(document.querySelector('dialog[open]')&&document.querySelector('.quote-paper'),'Quote designer missing');
    button('Add header image').click();await wait(20);
    const imageInput=document.querySelector('[aria-label="Upload quote design image"]');
    const canvas=document.createElement('canvas');canvas.width=120;canvas.height=30;const ctx=canvas.getContext('2d');ctx.fillStyle='#f97316';ctx.fillRect(0,0,120,30);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const transfer=new DataTransfer();transfer.items.add(new File([blob,new Uint8Array(400000)],'header.png',{type:'image/png'}));imageInput.files=transfer.files;imageInput.dispatchEvent(new Event('change',{bubbles:true}));await wait(80);
    check(!!document.querySelector('.quote-paper img'),'Uploaded header not previewed');fill('Quote image description','Header banner');
    button('Add footer image').click();await wait(20);const footerInput=document.querySelector('[aria-label="Upload quote design image"]');const footerTransfer=new DataTransfer();footerTransfer.items.add(new File([blob],'footer.png',{type:'image/png'}));footerInput.files=footerTransfer.files;footerInput.dispatchEvent(new Event('change',{bubbles:true}));for(let i=0;i<30&&document.querySelectorAll('.quote-paper img').length!==2;i++)await wait(20);check(document.querySelectorAll('.quote-paper img').length===2,'Footer upload failed '+document.body.textContent);fill('Quote image description','Footer banner');
    button('Add text').click();await wait(20);fill('Quote design text','Custom quote footer');await wait(20);
    check(document.querySelector('.quote-paper').textContent.includes('Custom quote footer'),'Text did not update');
    button('Undo').click();await wait(20);check(!document.querySelector('.quote-paper').textContent.includes('Custom quote footer'),'Design undo failed');button('Redo').click();await wait(20);check(document.querySelector('.quote-paper').textContent.includes('Custom quote footer'),'Design redo failed');
    const textRow=[...document.querySelectorAll('[aria-label="Quote design sections"] li')].find(el=>el.textContent.includes('Custom quote footer'));textRow.querySelector('[aria-label$=" up"]').click();await wait(20);
    document.querySelector('[data-section-id="quote-3"]').click();await wait(20);fill('Quote name column heading','Description');await wait(20);check(document.querySelector('.quote-paper th:nth-child(2)').textContent==='Description','Table heading did not update');
    button('Add image').click();await wait(20);check(document.querySelector('[aria-label="Quote image placement"]').value==='absolute','Free image placement missing');fill('Quote image left','30');fill('Quote image top','40');await wait(20);
    const imageId=document.querySelector('[aria-label="Quote design sections"] button[aria-pressed="true"]').getAttribute('aria-label').replace('Select quote section ','');
    const box=document.querySelector('[data-section-id="'+imageId+'"]');box.setPointerCapture=()=>{};box.hasPointerCapture=()=>false;box.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:22,button:0,clientX:100,clientY:100}));box.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:22,clientX:130,clientY:130}));box.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:22,clientX:130,clientY:130}));await wait(20);
    check(Number(document.querySelector('[aria-label="Quote image left"]').value)>30&&Number(document.querySelector('[aria-label="Quote image top"]').value)>40,'Quote image drag did not update position');
    button('Delete section').click();await wait(20);
    button('Add live field').click();await wait(20);fill('Quote design live field','clientName');await wait(20);check(document.querySelectorAll('.quote-paper .preserve-lines').length>0,'Live field missing');
    button('Page setup').click();await wait(20);fill('Quote accent colour','#c2410c');await wait(20);button('Save design').click();await wait(70);
    check(!document.querySelector('dialog[open]')&&!document.querySelector('[aria-label="Quote preferences"]'),'Design not saved');
    button('Preference').click();await wait(40);button('Design quote').click();await wait(50);
    check(document.querySelectorAll('.quote-paper img').length===2&&document.querySelector('.quote-paper').textContent.includes('Custom quote footer'),'Saved design did not reload '+JSON.stringify({images:document.querySelectorAll('.quote-paper img').length,text:document.querySelector('.quote-paper')?.textContent,sections:window.quoteFixture.calls.filter(c=>c.url==='/api/quotes/preferences'&&c.method==='PUT').at(-1)?.body.documentDesign.sections.map(s=>({kind:s.kind,text:s.text,image:!!s.image}))}));
    check(document.querySelector('.quote-paper').style.getPropertyValue('--quote-accent')==='#c2410c','Design style did not persist');
    document.querySelector('dialog[open]').dispatchEvent(new Event('cancel',{cancelable:true}));await wait(20);check(!document.querySelector('dialog[open]')&&document.querySelector('[aria-label="Quote preferences"]'),'Closing designer lost preference drawer');button('Cancel').click();await wait(30);

    button('Add quote').click();await wait(100);
    check(location.pathname==='/erp/quotes/add'&&new URLSearchParams(location.search).get('entryCompany')==='company','Add quote did not navigate with company');
    check(!document.querySelector('[aria-label="Quote template"]')&&document.querySelector('[aria-label="Quote terms and conditions"]').value==='Delivery after approval.','New quote defaults not applied');
    check(document.querySelector('[aria-label="Quote customer notes"]').value==='Please include your quote reference.','Default customer notes not applied');
    button('Save quote').click();await wait(20);check(!window.quoteFixture.calls.some(c=>c.method==='POST'&&c.url==='/api/quotes'),'Invalid form submitted');
    fill('Search customer','Customer');await wait(350);button('Customer 1234567890').click();await wait(20);
    check(document.querySelector('[aria-label="Product search field"]').value==='all','Search default is not all fields');
    fill('Product search field','barcode');fill('Search products','ABC');await wait(350);
    const productQuery=()=>window.quoteFixture.calls.filter(c=>c.url.includes('searchItems')).at(-1).query;
    check(productQuery().field==='barcode','Barcode-only field not sent');
    for(const field of ['brand','category','collection','all','barcode']){
      fill('Product search field',field);await wait(350);
      check(productQuery().field===field&&productQuery().q==='ABC','Field change did not refresh current query: '+field);
    }
    check(localStorage.getItem('erp:quote-product-search-field:v1')==='barcode','Search field not persisted');
    check(document.body.textContent.includes('Acme')&&document.body.textContent.includes('Clothing')&&document.body.textContent.includes('Summer'),'Search metadata missing');
    [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Shirt Blue')).click();await wait(20);
    button('Add item').click();await wait(20);fill('Item 2 name','Free sample');await wait(20);
    fill('Item 1 quantity','2');fill('Quote discount','10');fill('Discount type','percent');fill('Adjustment','-0.5');await wait(20);
    check(document.body.textContent.includes('190.66'),'Incorrect displayed total');
    fill('Search prepared by','Alex');await wait(350);
    check(document.body.textContent.includes('Staff unavailable'),'Staff search failure missing');
    button('Retry').click();await wait(40);check(!!document.querySelector('[aria-label="Select prepared by Alex"]'),'Staff retry failed');
    fill('Search prepared by','No matching staff');await wait(350);
    check(document.body.textContent.includes('No matching active users'),'Staff empty state missing');
    button('Save quote').click();await wait(20);
    check(!window.quoteFixture.calls.some(c=>c.method==='POST'&&c.url==='/api/quotes'),'Unselected staff search was submitted');
    check(document.body.textContent.includes('Select a user from the Prepared by results'),'Unselected staff search not explained');
    fill('Search prepared by','7');await wait(350);document.querySelector('[aria-label="Select prepared by Alex"]').click();await wait(20);
    document.querySelector('[aria-label="Change prepared by"]').click();await wait(20);
    fill('Search prepared by','alex@example');await wait(350);document.querySelector('[aria-label="Select prepared by Alex"]').click();await wait(20);
    check(window.quoteFixture.calls.filter(c=>c.url==='/api/getuser').length===2,'Staff list not reused');
    check(window.quoteFixture.calls.filter(c=>c.url==='/api/getuser').every(c=>c.query.companyId==='company'),'Staff lookup lost company scope');
    fill('Quote status','SENT');await wait(20);
    let confirms=0;window.confirm=()=>{confirms++;return false};button('Back to quotes').click();await wait(60);
    check(confirms===0&&location.pathname==='/erp/quotes','New quote draft did not allow safe navigation');
    button('Add quote').click();await wait(100);
    check(document.querySelector('[aria-label="Quote status"]').value==='SENT'&&document.querySelector('[aria-label="Item 1 quantity"]').value==='2','Local quote draft did not restore status/items');
    check(document.body.textContent.includes('Customer')&&document.body.textContent.includes('Alex'),'Local draft lost selected customer or staff');window.confirm=()=>true;
    button('Save quote').click();await wait(30);check(document.body.textContent.includes('Quote not saved'),'Failure not shown');
    check(document.querySelector('[aria-label="Item 1 name"]').value.includes('Shirt'),'Failed save cleared items');
    button('Save quote').click();await wait(30);
    const creates=window.quoteFixture.calls.filter(c=>c.method==='POST'&&c.url==='/api/quotes');check(creates.length===2,'Expected retry');check(creates[0].body.requestId===creates[1].body.requestId,'Retry changed request ID');
    check(creates[1].body.salesperson==='Alex','Selected prepared-by name not saved');
    check(document.body.textContent.includes('QT-00001'),'Saved quote number missing');
    button('Save & print').click();await wait(40);check(!!document.querySelector('[aria-label="Quote print preview"]'),'Missing preview');
    check(document.querySelector('[aria-label="Quote print preview"]').textContent.includes('190.66'),'Preview total differs');
    check(document.querySelector('[aria-label="Quote print preview"]').textContent.includes('Prepared by: Alex'),'Prepared by missing from print');
    check(document.querySelector('.quote-paper').textContent.includes('Custom quote footer')&&document.querySelectorAll('.quote-paper img').length===2,'Saved company design not used in quote preview');
    check(!document.querySelector('[aria-label="Quote print preview"]').textContent.includes('Free sample'),'Zero-value item was printed');
    button('Close').click();await wait(20);button('Back to quotes').click();await wait(100);
    check(location.pathname==='/erp/quotes','Back to quotes did not navigate');
    check(document.querySelector('table').textContent.includes('QT-00001'),'Saved quote not listed');
    const latest=()=>window.quoteFixture.calls.filter(c=>c.url==='/api/quotes').at(-1).query;
    fill('Rows per page','5');await wait(30);check(latest().pageSize===5&&latest().page===1,'Page size not sent');
    document.querySelector('[aria-label="Sort Total"]').click();await wait(30);check(latest().sort==='total'&&latest().order==='asc','Sort not sent');
    button('All dates').click();await wait(20);button('Last 7 days').click();await wait(30);check(latest().from&&latest().to,'Date range not sent');
    fill('Search quotes','Customer');await wait(350);check(latest().q==='Customer','Search not debounced');
    button('Filters').click();await wait(20);fill('Filter status','SENT');fill('Minimum amount','100');button('Apply filters').click();await wait(30);
    check(latest().status==='SENT'&&latest().min==='100','Filters not applied');
    button('Columns').click();await wait(20);document.querySelector('[aria-label="Show Valid until"]').click();await wait(20);
    check(![...document.querySelectorAll('th')].some(th=>th.textContent==='Valid until'),'Column not hidden');
    button('Download').click();await wait(20);button('Excel').click();await wait(50);
    check(window.quoteFixture.exports[0]?.rows.length===1,'Export missing filtered rows');
    check(window.quoteFixture.calls.some(c=>c.url==='/api/quotes'&&c.query?.pageSize===500&&c.query.status==='SENT'),'Export did not use filtered request');
    button('Reset').click();await wait(350);check(latest().status===''&&latest().q===''&&latest().from===''&&latest().pageSize===20,'Reset failed');
    document.querySelector('[aria-label="Quote actions"]').click();await wait(20);
    document.querySelector('[aria-label="Edit quote"]').click();await wait(100);
    check(location.pathname==='/erp/quotes/edit/quote'&&new URLSearchParams(location.search).get('entryCompany')==='company','Edit did not navigate with company');
    check(document.querySelector('[aria-label="Item 1 quantity"]').value==='2','Edit did not restore quote');
    check(document.querySelector('[aria-label="Product search field"]').value==='barcode','Edit did not restore search preference');
    check(!!document.querySelector('[aria-label="Change prepared by"]')&&!document.querySelector('[aria-label="Search prepared by"]'),'Edit did not restore selected staff');
    check(document.querySelector('[aria-label="Item 2 name"]').value==='Free sample','Hidden print item missing from editor');
    fill('Item 1 quantity','3');await wait(20);let editConfirms=0;window.confirm=()=>{editConfirms++;return false};button('Back to quotes').click();await wait(40);check(editConfirms===1&&location.pathname==='/erp/quotes/edit/quote','Saved quote edit lost navigation guard');window.confirm=()=>true;fill('Item 1 quantity','2');await wait(20);
    fill('Quote status','ACCEPTED');button('Save quote').click();await wait(40);
    check(document.body.textContent.includes('accepted quote is locked')&&!button('Save quote'),'Accepted quote editing policy not enforced');
    button('Back to quotes').click();await wait(100);
    await window.quoteFixture.router.push('/erp/invoice-drafts?entryCompany=company');await wait(100);
    check(document.querySelector('table').textContent.includes('QT-00001'),'Draft invoice not listed');
    button('Review draft').click();await wait(40);check(document.querySelector('[aria-label="Quote print preview"]').textContent.includes('INVOICE DRAFT'),'Draft preview not opened');button('Close').click();await wait(20);
    button('Issue invoice').click();await wait(20);button('Confirm issue').click();await wait(60);
    check(!document.querySelector('table').textContent.includes('QT-00001'),'Issued draft remains in draft list');
    await window.quoteFixture.router.push('/erp/quotes?entryCompany=company');await wait(100);
    document.querySelector('[aria-label="Quote actions"]').click();await wait(20);document.querySelector('[aria-label="Share quote"]').click();await wait(40);
    check(document.querySelector('[aria-label="Quote customer link"]').value.includes('/quote/example')&&button('Open WhatsApp'),'Share quote actions missing');button('Close').click();await wait(20);
    await window.quoteFixture.router.push('/quote/example');await wait(100);check(document.querySelectorAll('.quote-paper img').length===2&&document.querySelector('.quote-paper').textContent.includes('Custom quote footer'),'Public quote ignored saved design');button('Accept quote').click();await wait(20);button('Confirm acceptance').click();await wait(60);
    check(document.body.textContent.includes('acceptance has been recorded')&&!button('Accept quote'),'Public quote acceptance not shown');
    await window.quoteFixture.router.push('/erp/quotes?entryCompany=company');await wait(100);
    document.querySelector('[aria-label="Quote actions"]').click();await wait(20);document.querySelector('[aria-label="Print quote"]').click();await wait(40);
    check(!!document.querySelector('[aria-label="Quote print preview"]'),'List print preview did not open');button('Close').click();await wait(20);
    document.querySelector('[aria-label="Quote actions"]').click();await wait(20);document.querySelector('[aria-label="Delete quote"]').click();await wait(20);button('Delete quote').click();await wait(30);
    check(window.quoteFixture.calls.some(c=>c.method==='DELETE'&&c.url==='/api/quotes/quote'),'Delete not sent');
    return {creates:creates.length,updates:window.quoteFixture.calls.filter(c=>c.method==='PUT'&&c.url==='/api/quotes/quote').length,deleted:true};
  `)
  assert.deepEqual(result, { creates: 2, updates: 2, deleted: true })
  assert.deepEqual(errors, [])
  await evaluate(`
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
    const fill=(label,value)=>{const el=document.querySelector('[aria-label="'+label+'"]');if(!el)throw Error('Missing '+label);el.value=value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))};
    const check=(ok,message)=>{if(!ok)throw Error(message)};
    await window.quoteFixture.router.push('/erp/sales-orders?entryCompany=company');await wait(100);check(button('Add sales order'),'Sales orders table missing');
    button('Preference').click();await wait(60);check(!document.querySelector('[aria-label="Allow customer quote approval"]'),'Quote approval shown for sales orders');button('Design sales order').click();await wait(60);
    check(document.querySelector('.quote-paper h1').textContent==='SALES ORDER','Wrong sales order design heading');button('Add text').click();await wait(20);fill('Quote design text','Order design footer');await wait(20);button('Save design').click();await wait(60);
    button('Add sales order').click();await wait(100);check(location.pathname==='/erp/sales-orders/add','Sales order add URL missing');
    check([...document.querySelector('[aria-label="Sales order status"]').options].map(o=>o.value).join(',')==='DRAFT,CONFIRMED,CLOSED,CANCELLED','Wrong sales order statuses');
    fill('Order date','2026-10-29');fill('Expected shipment date','2026-11-29');fill('Sales order status','CONFIRMED');fill('Search customer','Customer');await wait(350);button('Customer 1234567890').click();await wait(20);
    fill('Search products','ABC');await wait(350);[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Shirt Blue')).click();await wait(20);fill('Item 1 quantity','2');fill('Sales order discount','10');fill('Discount type','percent');fill('Adjustment','-0.5');await wait(20);
    button('Back to sales orders').click();await wait(80);button('Add sales order').click();await wait(100);check(document.querySelector('[aria-label="Item 1 quantity"]').value==='2'&&document.querySelector('[aria-label="Sales order status"]').value==='CONFIRMED','Sales order local draft lost');
    button('Save sales order').click();await wait(30);check(document.body.textContent.includes('Order save unavailable'),'Order failure hidden');button('Save sales order').click();await wait(50);
    const requests=window.quoteFixture.calls.filter(c=>c.url==='/api/sales-orders'&&c.method==='POST');check(requests.length===2&&requests[0].body.requestId===requests[1].body.requestId,'Order retry duplicated request identity');check(requests[1].body.orderDate==='2026-10-29'&&requests[1].body.expectedShipmentDate==='2026-11-29','Order fields were not mapped');
    check(document.body.textContent.includes('SO-00001'),'Saved order number missing');button('Save & print').click();await wait(50);check(document.querySelector('[aria-label="Sales order print preview"]').textContent.includes('SALES ORDER')&&document.querySelector('.quote-paper').textContent.includes('Order design footer'),'Sales order print/design missing');button('Close').click();await wait(20);
    button('New sales order').click();await wait(30);check(document.querySelector('[aria-label="Sales order status"]').value==='CONFIRMED'&&!document.querySelector('[aria-label="Item 1 name"]').value,'Saved order draft was not cleared or status forgotten');
    button('Back to sales orders').click();await wait(100);button('Filters').click();await wait(20);fill('Filter status','CONFIRMED');button('Apply filters').click();await wait(40);check(window.quoteFixture.calls.filter(c=>c.url==='/api/sales-orders').at(-1).query.status==='CONFIRMED','Sales order filters missing');
    document.querySelector('[aria-label="Sales order actions"]').click();await wait(20);document.querySelector('[aria-label="Edit sales order"]').click();await wait(100);check(location.pathname==='/erp/sales-orders/edit/order'&&document.querySelector('[aria-label="Item 1 quantity"]').value==='2','Sales order edit failed');fill('Sales order status','CLOSED');button('Save sales order').click();await wait(40);check(!button('Save sales order')&&document.body.textContent.includes('sales order is locked'),'Terminal order edit lock missing');
    button('Back to sales orders').click();await wait(100);document.querySelector('[aria-label="Sales order actions"]').click();await wait(20);document.querySelector('[aria-label="Delete sales order"]').click();await wait(20);button('Delete sales order').click();await wait(40);check(!document.querySelector('table').textContent.includes('SO-00001'),'Sales order delete failed');
    await window.quoteFixture.router.push('/erp/quotes?entryCompany=company');await wait(100);return true;
  `)
  await pageCommand('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  assert.deepEqual(errors, [])
  assert.ok(await evaluate(`document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='Add quote')b.click()});await new Promise(r=>setTimeout(r,100));return location.pathname==='/erp/quotes/add'&&!!document.querySelector('[aria-label="Quote date"]')&&document.querySelector('[aria-label="Product search field"]').value==='barcode'`))
  assert.ok(await evaluate(`localStorage.setItem('erp:quote-product-search-field:v1','invalid');await window.quoteFixture.router.push('/erp/quotes');await new Promise(r=>setTimeout(r,100));document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='Add quote')b.click()});await new Promise(r=>setTimeout(r,100));return document.querySelector('[aria-label="Product search field"]').value==='all'`))
  assert.ok(await evaluate(`await window.quoteFixture.router.push('/erp/quotes');await new Promise(r=>setTimeout(r,100));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Preference').click();await new Promise(r=>setTimeout(r,50));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Design quote').click();await new Promise(r=>setTimeout(r,60));return document.querySelector('dialog[open]').scrollWidth<=window.innerWidth+1&&document.querySelector('.design-properties').getBoundingClientRect().width<=window.innerWidth`))
  await evaluate(`document.querySelector('[aria-label="Close quote designer"]').click();await new Promise(r=>setTimeout(r,20));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Cancel').click();await window.quoteFixture.router.push('/erp/quotes/add?entryCompany=company');await new Promise(r=>setTimeout(r,100));const input=document.querySelector('[aria-label="Item 1 name"]');const original=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('Quota full','QuotaExceededError')};input.value='Draft without storage';input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,20));let confirms=0;window.confirm=()=>{confirms++;return false};[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Back to quotes').click();await new Promise(r=>setTimeout(r,40));const guarded=confirms===1&&location.pathname==='/erp/quotes/add'&&[...document.querySelectorAll('[role="alert"]')].some(el=>el.textContent.includes('Could not keep the local draft'));Storage.prototype.setItem=original;window.confirm=()=>true;if(!guarded)throw Error('Storage failure silently discarded the quote');input.value='Restore after refresh';input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,20));return true`)
  await pageCommand('Page.reload')
  assert.ok(await evaluate(`for(let i=0;i<100&&!document.querySelector('[aria-label="Search quotes"]');i++)await new Promise(r=>setTimeout(r,50));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add quote').click();await new Promise(r=>setTimeout(r,100));return document.querySelector('[aria-label="Item 1 name"]').value==='Restore after refresh'&&document.querySelector('[aria-label="Quote status"]').value==='SENT'`))
  if (process.env.QUOTE_DESIGN_SCREENSHOT) await evaluate(`await window.quoteFixture.router.push('/erp/quotes');await new Promise(r=>setTimeout(r,80));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Preference').click();await new Promise(r=>setTimeout(r,50));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Design quote').click();await new Promise(r=>setTimeout(r,40));return true`)
  if (process.env.QUOTE_DESIGN_SCREENSHOT) {
    await pageCommand('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await evaluate(`await new Promise(r=>setTimeout(r,100));return true`)
    const screenshot = await pageCommand('Page.captureScreenshot', { format: 'png' })
    writeFileSync(resolve(cache, 'quote-designer.png'), Buffer.from(screenshot.data, 'base64'))
  }
  await command('Browser.close').catch(() => {})
})
