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
    import QuoteDesignPage from './pages/erp/quotes/design.vue';
    import OrderDesignPage from './pages/erp/sales-orders/design.vue';
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
      {path:'/erp/quotes/design',component:QuoteDesignPage},{path:'/erp/sales-orders/design',component:OrderDesignPage},
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
    const designerState=new Map();
    window.designerHistory=key=>document.querySelector('.quote-editing-canvas').dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:true,bubbles:true}));
    Object.assign(globalThis,Vue,{
      definePageMeta(){},useHead(){},useToast:()=>({add:value=>toasts.push(value)}),
      $fetch:fetch,
      useRoute:Router.useRoute,
      navigateTo:to=>router.push(to),
      useState:(key,init)=>{if(!designerState.has(key))designerState.set(key,Vue.ref(init()));return designerState.get(key)},
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
      builder.onResolve({ filter: /^lucide-vue-next$/ }, () => ({ path: resolve('tests/designer-icons-fixture.mjs') }));
      builder.onLoad({filter:/erp-document-export\.client\.ts$/},()=>({contents:'export async function exportDocumentTable(kind,title,columns,rows){window.quoteFixture.exports.push({kind,title,columns,rows})}',loader:'ts'}));
      builder.onLoad({ filter: /\.vue$/ }, args => {
        const { descriptor } = parse(readFileSync(args.path, 'utf8'), { filename: args.path })
        const id = createHash('sha1').update(args.path).digest('hex').slice(0, 8)
        const css = descriptor.styles.map(style => compileStyle({ source: style.src ? readFileSync(resolve(dirname(args.path), style.src), 'utf8') : style.content, filename: args.path, id: 'data-v-' + id, scoped: !!style.scoped }).code).join('\n')
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
  t.after(() => { child.kill(); child.stderr?.destroy(); child.unref() })
  const endpoint = await new Promise<string>((done, fail) => {
    let output = ''; const timer = setTimeout(() => fail(Error('Chrome launch timed out')), 15000)
    child.on('error', error => { clearTimeout(timer); fail(error) })
    child.stderr!.on('data', data => { output += data; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); done(match[1]) } })
  })
  const socket = new WebSocket(endpoint)
  await once(socket, 'open')
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
    check(document.querySelector('.document-design-page')&&document.querySelector('.quote-paper'),'Quote designer missing');
    const pageSize = document.querySelector('[aria-label="Document page size"]');
    pageSize.value='A5';pageSize.dispatchEvent(new Event('change',{bubbles:true}));await wait(30);
    check(Math.abs(document.querySelector('.quote-paper').getBoundingClientRect().width / .75 - 148*96/25.4)<2,'A5 preview geometry not applied');
    const template=document.querySelector('[aria-label="Design template"]');template.value='professional';template.dispatchEvent(new Event('change',{bubbles:true}));await wait(20);button('Apply template').click();await wait(30);
    check(document.querySelector('.quote-professional'),'Shared template did not apply');window.designerHistory('z');await wait(20);check(!document.querySelector('.quote-professional'),'Template replacement cannot be undone');
    const restoredPaper=document.querySelector('[aria-label="Document page size"]');restoredPaper.value='A4';restoredPaper.dispatchEvent(new Event('change',{bubbles:true}));await wait(20);
    const tools=document.querySelector('.document-tools');tools.querySelector('details').open=true;
    const sectionTitle=tools.querySelector('input:not([type=checkbox])'),sectionBody=tools.querySelector('textarea');sectionTitle.value='Plant features';sectionTitle.dispatchEvent(new Event('input',{bubbles:true}));sectionBody.value='Carbon filter\\nAutomatic backwash';sectionBody.dispatchEvent(new Event('input',{bubbles:true}));tools.querySelector('input[type=checkbox]').click();await wait(20);button('Add section').click();await wait(30);
    const added=document.querySelector('.quote-paper .section-border');check(added&&added.querySelector('h3').textContent==='Plant features'&&added.textContent.includes('• Automatic backwash'),'Shared custom section not rendered');
    window.designerHistory('z');await wait(20);check(!document.querySelector('.quote-paper').textContent.includes('Plant features'),'Custom section undo failed');window.designerHistory('y');await wait(20);check(document.querySelector('.quote-paper').textContent.includes('Plant features'),'Custom section redo failed');
    document.querySelector('.quote-paper table').closest('section').click();await wait(20);
    fill('Minimum table row height','32');fill('Minimum table header height','12');fill('Table cell padding','2');fill('Table body text size','12');fill('Table header text size','10');fill('Table vertical alignment','middle');fill('Table image width','30');fill('Table image height','20');fill('Table image placement','above');fill('Quote table width','80');
    document.querySelector('[aria-label="Show table product images"]').click();fill('Quote name column width','40');await wait(30);
    const itemTable=document.querySelector('.quote-paper table'),thumb=itemTable.querySelector('.quote-item-image');
    check(Math.abs(thumb.getBoundingClientRect().width / .75 - 30*96/25.4)<2,'Table image width not applied');check(Math.abs(thumb.getBoundingClientRect().height / .75 - 20*96/25.4)<2,'Table image height not applied');
    check(itemTable.querySelector('tbody tr').getBoundingClientRect().height / .75 >= 32*96/25.4-1,'Minimum row height ignored');check(itemTable.classList.contains('images-above')&&getComputedStyle(itemTable.querySelector('td')).verticalAlign==='middle','Table image placement/alignment missing');
    check(Math.abs(parseFloat(getComputedStyle(itemTable.querySelector('td')).fontSize)-16)<.2,'Table body text size ignored');check(Math.abs(itemTable.getBoundingClientRect().width/(document.querySelector('.quote-paper').getBoundingClientRect().width-32*96/25.4*.75)-.8)<.01,'Table width ignored');
    const divider=itemTable.querySelector('[aria-label="Resize Item column"]'),beforeColumn=Number(document.querySelector('[aria-label="Quote name column width"]').value);
    divider.setPointerCapture=()=>{};divider.hasPointerCapture=()=>false;divider.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:9,button:0,clientX:200}));divider.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:9,clientX:230}));divider.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:9}));await wait(20);
    check(Number(document.querySelector('[aria-label="Quote name column width"]').value)>beforeColumn,'Dragging column divider did not resize');window.designerHistory('z');await wait(20);check(Math.abs(Number(document.querySelector('[aria-label="Quote name column width"]').value)-beforeColumn)<.2,'Column resize undo did not restore');
    itemTable.querySelector('[aria-label="Resize Item column"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await wait(20);check(Number(document.querySelector('[aria-label="Quote name column width"]').value)>beforeColumn,'Keyboard column resize failed');window.designerHistory('z');await wait(20);
    button('Add header image').click();await wait(20);
    const imageInput=document.querySelector('[aria-label="Upload quote design image"]');
    const canvas=document.createElement('canvas');canvas.width=120;canvas.height=30;const ctx=canvas.getContext('2d');ctx.fillStyle='#f97316';ctx.fillRect(0,0,120,30);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const transfer=new DataTransfer();transfer.items.add(new File([blob,new Uint8Array(400000)],'header.png',{type:'image/png'}));imageInput.files=transfer.files;imageInput.dispatchEvent(new Event('change',{bubbles:true}));for(let i=0;i<150&&!document.querySelector('.quote-paper img');i++)await wait(20);
    check(!!document.querySelector('.quote-paper img'),'Uploaded header not previewed');fill('Quote image description','Header banner');
    button('Add footer image').click();await wait(20);const footerInput=document.querySelector('[aria-label="Upload quote design image"]');const footerTransfer=new DataTransfer();footerTransfer.items.add(new File([blob],'footer.png',{type:'image/png'}));footerInput.files=footerTransfer.files;footerInput.dispatchEvent(new Event('change',{bubbles:true}));for(let i=0;i<150&&document.querySelectorAll('.quote-paper img').length!==2;i++)await wait(20);check(document.querySelectorAll('.quote-paper img').length===2,'Footer upload failed '+document.body.textContent);fill('Quote image description','Footer banner');
    button('Add text').click();await wait(20);fill('Quote design text','Custom quote footer');await wait(20);
    check(document.querySelector('.quote-paper').textContent.includes('Custom quote footer'),'Text did not update');
    window.designerHistory('z');await wait(20);check(!document.querySelector('.quote-paper').textContent.includes('Custom quote footer'),'Design undo failed');window.designerHistory('y');await wait(20);check(document.querySelector('.quote-paper').textContent.includes('Custom quote footer'),'Design redo failed');
    const textRow=[...document.querySelectorAll('[aria-label="Quote design sections"] li')].find(el=>el.textContent.includes('Custom quote footer'));textRow.querySelector('[aria-label$=" up"]').click();await wait(20);
    document.querySelector('[data-section-id="quote-3"]').click();await wait(20);fill('Quote name column heading','Description');await wait(20);check(document.querySelector('.quote-paper th:nth-child(2)').textContent==='Description','Table heading did not update');
    button('Add image').click();await wait(20);check(document.querySelector('[aria-label="Quote image placement"]').value==='absolute','Free image placement missing');fill('Quote image left','30');fill('Quote image top','40');await wait(20);
    const imageId=document.querySelector('[aria-label="Quote design sections"] button[aria-pressed="true"]').getAttribute('aria-label').replace('Select quote section ','');
    const box=document.querySelector('[data-section-id="'+imageId+'"]'),gestureRoot=document.querySelector('.quote-editing-canvas');gestureRoot.setPointerCapture=()=>{};gestureRoot.hasPointerCapture=()=>false;box.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:22,button:0,clientX:100,clientY:100}));box.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:22,clientX:130,clientY:130}));box.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:22,clientX:130,clientY:130}));await wait(20);
    check(Number(document.querySelector('[aria-label="Quote image left"]').value)>30&&Number(document.querySelector('[aria-label="Quote image top"]').value)>40,'Quote image drag did not update position');
    button('Delete section').click();await wait(20);
    button('Add live field').click();await wait(20);fill('Link to data','clientName');await wait(20);check(document.querySelectorAll('.quote-paper .preserve-lines').length>0,'Live field missing');
    button('Page setup').click();await wait(20);fill('Quote accent colour','#c2410c');await wait(20);button('Save design').click();await wait(70);
    check(document.querySelector('.document-design-page')&&document.querySelector('.inspector-save-state').textContent==='All changes saved','Design not saved in place: '+JSON.stringify({status:document.querySelector('.inspector-save-state')?.textContent,errors:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent)}));document.querySelector('[aria-label="Back from quote designer"]').click();await wait(80);
    button('Preference').click();await wait(40);button('Design quote').click();await wait(50);
    check(document.querySelectorAll('.quote-paper img').length===2&&document.querySelector('.quote-paper').textContent.includes('Custom quote footer'),'Saved design did not reload '+JSON.stringify({images:document.querySelectorAll('.quote-paper img').length,text:document.querySelector('.quote-paper')?.textContent,sections:window.quoteFixture.calls.filter(c=>c.url==='/api/quotes/preferences'&&c.method==='PUT').at(-1)?.body.documentDesign.sections.map(s=>({kind:s.kind,text:s.text,image:!!s.image}))}));
    check(document.querySelector('.quote-paper').style.getPropertyValue('--quote-accent')==='#c2410c','Design style did not persist');
    document.querySelector('[aria-label="Back from quote designer"]').click();await wait(60);button('Preference').click();await wait(40);check(!document.querySelector('.document-design-page')&&document.querySelector('[aria-label="Quote preferences"]'),'Returning from designer lost preferences');button('Cancel').click();await wait(30);

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
    check(document.querySelector('.quote-paper h1').textContent==='SALES ORDER','Wrong sales order design heading');button('Add text').click();await wait(20);fill('Quote design text','Order design footer');await wait(20);button('Save design').click();await wait(60);document.querySelector('[aria-label="Back from sales order designer"]').click();await wait(60);
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
  assert.ok(await evaluate(`await window.quoteFixture.router.push('/erp/quotes');await new Promise(r=>setTimeout(r,100));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Preference').click();await new Promise(r=>setTimeout(r,50));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Design quote').click();await new Promise(r=>setTimeout(r,60));return document.querySelector('.document-design-page').scrollWidth<=window.innerWidth+1&&document.querySelector('.design-properties').getBoundingClientRect().width<=window.innerWidth`))
  // Exercise the canvas with real browser pointer capture at two zoom levels.
  await pageCommand('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await evaluate(`
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const label=name=>document.querySelector('[aria-label="'+name+'"]');
    const set=async(name,value)=>{const input=label(name);if(!input)throw Error('Missing '+name);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));await wait(30)};
    if(label('Toggle layers panel').getAttribute('aria-pressed')!=='true')label('Toggle layers panel').click();
    label('Add shape layer').click();await wait(40);
    await set('Element X',40);await set('Element Y',150);await set('Element width',40);await set('Element height',20);
    window.canvasShapeId=document.querySelector('.layer-select[aria-pressed="true"]').getAttribute('aria-label').replace('Select quote section ','');
    label('Element fill').value='#fef3c7';label('Element fill').dispatchEvent(new Event('input',{bubbles:true}));
    label('Add text layer').click();await wait(40);
    label('Quote design text').value='Editable canvas text';label('Quote design text').dispatchEvent(new Event('input',{bubbles:true}));await wait(30);
    await set('Element X',30);await set('Element Y',100);await set('Element width',75);await set('Element height',15);
    window.canvasTextId=document.querySelector('.layer-select[aria-pressed="true"]').getAttribute('aria-label').replace('Select quote section ','');
    if(label('Snap to elements').getAttribute('aria-pressed')==='true')label('Snap to elements').click();
    document.querySelector('.canvas-scroll').scrollTop=0;
    window.canvasBox=()=>{const e=document.querySelector('[data-section-id="'+window.canvasTextId+'"]'),r=e.getBoundingClientRect();return {x:parseFloat(e.style.left),y:parseFloat(e.style.top),width:parseFloat(e.style.width),height:parseFloat(e.style.minHeight),screenX:r.x+15,screenY:r.y+r.height/2,scale:document.querySelector('.quote-paper').getBoundingClientRect().width/210}};
    return true;
  `)
  const beforeMove = await evaluate('return window.canvasBox()')
  const mouse = (type: string, x: number, y: number, extra: any = {}) => pageCommand('Input.dispatchMouseEvent', { type, x, y, ...extra })
  await mouse('mousePressed', beforeMove.screenX, beforeMove.screenY, { button: 'left', clickCount: 1 })
  await mouse('mouseMoved', beforeMove.screenX + 28, beforeMove.screenY + 20, { button: 'left', buttons: 1 })
  await mouse('mouseReleased', beforeMove.screenX + 28, beforeMove.screenY + 20, { button: 'left', clickCount: 1 })
  const afterMove = await evaluate('await new Promise(r=>setTimeout(r,40));return window.canvasBox()')
  assert.ok(Math.abs(afterMove.x - beforeMove.x - 28 / beforeMove.scale) < .2, 'Real pointer move should use the current canvas zoom')
  assert.ok(Math.abs(afterMove.y - beforeMove.y - 20 / beforeMove.scale) < .2)
  const resizePoint = await evaluate(`const r=document.querySelector('[aria-label="Resize selection bottom right"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}`)
  await mouse('mousePressed', resizePoint.x, resizePoint.y, { button: 'left', clickCount: 1 })
  await mouse('mouseMoved', resizePoint.x + 30, resizePoint.y + 20, { button: 'left', buttons: 1 })
  await mouse('mouseReleased', resizePoint.x + 30, resizePoint.y + 20, { button: 'left', clickCount: 1 })
  const afterResize = await evaluate('await new Promise(r=>setTimeout(r,40));return window.canvasBox()')
  assert.ok(afterResize.width > afterMove.width + 9 && afterResize.height > afterMove.height + 6, 'Resize handles should change the printable frame')
  await evaluate(`const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);window.designerHistory('z');await new Promise(r=>setTimeout(r,30));return true`)
  assert.equal((await evaluate('return window.canvasBox()')).width, afterMove.width, 'One gesture must be one undo step')
  await evaluate(`const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);window.designerHistory('y');await new Promise(r=>setTimeout(r,30));return true`)
  const beforeCancel = await evaluate('return window.canvasBox()')
  await mouse('mousePressed', beforeCancel.screenX, beforeCancel.screenY, { button: 'left', clickCount: 1 })
  await mouse('mouseMoved', beforeCancel.screenX + 35, beforeCancel.screenY + 15, { button: 'left', buttons: 1 })
  await pageCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await mouse('mouseReleased', beforeCancel.screenX + 35, beforeCancel.screenY + 15, { button: 'left', clickCount: 1 })
  const afterCancel = await evaluate('await new Promise(r=>setTimeout(r,30));return window.canvasBox()')
  assert.equal(afterCancel.x, beforeCancel.x, 'Escape must restore a cancelled drag')
  assert.equal(afterCancel.y, beforeCancel.y)
  assert.ok(await evaluate(`
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),label=name=>document.querySelector('[aria-label="'+name+'"]');
    const key=(key,options={})=>document.querySelector('.quote-editing-canvas').dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,...options}));
    const check=(ok,message)=>{if(!ok)throw Error(message)};
    const shape=()=>document.querySelector('[data-section-id="'+window.canvasShapeId+'"]'),text=()=>document.querySelector('[data-section-id="'+window.canvasTextId+'"]');
    label('Select quote section '+window.canvasShapeId).dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));await wait(30);
    check(document.querySelectorAll('.layer-select[aria-pressed="true"]').length===2,'Shift selection failed');
    label('Group selection').click();await wait(30);label('Select quote section '+window.canvasTextId).click();await wait(30);
    check(document.querySelectorAll('.layer-select[aria-pressed="true"]').length===2,'Grouped layers did not select together');
    const x1=parseFloat(text().style.left),x2=parseFloat(shape().style.left);key('ArrowRight');await wait(30);
    check(Math.abs(parseFloat(text().style.left)-x1-.5)<.1&&Math.abs(parseFloat(shape().style.left)-x2-.5)<.1,'Grouped keyboard nudge failed');
    label('Align top').click();await wait(30);check(Math.abs(parseFloat(text().style.top)-parseFloat(shape().style.top))<.1,'Multi-layer alignment failed');
    const count=document.querySelectorAll('[data-section-id]').length;
    key('d',{ctrlKey:true});await wait(30);check(document.querySelectorAll('[data-section-id]').length===count+2,'Group duplicate failed');
    key('Delete');await wait(30);check(document.querySelectorAll('[data-section-id]').length===count,'Delete selection failed');
    label('Select quote section '+window.canvasTextId).click();await wait(30);key('c',{ctrlKey:true});key('v',{ctrlKey:true});await wait(30);
    check(document.querySelectorAll('[data-section-id]').length===count+2,'Copy/paste layers failed');key('Delete');await wait(30);
    label('Select quote section '+window.canvasTextId).click();await wait(30);key('l',{ctrlKey:true,shiftKey:true});await wait(30);
    const lockedX=parseFloat(text().style.left);key('ArrowRight');key('Delete');await wait(30);
    check(text()&&parseFloat(text().style.left)===lockedX,'Locked layers changed');key('l',{ctrlKey:true,shiftKey:true});await wait(30);
    key('g',{ctrlKey:true,shiftKey:true});await wait(30);label('Select quote section '+window.canvasTextId).click();await wait(30);
    text().dispatchEvent(new MouseEvent('dblclick',{bubbles:true,detail:2}));await wait(30);
    const inline=label('Edit text on canvas');check(inline,'Double-click did not open text editing');inline.value='Changed directly on canvas';inline.dispatchEvent(new Event('input',{bubbles:true}));inline.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));await wait(30);
    check(text().textContent.includes('Changed directly on canvas'),'Inline edit was not committed');
    label('Element opacity').value='70';label('Element opacity').dispatchEvent(new Event('change',{bubbles:true}));await wait(30);
    check(Math.abs(Number(getComputedStyle(text()).opacity)-.7)<.01,'Opacity missing from rendered document');
    key('Delete');await wait(30);document.querySelector('[data-section-id="quote-3"]').click();await wait(30);key('Delete');await wait(30);
    check(document.querySelector('[data-section-id="quote-3"]'),'Required table was deleted');
    document.querySelector('[data-section-id="quote-4"]').click();await wait(30);key('d',{ctrlKey:true});await wait(30);
    check(document.querySelectorAll('[data-section-id="quote-4"]').length===1&&document.querySelectorAll('[data-section-id]').length===count-1,'Required totals was copied');
    label('Select quote section '+window.canvasShapeId).click();await wait(30);
    label('Preview zoom').value='150';label('Preview zoom').dispatchEvent(new Event('change',{bubbles:true}));await wait(30);
    document.querySelector('.canvas-scroll').scrollTop=500;document.querySelector('.canvas-scroll').scrollLeft=0;
    return true;
  `))
  const zoomBefore = await evaluate(`const e=document.querySelector('[data-section-id="'+window.canvasShapeId+'"]');e.scrollIntoView({block:'center',inline:'center'});await new Promise(r=>setTimeout(r,30));const r=e.getBoundingClientRect();return {x:parseFloat(e.style.left),y:parseFloat(e.style.top),screenX:r.x+20,screenY:r.y+r.height/2,scale:document.querySelector('.quote-paper').getBoundingClientRect().width/210}`)
  await mouse('mousePressed', zoomBefore.screenX, zoomBefore.screenY, { button: 'left', clickCount: 1 })
  await mouse('mouseMoved', zoomBefore.screenX + 40, zoomBefore.screenY, { button: 'left', buttons: 1 })
  await mouse('mouseReleased', zoomBefore.screenX + 40, zoomBefore.screenY, { button: 'left', clickCount: 1 })
  const zoomAfter = await evaluate(`await new Promise(r=>setTimeout(r,30));return parseFloat(document.querySelector('[data-section-id="'+window.canvasShapeId+'"] ').style.left)`)
  assert.ok(Math.abs(zoomAfter - zoomBefore.x - 40 / zoomBefore.scale) < .2, 'Movement must stay accurate at 150% zoom')
  await evaluate(`document.querySelector('[aria-label="Preview zoom"]').value='75';document.querySelector('[aria-label="Preview zoom"]').dispatchEvent(new Event('change',{bubbles:true}));return true`)
  await evaluate(`document.querySelector('[aria-label="Back from quote designer"]').click();await new Promise(r=>setTimeout(r,60));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Preference').click();await new Promise(r=>setTimeout(r,40));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Cancel').click();await window.quoteFixture.router.push('/erp/quotes/add?entryCompany=company');await new Promise(r=>setTimeout(r,100));const input=document.querySelector('[aria-label="Item 1 name"]');const original=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('Quota full','QuotaExceededError')};input.value='Draft without storage';input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,20));let confirms=0;window.confirm=()=>{confirms++;return false};[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Back to quotes').click();await new Promise(r=>setTimeout(r,40));const guarded=confirms===1&&location.pathname==='/erp/quotes/add'&&[...document.querySelectorAll('[role="alert"]')].some(el=>el.textContent.includes('Could not keep the local draft'));Storage.prototype.setItem=original;window.confirm=()=>true;if(!guarded)throw Error('Storage failure silently discarded the quote');input.value='Restore after refresh';input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,20));return true`)
  await pageCommand('Page.reload')
  assert.ok(await evaluate(`for(let i=0;i<100&&!document.querySelector('[aria-label="Search quotes"]');i++)await new Promise(r=>setTimeout(r,50));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add quote').click();await new Promise(r=>setTimeout(r,100));return document.querySelector('[aria-label="Item 1 name"]').value==='Restore after refresh'&&document.querySelector('[aria-label="Quote status"]').value==='SENT'`))
  if (process.env.QUOTE_DESIGN_SCREENSHOT) await evaluate(`await window.quoteFixture.router.push('/erp/quotes');await new Promise(r=>setTimeout(r,80));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Preference').click();await new Promise(r=>setTimeout(r,50));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Design quote').click();await new Promise(r=>setTimeout(r,40));return true`)
  if (process.env.QUOTE_DESIGN_SCREENSHOT) {
    await pageCommand('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    if (process.env.QUOTE_TABLE_SCREENSHOT) await evaluate(`if(document.querySelector('[aria-label="Toggle layers panel"]').getAttribute('aria-pressed')!=='true')document.querySelector('[aria-label="Toggle layers panel"]').click();document.querySelector('.quote-paper table').closest('section').click();await new Promise(r=>setTimeout(r,80));return true`)
    await evaluate(`await new Promise(r=>setTimeout(r,100));return true`)
    const screenshot = await pageCommand('Page.captureScreenshot', { format: 'png' })
    writeFileSync(resolve(cache, 'quote-designer.png'), Buffer.from(screenshot.data, 'base64'))
  }
  await command('Browser.close').catch(() => {})
})
