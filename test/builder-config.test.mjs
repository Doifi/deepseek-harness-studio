import assert from 'node:assert/strict'
import test from 'node:test'

test('local builds generate update metadata without enabling an untrusted feed', async () => {
  const previous = process.env.DSH_STUDIO_UPDATE_URL
  delete process.env.DSH_STUDIO_UPDATE_URL
  const { default: config } = await import('../electron-builder.config.mjs?local-build')
  if (previous === undefined) delete process.env.DSH_STUDIO_UPDATE_URL
  else process.env.DSH_STUDIO_UPDATE_URL = previous

  assert.equal(config.extraMetadata.studioUpdateUrl, '')
  assert.equal(config.publish[0].url, 'https://updates.invalid/deepseek-harness-studio/')
})

test('release builds embed their trusted HTTPS feed in app metadata and publisher config', async () => {
  const previous = process.env.DSH_STUDIO_UPDATE_URL
  const updateUrl = 'https://github.com/example/studio/releases/latest/download/'
  process.env.DSH_STUDIO_UPDATE_URL = updateUrl
  const { default: config } = await import('../electron-builder.config.mjs?release-build')
  if (previous === undefined) delete process.env.DSH_STUDIO_UPDATE_URL
  else process.env.DSH_STUDIO_UPDATE_URL = previous

  assert.equal(config.extraMetadata.studioUpdateUrl, updateUrl)
  assert.equal(config.publish[0].url, updateUrl)
})
