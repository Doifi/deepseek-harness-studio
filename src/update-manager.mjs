import { EventEmitter } from 'node:events'

function safeVersion(info) {
  return typeof info?.version === 'string' ? info.version : null
}

export function validUpdateUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
  } catch {
    return false
  }
}

export class UpdateManager extends EventEmitter {
  #initialized = false
  #checking = null
  #state

  constructor({ updater, currentVersion, updateUrl, isPackaged, logger = console }) {
    super()
    this.updater = updater
    this.logger = logger
    this.configured = Boolean(isPackaged && validUpdateUrl(updateUrl))
    this.#state = {
      phase: this.configured ? 'idle' : 'disabled',
      currentVersion,
      availableVersion: null,
      percent: null,
      message: this.configured ? '将在软件启动后自动检查更新' : '尚未配置可信的更新发布地址',
      configured: this.configured,
    }
  }

  get state() {
    return { ...this.#state }
  }

  #setState(patch) {
    this.#state = { ...this.#state, ...patch }
    this.emit('state', this.state)
  }

  initialize() {
    if (this.#initialized || !this.configured) return
    this.#initialized = true
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = true
    this.updater.allowPrerelease = false
    this.updater.logger = this.logger
    this.updater.on('checking-for-update', () => {
      this.#setState({ phase: 'checking', message: '正在检查更新…', percent: null })
    })
    this.updater.on('update-available', info => {
      const availableVersion = safeVersion(info)
      this.#setState({ phase: 'available', availableVersion, message: availableVersion ? `发现新版本 ${availableVersion}` : '发现新版本' })
      this.emit('available', { ...info, version: availableVersion })
    })
    this.updater.on('update-not-available', info => {
      this.#setState({ phase: 'current', availableVersion: safeVersion(info), message: '当前已是最新版本', percent: null })
    })
    this.updater.on('download-progress', progress => {
      const percent = Number.isFinite(progress?.percent) ? Math.min(100, Math.max(0, progress.percent)) : null
      this.#setState({ phase: 'downloading', percent, message: percent === null ? '正在下载更新…' : `正在下载更新 ${percent.toFixed(0)}%` })
    })
    this.updater.on('update-downloaded', info => {
      const availableVersion = safeVersion(info) ?? this.#state.availableVersion
      this.#setState({ phase: 'ready', availableVersion, percent: 100, message: '更新已下载，可重启安装' })
      this.emit('downloaded', { ...info, version: availableVersion })
    })
    this.updater.on('error', error => {
      this.logger.error?.(error)
      this.#setState({ phase: 'error', message: `检查更新失败：${error?.message ?? String(error)}`, percent: null })
    })
  }

  async check() {
    if (!this.configured) return this.state
    this.initialize()
    if (this.#checking !== null) return this.#checking
    this.#checking = Promise.resolve()
      .then(() => this.updater.checkForUpdates())
      .catch(error => {
        this.#setState({ phase: 'error', message: `检查更新失败：${error?.message ?? String(error)}`, percent: null })
        return null
      })
      .finally(() => {
        this.#checking = null
      })
    await this.#checking
    return this.state
  }

  async download() {
    if (!this.configured || this.#state.phase !== 'available') return this.state
    this.#setState({ phase: 'downloading', percent: 0, message: '正在准备下载更新…' })
    try {
      await this.updater.downloadUpdate()
    } catch (error) {
      this.#setState({ phase: 'error', message: `下载更新失败：${error?.message ?? String(error)}`, percent: null })
    }
    return this.state
  }

  install() {
    if (this.#state.phase !== 'ready') return false
    this.updater.quitAndInstall(false, true)
    return true
  }
}
