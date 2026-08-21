import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import net from 'node:net'
import path from 'node:path'

const executablePath = process.argv[2]
const screenshotPath = process.argv[3] ?? path.resolve('artifacts', 'packaged-ui.png')
if (!executablePath) throw new Error('Usage: node scripts/verify-packaged.mjs <executable> [screenshot]')

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function reservePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function waitForTarget(port, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const target = targets.find(candidate => candidate.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+\/?/.test(candidate.url))
        if (target?.webSocketDebuggerUrl) return target
      }
    } catch (error) {
      lastError = error
    }
    await delay(500)
  }
  throw new Error(`Timed out waiting for packaged Web UI${lastError ? `: ${lastError.message}` : ''}`)
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  })
  socket.addEventListener('close', () => {
    for (const { reject } of pending.values()) reject(new Error('CDP connection closed'))
    pending.clear()
  })
  return {
    socket,
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
  }
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true
  return Promise.race([
    new Promise(resolve => child.once('exit', () => resolve(true))),
    delay(timeoutMs).then(() => false),
  ])
}

const debugPort = await reservePort()
const testUserData = await mkdtemp(path.join(tmpdir(), 'dsh-studio-packaged-'))
await writeFile(path.join(testUserData, 'studio-settings.json'), JSON.stringify({
  autoCheckUpdates: false,
  skin: { preset: 'custom', background: '#ff0000' },
}))

const child = spawn(executablePath, [
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${testUserData}`,
], {
  detached: false,
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false,
})
const processOutput = []
child.stdout.on('data', chunk => processOutput.push(chunk.toString()))
child.stderr.on('data', chunk => processOutput.push(chunk.toString()))

let cdp
let serviceUrl
try {
  const target = await waitForTarget(debugPort)
  serviceUrl = target.url
  cdp = await connectCdp(target.webSocketDebuggerUrl)
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  })

  let page
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const evaluation = await cdp.call('Runtime.evaluate', {
      expression: `JSON.stringify({
        title: document.title,
        url: location.href,
        readyState: document.readyState,
        htmlLength: document.documentElement?.outerHTML?.length ?? 0,
        studioAppearanceEntry: document.querySelector('#dsh-studio-appearance-button')?.textContent ?? null,
        studioThemeMarker: document.documentElement.dataset.dshStudioTheme ?? null
      })`,
      returnByValue: true,
    })
    page = JSON.parse(evaluation.result.value)
    if (page.readyState === 'complete' && page.htmlLength >= 1000) break
    await delay(100)
  }

  const response = await fetch(serviceUrl)
  const html = await response.text()
  if (!response.ok || page.readyState !== 'complete' || page.htmlLength < 1000) {
    throw new Error(`Packaged UI was not healthy: HTTP ${response.status}, ${page.readyState}, ${page.htmlLength} bytes`)
  }
  if (page.studioAppearanceEntry !== null || page.studioThemeMarker !== null) {
    throw new Error(`Studio appearance injection is still present: ${JSON.stringify(page)}`)
  }

  const capture = await cdp.call('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  })
  await mkdir(path.dirname(screenshotPath), { recursive: true })
  await writeFile(screenshotPath, Buffer.from(capture.data, 'base64'))

  process.stdout.write(`${JSON.stringify({
    executablePath,
    serviceUrl,
    httpStatus: response.status,
    responseBytes: Buffer.byteLength(html),
    page,
    screenshotPath,
  }, null, 2)}\n`)

  await cdp.call('Browser.close').catch(() => {})
  cdp.socket.close()
  if (!await waitForExit(child, 20_000)) throw new Error('Packaged app did not exit after Browser.close')

  let serviceStopped = false
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fetch(serviceUrl)
      await delay(250)
    } catch {
      serviceStopped = true
      break
    }
  }
  if (!serviceStopped) throw new Error('Harness service stayed reachable after the desktop app exited')
  process.stdout.write('Packaged app exited and its Harness service stopped.\n')
} catch (error) {
  if (cdp?.socket?.readyState === WebSocket.OPEN) cdp.socket.close()
  if (child.exitCode === null) child.kill()
  const output = processOutput.join('').trim()
  if (output) process.stderr.write(`${output}\n`)
  throw error
} finally {
  await rm(testUserData, { recursive: true, force: true }).catch(() => {})
}
