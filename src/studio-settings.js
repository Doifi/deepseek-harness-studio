const elements = {
  appVersion: document.querySelector('#app-version'),
  harnessVersion: document.querySelector('#harness-version'),
  autoCheck: document.querySelector('#auto-check'),
  updateTitle: document.querySelector('#update-title'),
  updateMessage: document.querySelector('#update-message'),
  updateAction: document.querySelector('#update-action'),
  updateProgress: document.querySelector('#update-progress'),
  updateProgressBar: document.querySelector('#update-progress-bar'),
  statusDot: document.querySelector('#status-dot'),
}

let state

function render() {
  const update = state.update
  elements.appVersion.textContent = update.currentVersion
  elements.harnessVersion.textContent = state.harnessVersion
  elements.autoCheck.checked = state.settings.autoCheckUpdates
  elements.statusDot.dataset.phase = update.phase
  elements.updateMessage.textContent = update.message
  elements.updateProgress.hidden = update.phase !== 'downloading'
  elements.updateProgressBar.style.width = `${update.percent ?? 0}%`

  const labels = {
    disabled: ['更新源未配置', '暂不可用'],
    idle: ['准备检查更新', '立即检查'],
    checking: ['正在检查更新', '检查中…'],
    current: ['已经是最新版', '再次检查'],
    available: ['发现可用更新', `下载 ${update.availableVersion ?? '新版'}`],
    downloading: ['正在下载更新', `${(update.percent ?? 0).toFixed(0)}%`],
    ready: ['更新可以安装', '重启并安装'],
    error: ['更新检查遇到问题', '重新检查'],
  }
  const [title, action] = labels[update.phase] ?? labels.idle
  elements.updateTitle.textContent = title
  elements.updateAction.textContent = action
  elements.updateAction.disabled = ['disabled', 'checking', 'downloading'].includes(update.phase)
}

async function handleUpdateAction() {
  const phase = state.update.phase
  if (phase === 'available') state = await window.studio.downloadUpdate()
  else if (phase === 'ready') await window.studio.installUpdate()
  else state = await window.studio.checkForUpdates()
  render()
}

async function initialize() {
  state = await window.studio.getState()
  render()
  elements.autoCheck.addEventListener('change', async () => {
    state = await window.studio.setAutoCheckUpdates(elements.autoCheck.checked)
    render()
  })
  elements.updateAction.addEventListener('click', handleUpdateAction)
  window.studio.onStateChanged(nextState => {
    state = nextState
    render()
  })
}

initialize().catch(error => {
  elements.updateTitle.textContent = '更新设置未能加载'
  elements.updateMessage.textContent = error?.message ?? String(error)
  elements.updateAction.disabled = true
})
