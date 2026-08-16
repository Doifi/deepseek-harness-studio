import { createRequire } from 'node:module'
import { access, appendFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { ServiceSupervisor } from './service-supervisor.mjs'
import { bundledNodeExecutable } from './node-runtime.mjs'
import { errorPage, startupPage } from './pages.mjs'
import { SettingsStore } from './settings-store.mjs'
import { buildSkinCss, normalizeSkin, skinColorScheme, SKIN_PRESETS } from './skin.mjs'
import { UpdateManager } from './update-manager.mjs'

const require = createRequire(import.meta.url)
const sourceDirectory = dirname(fileURLToPath(import.meta.url))
const APP_NAME = 'DeepSeek Harness Studio'
const MAX_AUTOMATIC_RESTARTS = 3
const desktopManifest = require('../package.json')
const HARNESS_VERSION = desktopManifest.dependencies['@deepseek-ai/dsh']
const { autoUpdater } = require('electron-updater')

let mainWindow = null
let studioWindow = null
let supervisor = null
let settingsStore = null
let updateManager = null
let insertedSkinKey = null
let quitting = false
let quitAfterStop = false
let restartAttempts = 0
let loadGeneration = 0
let restartTimer = null
let automaticUpdateTimer = null
let promptedVersion = null

app.setName(APP_NAME)

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === null) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

function dataUrl(html) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function isStudioSettingsUrl(rawUrl) {
  return rawUrl === 'studio://settings' || rawUrl === 'studio://settings/'
}

function allowedLocalUrl(rawUrl) {
  if (supervisor?.endpoint === null || supervisor?.endpoint === undefined) return false
  try {
    return new URL(rawUrl).origin === new URL(supervisor.endpoint).origin
  } catch {
    return false
  }
}

function configureNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isStudioSettingsUrl(url)) {
      void openStudioSettings()
      return { action: 'deny' }
    }
    if (allowedLocalUrl(url)) return { action: 'allow' }
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (isStudioSettingsUrl(url)) {
      event.preventDefault()
      void openStudioSettings()
      return
    }
    if (allowedLocalUrl(url) || url.startsWith('data:text/html')) return
    event.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })
}

async function decorateHarnessWindow(window) {
  if (window.isDestroyed() || !allowedLocalUrl(window.webContents.getURL())) return
  const skin = normalizeSkin(settingsStore?.value.skin)
  const colorScheme = skinColorScheme(skin)
  if (insertedSkinKey !== null) {
    await window.webContents.removeInsertedCSS(insertedSkinKey).catch(() => {})
    insertedSkinKey = null
  }
  window.webContents.setZoomFactor(skin.fontScale / 100)
  insertedSkinKey = await window.webContents.insertCSS(buildSkinCss(skin))
  await window.webContents.executeJavaScript(`(() => {
    const studioTheme = ${JSON.stringify(colorScheme)};
    const root = document.documentElement;
    if (studioTheme === 'official') {
      const originalTheme = root.dataset.dshStudioOfficialTheme;
      if (originalTheme) document.body.toggleAttribute('data-ds-dark-theme', originalTheme === 'dark');
      delete root.dataset.dshStudioOfficialTheme;
      delete root.dataset.dshStudioTheme;
    } else {
      if (!root.dataset.dshStudioOfficialTheme) {
        root.dataset.dshStudioOfficialTheme = document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
      }
      document.body.toggleAttribute('data-ds-dark-theme', studioTheme === 'dark');
      root.dataset.dshStudioTheme = studioTheme;
    }
    if (document.querySelector('#dsh-studio-appearance-button')) return;
    const button = document.createElement('button');
    button.id = 'dsh-studio-appearance-button';
    button.type = 'button';
    button.textContent = 'Studio 外观';
    button.setAttribute('aria-label', '打开 DeepSeek Harness Studio 外观与更新设置');
    button.addEventListener('click', () => { window.location.href = 'studio://settings'; });
    document.body.append(button);
  })()`, true)
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#070d17',
    title: APP_NAME,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })
  configureNavigation(window)
  window.webContents.on('did-finish-load', () => void decorateHarnessWindow(window))
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
      insertedSkinKey = null
    }
  })
  return window
}

function studioState() {
  return {
    settings: settingsStore?.value,
    presets: SKIN_PRESETS,
    update: updateManager?.state ?? {
      phase: 'disabled',
      currentVersion: app.getVersion(),
      availableVersion: null,
      percent: null,
      message: '更新服务尚未初始化',
      configured: false,
    },
  }
}

function broadcastStudioState() {
  if (studioWindow !== null && !studioWindow.isDestroyed()) {
    studioWindow.webContents.send('studio:state-changed', studioState())
  }
}

async function openStudioSettings() {
  if (studioWindow !== null && !studioWindow.isDestroyed()) {
    studioWindow.show()
    studioWindow.focus()
    return
  }
  studioWindow = new BrowserWindow({
    width: 920,
    height: 790,
    minWidth: 720,
    minHeight: 640,
    parent: mainWindow ?? undefined,
    modal: false,
    show: false,
    title: 'Studio 设置',
    backgroundColor: '#080d17',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(sourceDirectory, 'studio-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  studioWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  studioWindow.webContents.on('will-navigate', event => event.preventDefault())
  studioWindow.once('ready-to-show', () => studioWindow?.show())
  studioWindow.on('closed', () => { studioWindow = null })
  await studioWindow.loadFile(join(sourceDirectory, 'studio-settings.html'))
}

async function showStartup(message) {
  if (mainWindow === null) mainWindow = createWindow()
  await mainWindow.loadURL(dataUrl(startupPage(message)))
}

async function showError(error) {
  if (mainWindow === null) mainWindow = createWindow()
  await mainWindow.loadURL(dataUrl(errorPage(error, supervisor?.recentOutput ?? '')))
}

async function loadHarness({ restart = false, automatic = false } = {}) {
  const generation = ++loadGeneration
  if (restartTimer !== null) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  const message = automatic
    ? `Harness 服务意外停止，正在进行第 ${restartAttempts}/${MAX_AUTOMATIC_RESTARTS} 次自动重启。`
    : restart
      ? '正在重新启动本地 Harness 服务。'
      : undefined
  await showStartup(message)
  try {
    const endpoint = restart ? await supervisor.restart() : await supervisor.start()
    if (generation !== loadGeneration || quitting || mainWindow === null) return
    restartAttempts = 0
    await mainWindow.loadURL(endpoint)
    mainWindow.setTitle(APP_NAME)
  } catch (error) {
    if (generation !== loadGeneration || quitting) return
    await showError(error)
  }
}

function scheduleAutomaticRestart() {
  if (quitting || restartTimer !== null) return
  if (restartAttempts >= MAX_AUTOMATIC_RESTARTS) {
    void showError(new Error('Harness 服务反复停止，已达到自动重启次数上限'))
    return
  }
  restartAttempts += 1
  const waitMs = 1_000 * (2 ** (restartAttempts - 1))
  void showStartup(`Harness 服务意外停止，将在 ${waitMs / 1_000} 秒后自动重启。`)
  restartTimer = setTimeout(() => {
    restartTimer = null
    void loadHarness({ automatic: true })
  }, waitMs)
}

async function appendUpdateLog(level, values) {
  try {
    const logDirectory = join(app.getPath('userData'), 'logs')
    await mkdir(logDirectory, { recursive: true })
    const message = values.map(value => value instanceof Error ? (value.stack ?? value.message) : String(value)).join(' ')
    await appendFile(join(logDirectory, 'updates.log'), `${new Date().toISOString()} [${level}] ${message}\n`, 'utf8')
  } catch {
    // Update logging must never interrupt the local Harness service.
  }
}

function showAppMessageBox(options) {
  return mainWindow !== null && !mainWindow.isDestroyed()
    ? dialog.showMessageBox(mainWindow, options)
    : dialog.showMessageBox(options)
}

async function promptForDownload(info) {
  if (quitting || promptedVersion === info.version) return
  promptedVersion = info.version
  const result = await showAppMessageBox({
    type: 'info',
    title: '发现新版本',
    message: `${APP_NAME} ${info.version ?? '新版本'} 已发布`,
    detail: '是否现在下载？你可以继续使用 Harness，下载完成后再决定何时重启安装。',
    buttons: ['下载更新', '稍后'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (result.response === 0) await updateManager.download()
}

async function installDownloadedUpdate() {
  if (updateManager?.state.phase !== 'ready' || quitting) return false
  quitting = true
  loadGeneration += 1
  if (restartTimer !== null) clearTimeout(restartTimer)
  if (automaticUpdateTimer !== null) clearTimeout(automaticUpdateTimer)
  await supervisor?.stop()
  quitAfterStop = true
  return updateManager.install()
}

async function promptForInstall(info) {
  if (quitting) return
  const result = await showAppMessageBox({
    type: 'info',
    title: '更新已下载',
    message: `${APP_NAME} ${info.version ?? '新版本'} 已准备好`,
    detail: '立即重启会先安全停止本地 Harness 服务，再安装更新。也可以稍后在 Studio 设置中安装。',
    buttons: ['立即重启安装', '稍后'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (result.response === 0) await installDownloadedUpdate()
}

function initializeUpdater() {
  const logger = {
    info: (...values) => void appendUpdateLog('info', values),
    warn: (...values) => void appendUpdateLog('warn', values),
    error: (...values) => void appendUpdateLog('error', values),
    debug: (...values) => void appendUpdateLog('debug', values),
  }
  updateManager = new UpdateManager({
    updater: autoUpdater,
    currentVersion: app.getVersion(),
    updateUrl: desktopManifest.studioUpdateUrl ?? '',
    isPackaged: app.isPackaged,
    logger,
  })
  updateManager.initialize()
  updateManager.on('state', () => {
    broadcastStudioState()
    createApplicationMenu()
  })
  updateManager.on('available', info => void promptForDownload(info))
  updateManager.on('downloaded', info => void promptForInstall(info))
}

function requireStudioSender(event) {
  if (studioWindow === null || studioWindow.isDestroyed() || event.sender !== studioWindow.webContents) {
    throw new Error('Studio settings IPC request rejected')
  }
}

function registerStudioIpc() {
  ipcMain.handle('studio:get-state', event => {
    requireStudioSender(event)
    return studioState()
  })
  ipcMain.handle('studio:save-skin', async (event, skin) => {
    requireStudioSender(event)
    await settingsStore.update({ skin: normalizeSkin(skin) })
    if (mainWindow !== null) await decorateHarnessWindow(mainWindow)
    broadcastStudioState()
    return studioState()
  })
  ipcMain.handle('studio:reset-skin', async event => {
    requireStudioSender(event)
    await settingsStore.update({ skin: normalizeSkin({ preset: 'official' }) })
    if (mainWindow !== null) await decorateHarnessWindow(mainWindow)
    broadcastStudioState()
    return studioState()
  })
  ipcMain.handle('studio:set-auto-check-updates', async (event, enabled) => {
    requireStudioSender(event)
    await settingsStore.update({ autoCheckUpdates: enabled === true })
    broadcastStudioState()
    return studioState()
  })
  ipcMain.handle('studio:check-for-updates', async event => {
    requireStudioSender(event)
    await updateManager.check()
    return studioState()
  })
  ipcMain.handle('studio:download-update', async event => {
    requireStudioSender(event)
    await updateManager.download()
    return studioState()
  })
  ipcMain.handle('studio:install-update', async event => {
    requireStudioSender(event)
    return installDownloadedUpdate()
  })
}

function createApplicationMenu() {
  const updateLabel = updateManager?.state.configured !== true
    ? '更新源未配置'
    : updateManager.state.phase === 'ready'
      ? '重启并安装更新'
      : '检查更新'
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'Studio',
      submenu: [
        { label: '外观与更新设置', accelerator: 'CmdOrCtrl+,', click: () => void openStudioSettings() },
        {
          label: updateLabel,
          enabled: updateManager?.state.configured === true,
          click: () => updateManager?.state.phase === 'ready' ? void installDownloadedUpdate() : void updateManager?.check(),
        },
      ],
    },
    {
      label: 'Harness',
      submenu: [
        {
          label: '重新启动服务',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            restartAttempts = 0
            void loadHarness({ restart: true })
          },
        },
        {
          label: '在浏览器中打开 Web UI',
          enabled: supervisor?.endpoint !== null,
          click: () => {
            if (supervisor?.endpoint !== null) void shell.openExternal(supervisor.endpoint)
          },
        },
        { type: 'separator' },
        { label: '打开应用数据目录', click: () => void shell.openPath(app.getPath('userData')) },
        { label: '打开默认工作区', click: () => void shell.openPath(join(app.getPath('documents'), 'DeepSeek Harness Workspace')) },
        { type: 'separator' },
        ...(process.platform === 'darwin' ? [] : [{ role: 'quit', label: '退出' }]),
      ],
    },
    {
      label: '查看',
      submenu: [
        { role: 'reload', label: '重新加载页面' },
        { role: 'forceReload', label: '强制重新加载页面' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: 'DeepSeek Harness 官方仓库', click: () => void shell.openExternal('https://github.com/deepseek-ai/deepseek-harness') },
        {
          label: '关于桌面版',
          click: () => void dialog.showMessageBox({
            type: 'info',
            title: `关于 ${APP_NAME}`,
            message: APP_NAME,
            detail: `桌面壳版本 ${app.getVersion()}\n官方 Harness 版本 ${HARNESS_VERSION}\n\n这是基于 MIT 许可打包的社区桌面发行版，并非 DeepSeek 官方发布的桌面客户端。`,
          }),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function initialize() {
  const cliPackage = require.resolve('@deepseek-ai/dsh/package.json')
  const pnpmPackage = require.resolve('pnpm')
  const userData = app.getPath('userData')
  const nodeExecutable = bundledNodeExecutable({
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    resourcesPath: process.resourcesPath,
  })
  await access(nodeExecutable)
  settingsStore = new SettingsStore(join(userData, 'studio-settings.json'))
  await settingsStore.load()
  initializeUpdater()
  registerStudioIpc()
  supervisor = new ServiceSupervisor({
    nodeExecutable,
    runnerPath: fileURLToPath(new URL('./service-runner.mjs', import.meta.url)),
    cliPath: join(dirname(cliPackage), 'lib', 'bin.js'),
    pnpmCliPath: join(dirname(pnpmPackage), 'bin', 'pnpm.mjs'),
    binDir: join(userData, 'runtime-bin'),
    harnessHome: join(userData, 'harness'),
    workspaceRoot: join(app.getPath('documents'), 'DeepSeek Harness Workspace'),
    logPath: join(userData, 'logs', 'harness.log'),
    platform: process.platform,
  })
  supervisor.on('unexpected-exit', scheduleAutomaticRestart)
  createApplicationMenu()
  await loadHarness()
  createApplicationMenu()
  if (settingsStore.value.autoCheckUpdates && updateManager.configured) {
    automaticUpdateTimer = setTimeout(() => {
      automaticUpdateTimer = null
      void updateManager.check()
    }, 4_000)
  }
}

if (singleInstance) {
  app.whenReady().then(initialize).catch(showError)

  app.on('activate', () => {
    if (mainWindow !== null) return
    mainWindow = createWindow()
    if (supervisor?.endpoint !== null) void mainWindow.loadURL(supervisor.endpoint)
    else void loadHarness()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', event => {
    if (quitAfterStop) return
    event.preventDefault()
    if (quitting) return
    quitting = true
    loadGeneration += 1
    if (restartTimer !== null) clearTimeout(restartTimer)
    if (automaticUpdateTimer !== null) clearTimeout(automaticUpdateTimer)
    void Promise.resolve(supervisor?.stop()).finally(() => {
      quitAfterStop = true
      app.quit()
    })
  })
}
