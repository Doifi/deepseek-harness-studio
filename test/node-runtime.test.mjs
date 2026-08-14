import assert from 'node:assert/strict'
import test from 'node:test'
import { bundledNodeExecutable } from '../src/node-runtime.mjs'

test('resolves the packaged Windows Node.js runtime', () => {
  assert.equal(bundledNodeExecutable({
    appPath: 'D:\\source',
    isPackaged: true,
    platform: 'win32',
    resourcesPath: 'D:\\app\\resources',
  }), 'D:\\app\\resources\\node-runtime\\node.exe')
})

test('resolves the development macOS Node.js runtime', () => {
  assert.equal(bundledNodeExecutable({
    appPath: '/source',
    isPackaged: false,
    platform: 'darwin',
    resourcesPath: '/Applications/App.app/Contents/Resources',
  }), '/source/build/node-runtime/node')
})
