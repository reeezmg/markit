import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { build } from 'esbuild'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import colors from 'tailwindcss/colors.js'
import { runUiBrowser } from './run-ui-browser.mjs'

const browser = [process.env.PRINT_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file => file && fs.existsSync(file))
if (!browser) throw Error('A Chromium browser is required')
const fixtureName=process.argv[2]||'connect-whatsapp-browser.html'
if(!['connect-whatsapp-browser.html','whatsapp-notifications-browser.html'].includes(fixtureName))throw Error('Unknown WhatsApp browser fixture')
const html = fs.readFileSync('tests/'+fixtureName, 'utf8'), script = html.match(/<script type="module">([\s\S]*?)<\/script>/)
const bundle = await build({ stdin: { contents: script[1], resolveDir: path.resolve('tests'), loader: 'ts' }, bundle: true, write: false, platform: 'browser', format: 'esm',
  alias: { '#imports': path.resolve('tests/after-sales-ui-runtime.ts'), '#app': path.resolve('tests/after-sales-ui-runtime.ts'), '#build/app.config': path.resolve('tests/after-sales-ui-runtime.ts'), '#ui': path.resolve('node_modules/@nuxt/ui/dist/runtime') },
  define: { 'process.env.NODE_ENV': '"development"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', 'import.meta.dev':'true','import.meta.client':'true','import.meta.server':'false' },
  plugins: [{ name: 'connect-vue', setup(builder) { builder.onLoad({ filter: /\.vue$/ }, args => {
    const { descriptor } = parse(fs.readFileSync(args.path, 'utf8'), { filename: args.path })
    let content = compileScript(descriptor, { id: args.path, inlineTemplate: true }).content
    if (!descriptor.scriptSetup && descriptor.template) {
      const compiled = compileTemplate({ source: descriptor.template.content, filename: args.path, id: args.path })
      if (compiled.errors.length) throw Error(compiled.errors.join('\n'))
      content = content.replace('export default', 'const component =') + '\n' + compiled.code.replace('export function render', 'function render') + '\ncomponent.render=render; export default component;'
    }
    return { contents: content, loader: 'ts', resolveDir: path.dirname(args.path) }
  }) } }],
})
const rawStyles = '@tailwind base;@tailwind components;@tailwind utilities;' + ['WhatsAppWorkspace.vue','WhatsAppNotifications.vue'].map(file=>fs.readFileSync('components/Connect/'+file,'utf8').match(/<style scoped>([\s\S]*?)<\/style>/)[1]).join('\n')
const css = await postcss([tailwind({ content: ['components/Connect/**/*.vue','node_modules/@nuxt/ui/dist/runtime/components/**/*.vue','node_modules/@nuxt/ui/dist/runtime/ui.config/**/*.js'], theme:{extend:{colors:{primary:colors.orange}}}, darkMode:'class' })]).process(rawStyles,{from:undefined})
const fixture = html.replace(script[0], '<script type="module">'+bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>').replace('</head>','<style>'+css.css+'</style></head>')
const server = createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture)})
const profile = fs.mkdtempSync(path.join(os.tmpdir(),'markit-connect-test-'))
try {
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const output=await runUiBrowser({browser,profile,url:`http://127.0.0.1:${server.address().port}/`,size:process.env.PRINT_TEST_WINDOW_SIZE||'1347,667',timeout:45000,screenshot:process.env.PRINT_TEST_SCREENSHOT})
  console.log(output.result);if(!output.result.includes('ALL PASSED'))process.exitCode=1
} finally {
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
  if(path.dirname(path.resolve(profile))!==path.resolve(os.tmpdir())||!path.basename(profile).startsWith('markit-connect-test-'))throw Error('Unexpected browser profile path')
  try{await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch(error){if(!['EPERM','EBUSY','ENOTEMPTY'].includes(error.code))throw error}
}
