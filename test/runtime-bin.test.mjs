import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import test from 'node:test'
import { createRuntimeBin, createServiceEnvironment } from '../src/runtime-bin.mjs'

test('creates Windows launchers for Node, pnpm, and dsh', async () => {
  const binDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-bin-'))
  await createRuntimeBin({
    binDir,
    nodeExecutable: 'C:\\Program Files\\Harness\\runtime\\node.exe',
    pnpmCliPath: 'C:\\Program Files\\Harness\\pnpm.mjs',
    cliPath: 'C:\\Program Files\\Harness\\dsh.js',
    platform: 'win32',
  })

  const [node, pnpm, dsh] = await Promise.all([
    readFile(join(binDir, 'node.cmd'), 'utf8'),
    readFile(join(binDir, 'pnpm.cmd'), 'utf8'),
    readFile(join(binDir, 'dsh.cmd'), 'utf8'),
  ])
  assert.match(node, /runtime\\node\.exe/)
  assert.doesNotMatch(node, /ELECTRON_RUN_AS_NODE/)
  assert.match(pnpm, /pnpm\.mjs/)
  assert.match(dsh, /dsh\.js/)
  assert.match(dsh, /--expose-internals/)
})

test('creates executable POSIX launchers', async () => {
  const binDir = await mkdtemp(join(tmpdir(), 'dsh-desktop-bin-'))
  await createRuntimeBin({
    binDir,
    nodeExecutable: '/Applications/DeepSeek Harness Studio.app/Contents/Resources/node-runtime/node',
    pnpmCliPath: '/Applications/Harness/pnpm.mjs',
    cliPath: '/Applications/Harness/dsh.js',
    platform: 'darwin',
  })

  const dshPath = join(binDir, 'dsh')
  const [contents, metadata] = await Promise.all([readFile(dshPath, 'utf8'), stat(dshPath)])
  assert.match(contents, /^#!\/bin\/sh/)
  assert.match(contents, /node-runtime\/node/)
  assert.doesNotMatch(contents, /ELECTRON_RUN_AS_NODE/)
  if (process.platform !== 'win32') assert.notEqual(metadata.mode & 0o100, 0)
})

test('service environment owns DSH_HOME and places the bundled runtime first', () => {
  const env = createServiceEnvironment({
    base: { Path: 'C:\\Windows', DSH_HOME: 'wrong', ELECTRON_RUN_AS_NODE: '0', KEEP: 'yes' },
    binDir: 'C:\\Harness\\bin',
    harnessHome: 'C:\\Harness\\data',
    platform: 'win32',
  })

  assert.equal(env.DSH_HOME, 'C:\\Harness\\data')
  assert.equal(Object.hasOwn(env, 'ELECTRON_RUN_AS_NODE'), false)
  assert.equal(env.KEEP, 'yes')
  assert.equal(env.PATH, `C:\\Harness\\bin${delimiter}C:\\Windows`)
  assert.equal(env.Path, env.PATH)
})
