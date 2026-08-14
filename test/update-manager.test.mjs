import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { UpdateManager, validUpdateUrl } from '../src/update-manager.mjs'

class FakeUpdater extends EventEmitter {
  checkCount = 0
  downloadCount = 0
  installCount = 0

  async checkForUpdates() {
    this.checkCount += 1
    this.emit('checking-for-update')
    this.emit('update-available', { version: '0.3.0' })
  }

  async downloadUpdate() {
    this.downloadCount += 1
    this.emit('download-progress', { percent: 48.4 })
    this.emit('update-downloaded', { version: '0.3.0' })
  }

  quitAndInstall() {
    this.installCount += 1
  }
}

test('accepts HTTPS feeds and loopback HTTP only', () => {
  assert.equal(validUpdateUrl('https://example.com/releases/latest/download/'), true)
  assert.equal(validUpdateUrl('http://127.0.0.1:8080/'), true)
  assert.equal(validUpdateUrl('http://example.com/updates'), false)
  assert.equal(validUpdateUrl('file:///tmp/updates'), false)
})

test('keeps updater disabled when a packaged build has no trusted feed', async () => {
  const updater = new FakeUpdater()
  const manager = new UpdateManager({ updater, currentVersion: '0.2.0', updateUrl: '', isPackaged: true })
  assert.equal(manager.state.phase, 'disabled')
  await manager.check()
  assert.equal(updater.checkCount, 0)
})

test('checks, downloads, reports progress, and installs through the updater', async () => {
  const updater = new FakeUpdater()
  const manager = new UpdateManager({
    updater,
    currentVersion: '0.2.0',
    updateUrl: 'https://example.com/releases/latest/download/',
    isPackaged: true,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
  })
  manager.initialize()
  await manager.check()
  assert.equal(manager.state.phase, 'available')
  assert.equal(manager.state.availableVersion, '0.3.0')
  await manager.download()
  assert.equal(manager.state.phase, 'ready')
  assert.equal(manager.state.percent, 100)
  assert.equal(manager.install(), true)
  assert.equal(updater.installCount, 1)
})
