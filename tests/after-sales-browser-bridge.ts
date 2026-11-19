import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'

/** HTTP access to real handlers inside the API suite's outer rollback transaction. */
export async function runAfterSalesBrowser(context: any, dispatch: (path: string, method: string, body: any, query: string) => Promise<any>, page = 'after-sales-e2e-browser.html') {
  // The browser sends concurrent list reads; serialize transactions sharing one
  // rollback connection so their savepoints can never interleave.
  let queue = Promise.resolve()
  const server = createServer((req, res) => {
    queue = queue.then(async () => {
      res.setHeader('Content-Type', 'application/json')
      try {
        const url = new URL(req.url!, 'http://127.0.0.1')
        let raw = ''; for await (const chunk of req) raw += chunk
        const result = url.pathname === '/api/fixture-context' ? context :
          await dispatch(url.pathname, req.method!, raw ? JSON.parse(raw) : {}, url.search)
        res.end(JSON.stringify(result))
      } catch (error: any) {
        res.statusCode = error.statusCode || 500
        res.end(JSON.stringify({ statusMessage: error.statusMessage || error.message }))
      }
    })
  })
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const address = server.address() as { port: number }
    const child = spawn(process.execPath, ['tests/run-print-template-browser.mjs', page], {
      windowsHide: true, env: { ...process.env, AFTER_SALES_E2E_API: `http://127.0.0.1:${address.port}`, PRINT_TEST_TIMEOUT_MS: '240000' }, stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk) })
    child.stderr.on('data', chunk => { output += chunk })
    const timeout = setTimeout(() => child.kill(), 300000)
    try {
      const [code] = await once(child, 'exit')
      assert.equal(code, 0, output)
      assert.match(output, /ALL PASSED/)
    } finally { clearTimeout(timeout); child.kill() }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await queue }
}
