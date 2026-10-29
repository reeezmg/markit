import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { build } from 'esbuild';
import { parse, compileScript } from '@vue/compiler-sfc';
import postcss from 'postcss';
import tailwind from 'tailwindcss';

test('Chrome desktop/mobile: full-page distributor form defaults, edit choices, retry and one Save', { timeout: 120000 }, async t => {
  const browser = [process.env.DISTRIBUTOR_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(path => path && existsSync(path));
  assert.ok(browser, 'Install Chrome/Edge or set DISTRIBUTOR_TEST_BROWSER');
  const entry = `
    import * as Vue from 'vue';
    import Form from './components/Distributor/Form.vue';
    const {ref,reactive,h,nextTick}=Vue;
    const fields={payable:'ACCOUNTS_PAYABLE',stock:'STOCK',tax:'OTHER_CURRENT_ASSET',cash:'CASH',bank:'BANK',opening:'EQUITY'};
    const accounts=Object.entries(fields).map(([id,accountType])=>({id,accountType,name:id}));
    accounts.push({id:'custom-cash',accountType:'CASH',name:'Custom cash'});
    const defaults=Object.fromEntries(Object.keys(fields).map(role=>[role,role]));
    const calls=[],events=[],toasts=[];
    let failSave=true;
    const props=reactive({companyId:'branch',selectedSupplier:null});
    const scope={companyId:ref('branch'),ready:Promise.resolve(),beginForm:async()=>{},selectOwner:async id=>{scope.companyId.value=id},
      fetch:async(url,options={})=>{
        calls.push({url,...options});
        if(url.endsWith('/form'))return {accounts,mappings:props.selectedSupplier?{...defaults,cash:'custom-cash'}:defaults,canManageAccounts:true,
          enabled:!!props.selectedSupplier,distributor:props.selectedSupplier?{id:'supplier',name:'Existing distributor',address:{city:'Existing city'}}:null,openingDue:0};
        if(failSave){failSave=false;throw Error('Temporary save failure')}
        return {distributor:{id:'supplier',name:options.body.name}};
      }};
    Object.assign(globalThis,Vue,{useCompanyScope:()=>scope,useModelCache:()=>({invalidateModels:async()=>{}}),useToast:()=>({add:t=>toasts.push(t)})});
    const app=Vue.createApp({setup:()=>()=>h(Form,{...props,onSaved:value=>events.push(value),onCancel:()=>events.push('cancel')})});
    app.config.errorHandler=error=>{document.querySelector('#result').textContent='FAIL '+error.stack};
    app.component('CompanyFormField',{setup:()=>()=>h('div','Company: Branch')});
    app.component('UButton',{props:{label:String,type:{default:'button'},disabled:Boolean,loading:Boolean},setup(p,{attrs,slots}){return()=>h('button',{...attrs,type:p.type,disabled:p.disabled||p.loading,class:'rounded-md border px-3 py-2 text-sm'},p.label||slots.default?.())}});
    app.component('UFormGroup',{props:['label','required'],setup(p,{slots}){return()=>h('label',{class:'block text-sm'},[h('span',{class:'mb-1 block font-medium'},p.label),slots.default?.()])}});
    app.component('UInput',{props:['modelValue','type'],emits:['update:modelValue'],setup(p,{attrs,emit}){return()=>h('input',{...attrs,class:'block w-full rounded-md border px-3 py-2',type:p.type||'text',value:p.modelValue,onInput:e=>emit('update:modelValue',p.type==='number'?Number(e.target.value):e.target.value)})}});
    app.component('USelectMenu',{props:['modelValue','options'],emits:['update:modelValue'],setup(p,{emit}){return()=>h('select',{class:'block w-full rounded-md border px-3 py-2',value:p.modelValue,onChange:e=>emit('update:modelValue',e.target.value)},[h('option',{value:''},'Select an account'),...p.options.map(o=>h('option',{value:o.value},o.label))])}});
    app.component('UCheckbox',{props:['modelValue','label'],emits:['update:modelValue'],setup(p,{emit}){return()=>h('label',[h('input',{type:'checkbox',checked:p.modelValue,onChange:e=>emit('update:modelValue',e.target.checked)}),p.label])}});
    app.component('UBadge',{setup(p,{slots}){return()=>h('span',slots.default?.())}});
    app.component('UAlert',{props:['title','description'],setup(p,{slots}){return()=>h('div',[p.title,p.description,slots.actions?.()])}});
    app.mount('#app');
    async function run(){
      const check=(value,message)=>{if(!value)throw Error(message)};
      const wait=()=>new Promise(r=>setTimeout(r,100));
      const controls=()=>[...document.querySelectorAll('select')];
      const button=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Save distributor and accounts');
      const input=label=>[...document.querySelectorAll('label')].find(l=>l.firstElementChild?.textContent===label)?.querySelector('input');
      const fill=(label,value)=>{const control=input(label);check(control,'Missing input '+label);control.value=value;control.dispatchEvent(new Event('input',{bubbles:true}))};
      await wait();await nextTick();
      check(controls().length===6,'All six account fields must render');
      check(controls().map(s=>s.value).sort().join(',')===Object.keys(fields).sort().join(','),'Company defaults were not selected');
      check(calls.every(c=>c.url.endsWith('/form')),'Opening the form wrote data');
      const footer=document.querySelector('footer').getBoundingClientRect();
      check(footer.bottom<=innerHeight+1&&footer.top>=0,'Save footer is outside the viewport');
      check(button().getBoundingClientRect().right<=innerWidth+1&&button().getBoundingClientRect().left>=0,'Save button is clipped');
      check(document.documentElement.scrollWidth<=innerWidth+1,'Form overflows horizontally');
      const cards=[...document.querySelectorAll('fieldset > section')];
      check(cards.length===5,'All sections must render');
      check(innerWidth<1024?Math.abs(cards[0].getBoundingClientRect().left-cards[1].getBoundingClientRect().left)<1:cards[1].getBoundingClientRect().left>cards[0].getBoundingClientRect().left,'Responsive section layout is wrong');
      fill('Distributor name','New distributor');fill('City','New city');await nextTick();button().click();await wait();
      check(toasts.some(t=>t.color==='red'),'Failed save feedback missing');
      check(input('Distributor name').value==='New distributor'&&controls()[3].value==='cash','Failed save lost inputs');
      check(events.length===0,'Failed save closed the form');
      button().click();await wait();
      const saves=calls.filter(c=>c.url.endsWith('/save'));
      check(saves.length===2&&saves[1].body.accountingAccounts.cash==='cash'&&saves[1].body.city==='New city','Save omitted profile/accounts');
      check(events.length===1,'Successful Save did not emit saved');
      props.selectedSupplier={id:'supplier'};await wait();await nextTick();
      check(controls()[3].value==='custom-cash','Edit overwrote supplier account choice');
      check(input('Distributor name').value==='Existing distributor','Edit did not load saved details');
      check(document.body.textContent.includes('Existing posted entries keep their saved accounts'),'Edit scope is not explained');
      document.querySelector('#result').textContent='PASS';
    }
    run().catch(error=>{document.querySelector('#result').textContent='FAIL '+error.stack});
  `;
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: 'distributor-browser-fixture.ts' },
    bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '~': process.cwd() },
    plugins: [{ name: 'distributor-vue', setup(builder) {
      builder.onLoad({ filter: /\.vue$/ }, args => {
        const { descriptor } = parse(readFileSync(args.path, 'utf8'), { filename: args.path });
        return { contents: compileScript(descriptor, { id: 'distributor', inlineTemplate: true }).content, loader: 'ts', resolveDir: dirname(args.path) };
      });
    } }],
  });
  const css = (await postcss([tailwind({ content: ['components/Distributor/Form.vue', { raw: entry, extension: 'ts' }], theme: { extend: {} } })]).process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style><div id="app"></div><pre id="result" hidden>RUNNING</pre><script>' + bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + '</script>');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const cache = resolve('node_modules/.cache/distributor-form-browser'); mkdirSync(cache, { recursive: true });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const profile = mkdtempSync(resolve(cache, 'profile-'));
    const { stdout } = await promisify(execFile)(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
      '--no-default-browser-check', `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--virtual-time-budget=5000', '--dump-dom',
      `--screenshot=${resolve(cache, name + '.png')}`, `http://127.0.0.1:${server.address().port}`], { timeout: 45000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    const result = stdout.match(/<pre id="result"[^>]*>([\s\S]*?)<\/pre>/)?.[1];
    assert.equal(result, 'PASS', `${name}: ${result || 'No browser result'}`);
  }
});
