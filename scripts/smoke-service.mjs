import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ServiceSupervisor } from '../src/service-supervisor.mjs'

const require = createRequire(import.meta.url)
const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-real-smoke-'))
const cliPackage = require.resolve('@deepseek-ai/dsh/package.json')
const pnpmPackage = require.resolve('pnpm')
const supervisor = new ServiceSupervisor({
  nodeExecutable: process.execPath,
  runnerPath: fileURLToPath(new URL('../src/service-runner.mjs', import.meta.url)),
  cliPath: join(dirname(cliPackage), 'lib', 'bin.js'),
  pnpmCliPath: join(dirname(pnpmPackage), 'bin', 'pnpm.mjs'),
  binDir: join(root, 'bin'),
  harnessHome: join(root, 'home'),
  workspaceRoot: join(root, 'workspace'),
  logPath: join(root, 'logs', 'harness.log'),
  platform: process.platform,
})

try {
  const endpoint = await supervisor.start()
  const response = await fetch(endpoint)
  const body = await response.text()
  if (response.status !== 200) throw new Error(`unexpected Web UI status ${response.status}`)
  if (!body.includes('<html')) throw new Error('Web UI response did not contain an HTML document')
  process.stdout.write(`Harness Web UI ready: ${endpoint} (${body.length} bytes)\n`)
} catch (error) {
  process.stderr.write(`${supervisor.recentOutput}\n`)
  throw error
} finally {
  await supervisor.stop()
  await rm(root, { recursive: true, force: true })
}
