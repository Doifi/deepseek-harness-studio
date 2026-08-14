import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const NODE_VERSION = '24.19.0'
const root = fileURLToPath(new URL('..', import.meta.url))
const cacheRoot = join(root, '.cache', 'node-runtime')
const outputRoot = join(root, 'build', 'node-runtime')

const RUNTIMES = {
  'win32-x64': {
    archive: `node-v${NODE_VERSION}-win-x64.zip`,
    checksum: '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73',
    executable: 'node.exe',
  },
  'darwin-arm64': {
    archive: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    checksum: '8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d',
    executable: 'bin/node',
  },
}

function assertInside(parent, candidate) {
  const base = `${resolve(parent)}${sep}`
  const target = resolve(candidate)
  if (!target.startsWith(base)) throw new Error(`Refusing to modify path outside ${parent}: ${target}`)
}

async function run(command, args) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', code => code === 0
      ? resolveRun()
      : reject(new Error(`${command} exited with code ${code}`)))
  })
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function download(url, destination, expectedChecksum) {
  try {
    if (await sha256(destination) === expectedChecksum) return
  } catch {
    // A missing or unreadable cache entry is downloaded below.
  }

  const temporary = `${destination}.download`
  assertInside(cacheRoot, temporary)
  await rm(temporary, { force: true })
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || response.body === null) throw new Error(`Node.js download failed: HTTP ${response.status}`)
  await pipeline(response.body, createWriteStream(temporary))
  const actualChecksum = await sha256(temporary)
  if (actualChecksum !== expectedChecksum) {
    await rm(temporary, { force: true })
    throw new Error(`Node.js archive checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`)
  }
  await rm(destination, { force: true })
  await rename(temporary, destination)
}

async function executableVersion(path) {
  return await new Promise((resolveVersion, reject) => {
    let output = ''
    const child = spawn(path, ['--version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.once('error', reject)
    child.once('exit', code => code === 0
      ? resolveVersion(output.trim())
      : reject(new Error(`Bundled Node.js exited with code ${code}: ${output.trim()}`)))
  })
}

const runtime = RUNTIMES[`${process.platform}-${process.arch}`]
if (runtime === undefined) {
  throw new Error(`Unsupported Node.js runtime target: ${process.platform}-${process.arch}`)
}

const outputExecutable = join(outputRoot, process.platform === 'win32' ? 'node.exe' : 'node')
try {
  if (await executableVersion(outputExecutable) === `v${NODE_VERSION}`) {
    process.stdout.write(`Bundled Node.js v${NODE_VERSION} is ready at ${outputExecutable}\n`)
    process.exit(0)
  }
} catch {
  // Prepare a fresh verified runtime below.
}

await mkdir(cacheRoot, { recursive: true })
const archivePath = join(cacheRoot, runtime.archive)
await download(`https://nodejs.org/dist/v${NODE_VERSION}/${runtime.archive}`, archivePath, runtime.checksum)

const stagingRoot = join(cacheRoot, `extract-${process.platform}-${process.arch}`)
assertInside(cacheRoot, stagingRoot)
assertInside(join(root, 'build'), outputRoot)
await rm(stagingRoot, { recursive: true, force: true })
await mkdir(stagingRoot, { recursive: true })
await run(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xf', archivePath, '-C', stagingRoot])

const extractedRoot = join(stagingRoot, runtime.archive.replace(/\.(?:zip|tar\.gz)$/, ''))
const sourceExecutable = join(extractedRoot, runtime.executable)
await access(sourceExecutable)
await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })
await copyFile(sourceExecutable, outputExecutable)
await copyFile(join(extractedRoot, 'LICENSE'), join(outputRoot, 'LICENSE'))
await writeFile(join(outputRoot, 'VERSION'), `v${NODE_VERSION}\n`, 'utf8')
if (process.platform !== 'win32') await chmod(outputExecutable, 0o755)
await rm(stagingRoot, { recursive: true, force: true })

const installedVersion = await executableVersion(outputExecutable)
if (installedVersion !== `v${NODE_VERSION}`) {
  throw new Error(`Prepared Node.js version mismatch: expected v${NODE_VERSION}, got ${installedVersion}`)
}
process.stdout.write(`Prepared verified Node.js ${installedVersion} at ${outputExecutable}\n`)
