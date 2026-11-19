import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { build } from 'esbuild'
import { parse, compileScript, compileTemplate, registerTS } from '@vue/compiler-sfc'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import colors from 'tailwindcss/colors.js'
import { runUiBrowser } from './run-ui-browser.mjs'
registerTS(()=>ts)
const browser=[process.env.PRINT_TEST_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>p&&fs.existsSync(p))
if(!browser)throw Error('Chromium is required for CRM browser checks')
const html=fs.readFileSync('tests/crm-browser.html','utf8'),script=html.match(/<script type="module">([\s\S]*?)<\/script>/)
const bundle=await build({stdin:{contents:script[1],resolveDir:path.resolve('tests'),loader:'ts'},bundle:true,write:false,platform:'browser',format:'esm',
 alias:{'#imports':path.resolve('tests/after-sales-ui-runtime.ts'),'#app':path.resolve('tests/after-sales-ui-runtime.ts'),'#build/app.config':path.resolve('tests/after-sales-ui-runtime.ts'),'#ui':path.resolve('node_modules/@nuxt/ui/dist/runtime')},
 define:{'process.env.NODE_ENV':'"development"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false','import.meta.dev':'true','import.meta.client':'true','import.meta.server':'false'},
 plugins:[{name:'crm-vue',setup(builder){builder.onLoad({filter:/\.vue$/},args=>{const {descriptor}=parse(fs.readFileSync(args.path,'utf8'),{filename:args.path});let content=compileScript(descriptor,{id:args.path,inlineTemplate:true,fs:{fileExists:fs.existsSync,readFile:p=>fs.readFileSync(p,'utf8')}}).content
  if(!descriptor.scriptSetup&&descriptor.template){const template=compileTemplate({source:descriptor.template.content,filename:args.path,id:args.path});if(template.errors.length)throw Error(template.errors.join('\n'));content=content.replace('export default','const component =')+'\n'+template.code.replace('export function render','function render')+'\ncomponent.render=render;export default component;'}return {contents:content,loader:'ts',resolveDir:path.dirname(args.path)}})}}]})
const styles=[...fs.readFileSync('components/CRM/Workspace.vue','utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')
const css=await postcss([tailwind({content:['components/CRM/**/*.vue','node_modules/@nuxt/ui/dist/runtime/components/**/*.vue','node_modules/@nuxt/ui/dist/runtime/ui.config/**/*.js'],theme:{extend:{colors:{primary:colors.orange}}},darkMode:'class'})]).process('@tailwind base;@tailwind components;@tailwind utilities;'+styles,{from:undefined})
const fixture=html.replace(script[0],'<script type="module">'+bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>').replace('</head>','<style>#result{display:none}'+css.css+'</style></head>')
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fixture)}),profile=fs.mkdtempSync(path.join(os.tmpdir(),'markit-crm-test-'))
try{server.listen(0,'127.0.0.1');await once(server,'listening');const output=await runUiBrowser({browser,profile,url:`http://127.0.0.1:${server.address().port}/`,size:process.env.PRINT_TEST_WINDOW_SIZE||(process.argv.includes('--mobile')?'390,844':'1347,900'),timeout:120000,screenshot:process.env.PRINT_TEST_SCREENSHOT});console.log(output.result);if(!output.result.includes('ALL PASSED'))process.exitCode=1}
finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(path.dirname(path.resolve(profile))!==path.resolve(os.tmpdir())||!path.basename(profile).startsWith('markit-crm-test-'))throw Error('Unexpected test profile');try{await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch(e){if(!['EPERM','EBUSY','ENOTEMPTY'].includes(e.code))throw e}}
