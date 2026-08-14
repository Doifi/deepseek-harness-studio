import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSkinCss, normalizeSkin, SKIN_PRESETS } from '../src/skin.mjs'

test('normalizes custom skin values and rejects CSS injection', () => {
  assert.deepEqual(normalizeSkin({
    preset: 'custom',
    accent: '#ABCDEF',
    background: '#010203',
    surface: '#111213',
    text: '#fefefe',
    radius: 99,
  }), {
    preset: 'custom',
    accent: '#abcdef',
    background: '#010203',
    surface: '#111213',
    text: '#fefefe',
    radius: 24,
  })

  const invalid = normalizeSkin({ preset: 'custom', accent: '#fff;}</style>' })
  assert.equal(invalid.accent, '#4d6bfe')
})

test('uses preset colors instead of accepting overrides for a named preset', () => {
  const midnight = SKIN_PRESETS.find(preset => preset.id === 'midnight')
  const normalized = normalizeSkin({ preset: 'midnight', accent: '#ffffff' })
  assert.equal(normalized.accent, midnight.colors.accent)
  assert.equal(normalized.background, midnight.colors.background)
})

test('official skin only injects the Studio entry while custom skins override Harness tokens', () => {
  const officialCss = buildSkinCss({ preset: 'official' })
  assert.match(officialCss, /dsh-studio-appearance-button/)
  assert.doesNotMatch(officialCss, /--dsw-alias-bg-base/)

  const customCss = buildSkinCss({ preset: 'custom', background: '#07111f' })
  assert.match(customCss, /--dsw-alias-bg-base: #07111f !important/)
  assert.match(customCss, /color-scheme: dark/)
})
