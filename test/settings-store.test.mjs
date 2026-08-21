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
  assert.deepEqual(restored.value, { autoCheckUpdates: false })
  assert.equal(restored.value.autoCheckUpdates, false)
  assert.doesNotMatch(await readFile(path, 'utf8'), /"skin"/)
})
