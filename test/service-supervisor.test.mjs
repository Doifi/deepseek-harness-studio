import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { extractEndpoint, ServiceSupervisor } from '../src/service-supervisor.mjs'

test('extractEndpoint accepts loopback URLs and rejects invalid ports', () => {
  assert.equal(extractEndpoint('ready: http://127.0.0.1:3080/'), 'http://127.0.0.1:3080')
  assert.equal(extractEndpoint('http://localhost:3080'), null)
  assert.equal(extractEndpoint('http://127.0.0.1:99999'), null)
})

test('starts, probes, and gracefully stops a supervised service', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-supervisor-'))
  const fixture = fileURLToPath(new URL('../fixtures/mock-service.mjs', import.meta.url))
  const supervisor = new ServiceSupervisor({
    nodeExecutable: process.execPath,
    runnerPath: fixture,
    cliPath: 'ignored-by-fixture',
    pnpmCliPath: fileURLToPath(new URL('../node_modules/pnpm/bin/pnpm.mjs', import.meta.url)),
    binDir: join(root, 'bin'),
    harnessHome: join(root, 'home'),
    workspaceRoot: join(root, 'workspace'),
    logPath: join(root, 'logs', 'harness.log'),
    platform: process.platform,
    readyTimeoutMs: 10_000,
    stopTimeoutMs: 2_000,
  })

  const endpoint = await supervisor.start()
  assert.match(endpoint, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.equal((await fetch(endpoint)).status, 200)
  await supervisor.stop()
  assert.equal(supervisor.endpoint, null)
})
