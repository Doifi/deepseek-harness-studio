import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

function escapeBatchPath(value) {
  return value.replaceAll('%', '%%')
}

function quoteShell(value) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

async function writeExecutable(path, contents, platform) {
  await writeFile(path, contents, { encoding: 'utf8', mode: 0o700 })
  if (platform !== 'win32') await chmod(path, 0o700)
}

/**
 * Create launchers that expose the bundled standalone Node.js runtime and
 * pnpm CLI to official Harness plugin management.
 */
export async function createRuntimeBin({ binDir, nodeExecutable, pnpmCliPath, cliPath, platform = process.platform }) {
  await mkdir(binDir, { recursive: true })
  if (platform === 'win32') {
    const executable = escapeBatchPath(nodeExecutable)
    const pnpmCli = escapeBatchPath(pnpmCliPath)
    const dshCli = escapeBatchPath(cliPath)
    const node = `@echo off\r\n"${executable}" %*\r\n`
    const pnpm = `@echo off\r\n"${executable}" "${pnpmCli}" %*\r\n`
    const dsh = `@echo off\r\n"${executable}" --expose-internals "${dshCli}" %*\r\n`
    await Promise.all([
      writeExecutable(join(binDir, 'node.cmd'), node, platform),
      writeExecutable(join(binDir, 'pnpm.cmd'), pnpm, platform),
      writeExecutable(join(binDir, 'pnpx.cmd'), pnpm, platform),
      writeExecutable(join(binDir, 'dsh.cmd'), dsh, platform),
    ])
    return
  }

  const executable = quoteShell(nodeExecutable)
  const pnpmCli = quoteShell(pnpmCliPath)
  const dshCli = quoteShell(cliPath)
  const node = `#!/bin/sh\nexec ${executable} "$@"\n`
  const pnpm = `#!/bin/sh\nexec ${executable} ${pnpmCli} "$@"\n`
  const dsh = `#!/bin/sh\nexec ${executable} --expose-internals ${dshCli} "$@"\n`
  await Promise.all([
    writeExecutable(join(binDir, 'node'), node, platform),
    writeExecutable(join(binDir, 'pnpm'), pnpm, platform),
    writeExecutable(join(binDir, 'pnpx'), pnpm, platform),
    writeExecutable(join(binDir, 'dsh'), dsh, platform),
  ])
}

/** Return an environment with the packaged runtime first on PATH. */
export function createServiceEnvironment({ base = process.env, binDir, harnessHome, platform = process.platform }) {
  const env = {}
  let inheritedPath = ''
  for (const [key, value] of Object.entries(base)) {
    const normalized = key.toUpperCase()
    if (normalized === 'PATH') {
      inheritedPath = value ?? ''
      continue
    }
    if (normalized === 'DSH_HOME' || normalized === 'ELECTRON_RUN_AS_NODE') continue
    env[key] = value
  }
  env.PATH = inheritedPath === '' ? binDir : `${binDir}${delimiter}${inheritedPath}`
  env.DSH_HOME = harnessHome
  env.FORCE_COLOR = '0'
  env.NO_COLOR = '1'
  if (platform === 'win32') env.Path = env.PATH
  return env
}
