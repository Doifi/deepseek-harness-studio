import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ServiceSupervisor } from '../src/service-supervisor.mjs'

const packagedRoot = resolve(process.argv[2] ?? 'release/win-unpacked')
const appRoot = join(packagedRoot, 'resources', 'app')
const nodeExecutable = join(packagedRoot, 'resources', 'node-runtime', 'node.exe')
const root = await mkdtemp(join(tmpdir(), 'dsh-studio-packaged-smoke-'))

await Promise.all([
  access(nodeExecutable),
  access(join(appRoot, 'src', 'service-runner.mjs')),
  access(join(appRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')),
  access(join(appRoot, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')),
])

const supervisor = new ServiceSupervisor({
  nodeExecutable,
  runnerPath: join(appRoot, 'src', 'service-runner.mjs'),
  cliPath: join(appRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  pnpmCliPath: join(appRoot, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'),
  binDir: join(root, 'bin'),
  harnessHome: join(root, 'home'),
  workspaceRoot: join(root, 'workspace'),
  logPath: join(root, 'logs', 'harness.log'),
  platform: 'win32',
})

try {
  const endpoint = await supervisor.start()
  const response = await fetch(endpoint)
  const body = await response.text()
  if (response.status !== 200 || !body.includes('<html')) {
    throw new Error(`Packaged Web UI verification failed: HTTP ${response.status}`)
  }
  process.stdout.write(`Packaged Harness Web UI ready: ${endpoint} (${body.length} bytes)\n`)
} catch (error) {
  process.stderr.write(`${supervisor.recentOutput}\n`)
  throw error
} finally {
  await supervisor.stop()
  await rm(root, { recursive: true, force: true })
}
