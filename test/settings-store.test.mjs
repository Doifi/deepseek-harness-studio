import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { SettingsStore } from '../src/settings-store.mjs'

test('persists normalized Studio settings locally', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-studio-settings-'))
  const path = join(root, 'studio-settings.json')
  const store = new SettingsStore(path)
  await store.load()
  assert.equal(store.value.skin.preset, 'official')
  assert.equal(store.value.autoCheckUpdates, true)

  await store.update({
    skin: {
      preset: 'custom',
      accent: '#123456',
      background: '#000000',
      sidebar: '#050505',
      surface: '#101010',
      input: '#181818',
      text: '#ffffff',
      radius: 18,
      fontScale: 110,
      reducedMotion: true,
    },
    autoCheckUpdates: false,
  })
  const restored = new SettingsStore(path)
  await restored.load()
  assert.equal(restored.value.skin.accent, '#123456')
  assert.equal(restored.value.skin.sidebar, '#050505')
  assert.equal(restored.value.skin.input, '#181818')
  assert.equal(restored.value.skin.radius, 18)
  assert.equal(restored.value.skin.fontScale, 110)
  assert.equal(restored.value.skin.reducedMotion, true)
  assert.equal(restored.value.autoCheckUpdates, false)
  assert.match(await readFile(path, 'utf8'), /"preset": "custom"/)
})
