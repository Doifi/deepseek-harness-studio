import { posix, win32 } from 'node:path'

export function bundledNodeExecutable({ appPath, isPackaged, platform, resourcesPath }) {
  const paths = platform === 'win32' ? win32 : posix
  const runtimeRoot = isPackaged
    ? paths.join(resourcesPath, 'node-runtime')
    : paths.join(appPath, 'build', 'node-runtime')
  return paths.join(runtimeRoot, platform === 'win32' ? 'node.exe' : 'node')
}
