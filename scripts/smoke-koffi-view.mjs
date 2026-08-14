import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const pickerPackageRoot = process.argv[2]
if (!pickerPackageRoot) {
  throw new Error('Usage: node scripts/smoke-koffi-view.mjs <directory-picker-package-root>')
}

const requireFromPicker = createRequire(resolve(pickerPackageRoot, 'package.json'))
const koffi = requireFromPicker('koffi')
const kernel32 = koffi.load('kernel32.dll')
const getCommandLineW = kernel32.func('__stdcall', 'GetCommandLineW', 'void *', [])
const address = getCommandLineW()
const bytes = Buffer.from(koffi.view(address, 32_768))
let end = 0
while (end + 1 < bytes.length && (bytes[end] !== 0 || bytes[end + 1] !== 0)) end += 2
const commandLine = bytes.toString('utf16le', 0, end)

if (!commandLine.includes('smoke-koffi-view.mjs')) {
  throw new Error(`Unexpected GetCommandLineW result: ${commandLine}`)
}
process.stdout.write(`Koffi external-buffer read succeeded under ${process.execPath}\n`)
