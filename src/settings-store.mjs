import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const DEFAULT_STUDIO_SETTINGS = Object.freeze({
  autoCheckUpdates: true,
})

export function normalizeStudioSettings(value = {}) {
  return {
    autoCheckUpdates: value.autoCheckUpdates !== false,
  }
}

export class SettingsStore {
  #settings = DEFAULT_STUDIO_SETTINGS

  constructor(path) {
    this.path = path
  }

  get value() {
    return structuredClone(this.#settings)
  }

  async load() {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8'))
      this.#settings = normalizeStudioSettings(value)
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
      this.#settings = normalizeStudioSettings()
    }
    return this.value
  }

  async update(patch = {}) {
    this.#settings = normalizeStudioSettings({ ...this.#settings, ...patch })
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, `${JSON.stringify(this.#settings, null, 2)}\n`, 'utf8')
    return this.value
  }
}
