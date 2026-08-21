import { EventEmitter } from 'node:events'
import { appendFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import { createRuntimeBin, createServiceEnvironment } from './runtime-bin.mjs'

const ENDPOINT_PATTERN = /http:\/\/127\.0\.0\.1:(\d{1,5})(?:\/[^\s]*)?/
export const HARNESS_WEB_ARGS = Object.freeze(['web', '--port', '0', '--no-open'])

export function extractEndpoint(text) {
  const match = ENDPOINT_PATTERN.exec(text)
  if (match === null) return null
  const port = Number(match[1])
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return `http://127.0.0.1:${port}`
}

function exitDescription(code, signal) {
  if (signal !== null) return `signal ${signal}`
  return `exit code ${code ?? 'unknown'}`
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class ServiceSupervisor extends EventEmitter {
  #child = null
  #endpoint = null
  #expectedExit = false
  #startPromise = null
  #recentOutput = ''

  constructor(options) {
    super()
    this.options = {
      // A freshly installed unpacked dependency tree can be scanned file by
      // file by Windows security software before the first web boot.
      readyTimeoutMs: 180_000,
      stopTimeoutMs: 8_000,
      spawnProcess: spawn,
      fetch: globalThis.fetch,
      ...options,
    }
  }

  get endpoint() {
    return this.#endpoint
  }

  get recentOutput() {
    return this.#recentOutput
  }

  async start() {
    if (this.#endpoint !== null && this.#child !== null) return this.#endpoint
    if (this.#startPromise !== null) return this.#startPromise
    this.#startPromise = this.#start()
    try {
      return await this.#startPromise
    } finally {
      this.#startPromise = null
    }
  }

  async #start() {
    const options = this.options
    await Promise.all([
      mkdir(options.harnessHome, { recursive: true }),
      mkdir(options.workspaceRoot, { recursive: true }),
      mkdir(dirname(options.logPath), { recursive: true }),
      createRuntimeBin(options),
    ])

    this.#expectedExit = false
    this.#endpoint = null
    this.#recentOutput = ''
    const env = createServiceEnvironment(options)
    const child = options.spawnProcess(
      options.nodeExecutable,
      ['--expose-internals', options.runnerPath, options.cliPath, ...HARNESS_WEB_ARGS],
      {
        cwd: options.workspaceRoot,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    )
    this.#child = child

    let combined = ''
    const writeOutput = chunk => {
      const text = String(chunk)
      combined = `${combined}${text}`.slice(-32_768)
      this.#recentOutput = combined.slice(-8_192)
      void appendFile(options.logPath, text, 'utf8').catch(() => {})
      const endpoint = extractEndpoint(combined)
      if (endpoint !== null) ready(endpoint)
    }
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', writeOutput)
    child.stderr?.on('data', writeOutput)

    let settled = false
    let resolveReady
    let rejectReady
    const result = new Promise((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    const ready = async endpoint => {
      if (settled) return
      try {
        await this.#waitForHttp(endpoint)
      } catch (error) {
        if (!settled) rejectReady(error)
        settled = true
        return
      }
      if (settled) return
      settled = true
      this.#endpoint = endpoint
      resolveReady(endpoint)
    }

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      rejectReady(new Error(`Harness service did not become ready within ${options.readyTimeoutMs} ms`))
    }, options.readyTimeoutMs)

    child.once('error', error => {
      if (!settled) {
        settled = true
        rejectReady(error)
      }
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      const expected = this.#expectedExit
      const wasReady = this.#endpoint !== null
      this.#child = null
      this.#endpoint = null
      if (!settled) {
        settled = true
        rejectReady(new Error(`Harness service stopped before startup completed (${exitDescription(code, signal)})`))
      }
      if (!expected && wasReady) this.emit('unexpected-exit', { code, signal, output: this.#recentOutput })
    })

    try {
      return await result
    } catch (error) {
      await this.stop()
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  async #waitForHttp(endpoint) {
    let lastError
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const response = await this.options.fetch(endpoint, { redirect: 'manual' })
        if (response.status >= 200 && response.status < 500) return
        lastError = new Error(`Harness HTTP probe returned ${response.status}`)
      } catch (error) {
        lastError = error
      }
      await delay(250)
    }
    throw new Error(`Harness service announced ${endpoint}, but its HTTP endpoint was unavailable`, { cause: lastError })
  }

  async stop() {
    const child = this.#child
    this.#expectedExit = true
    this.#endpoint = null
    if (child === null) return

    const exited = new Promise(resolve => child.once('exit', resolve))
    if (child.connected) {
      try {
        child.send({ type: 'shutdown' })
      } catch {
        // A concurrent child exit owns the close event observed below.
      }
    }
    const graceful = await Promise.race([
      exited.then(() => true),
      delay(this.options.stopTimeoutMs).then(() => false),
    ])
    if (!graceful && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await Promise.race([exited, delay(2_000)])
    }
    if (this.#child === child) this.#child = null
  }

  async restart() {
    await this.stop()
    return this.start()
  }
}
