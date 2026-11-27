import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

/** Real browser time is required for Headless UI's animation-frame lifecycle. */
export async function runUiBrowser({ browser, url, profile, screenshot, size = '1347,667', timeout = 120000, failOnRuntimeError = false }) {
  const child = spawn(browser, ['--headless', '--disable-gpu', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
  const deadline = Date.now() + timeout
  let socket
  const pending = new Map()
  let sequence = 0
  let stage='browser startup', lastResult='', browserError=''
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence
    stage=method
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  let timer
  const work = async () => {
    const active = path.join(profile, 'DevToolsActivePort')
    let port, endpoint
    while (!port || !endpoint) {
      if (Date.now() > deadline) throw Error('Browser startup timed out')
      try { [port, endpoint] = fs.readFileSync(active, 'utf8').trim().split('\n') }
      catch (error) { if (!['ENOENT','EBUSY','EACCES'].includes(error.code)) throw error }
      if (!port || !endpoint) await pause(100)
    }
    socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    socket.onmessage = event => {
      const data = JSON.parse(event.data), task = pending.get(data.id)
      if(data.method==='Runtime.exceptionThrown')browserError=data.params.exceptionDetails.exception?.description||data.params.exceptionDetails.text
      if (task) { pending.delete(data.id); data.error ? task.reject(Error(data.error.message)) : task.resolve(data.result) }
    }
    const { targetId } = await command('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true })
    const run = (method, params) => command(method, params, sessionId)
    const [width, height] = size.split(',').map(Number)
    await run('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await run('Page.enable')
    await run('Runtime.enable')
    await run('Page.navigate', { url })
    while (Date.now() <= deadline) {
      const value = await run('Runtime.evaluate', { expression: 'document.querySelector("#result")?.textContent||""', returnByValue: true })
      lastResult=value.result?.value||''
      if (/ALL PASSED|FAILED|PREVIEW READY/.test(value.result?.value || '')) {
        if (failOnRuntimeError && browserError) throw Error(`Browser runtime error: ${browserError}`)
        if (screenshot) { const shot = await run('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.resolve(screenshot), Buffer.from(shot.data, 'base64')) }
        // The bundled source is large; only the result marker is needed by the runner.
        return { result: `<pre id="result">${lastResult}</pre>`, errors: '' }
      }
      await pause(50)
    }
    throw Error(`UI browser check timed out (${stage}; ${lastResult}; ${browserError})`)
  }
  try {
    return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`UI browser check timed out (${stage}; ${lastResult}; ${browserError})`)), timeout) })])
  } finally {
    clearTimeout(timer)
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: ++sequence, method: 'Browser.close' }))
    socket?.close()
    child.kill()
  }
}
