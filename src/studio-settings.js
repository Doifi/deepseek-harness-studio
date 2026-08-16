const elements = {
  version: document.querySelector('#app-version'),
  presetGrid: document.querySelector('#preset-grid'),
  customPanel: document.querySelector('#custom-panel'),
  skinPreview: document.querySelector('#skin-preview'),
  resetSkin: document.querySelector('#reset-skin'),
  radius: document.querySelector('#radius'),
  radiusValue: document.querySelector('#radius-value'),
  fontScale: document.querySelector('#font-scale'),
  fontScaleValue: document.querySelector('#font-scale-value'),
  reducedMotion: document.querySelector('#reduced-motion'),
  contrastStatus: document.querySelector('#contrast-status'),
  saveStatus: document.querySelector('#save-status'),
  autoCheck: document.querySelector('#auto-check'),
  updateTitle: document.querySelector('#update-title'),
  updateMessage: document.querySelector('#update-message'),
  updateAction: document.querySelector('#update-action'),
  updateProgress: document.querySelector('#update-progress'),
  updateProgressBar: document.querySelector('#update-progress-bar'),
  statusDot: document.querySelector('#status-dot'),
}

const colorFields = ['accent', 'background', 'sidebar', 'surface', 'input', 'text']
let state
let saveTimer

function skinFromForm() {
  return {
    preset: 'custom',
    accent: document.querySelector('#accent').value,
    background: document.querySelector('#background').value,
    sidebar: document.querySelector('#sidebar').value,
    surface: document.querySelector('#surface').value,
    input: document.querySelector('#input').value,
    text: document.querySelector('#text').value,
    radius: Number(elements.radius.value),
    fontScale: Number(elements.fontScale.value),
    reducedMotion: elements.reducedMotion.checked,
  }
}

function relativeLuminance(color) {
  const channels = [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2])
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

function renderContrast(skin) {
  const pageRatio = contrastRatio(skin.background, skin.text)
  const inputRatio = contrastRatio(skin.input, skin.text)
  const safe = pageRatio >= 4.5 && inputRatio >= 4.5
  elements.contrastStatus.dataset.safe = String(safe)
  elements.contrastStatus.textContent = safe
    ? `文字对比度良好 · 页面 ${pageRatio.toFixed(1)}:1 · 输入区 ${inputRatio.toFixed(1)}:1`
    : `文字对比度偏低 · 页面 ${pageRatio.toFixed(1)}:1 · 输入区 ${inputRatio.toFixed(1)}:1（建议至少 4.5:1）`
}

function renderSkin() {
  const skin = state.settings.skin
  for (const field of colorFields) {
    const input = document.querySelector(`#${field}`)
    input.value = skin[field]
    document.querySelector(`#${field}-value`).textContent = skin[field]
  }
  elements.radius.value = skin.radius
  elements.radiusValue.textContent = `${skin.radius} px`
  elements.fontScale.value = skin.fontScale
  elements.fontScaleValue.textContent = `${skin.fontScale}%`
  elements.reducedMotion.checked = skin.reducedMotion
  for (const field of colorFields) elements.skinPreview.style.setProperty(`--skin-${field}`, skin[field])
  elements.skinPreview.style.setProperty('--skin-radius', `${skin.radius}px`)
  renderContrast(skin)
  for (const button of elements.presetGrid.querySelectorAll('.preset')) {
    button.setAttribute('aria-checked', String(button.dataset.preset === skin.preset))
  }
}

function renderUpdate() {
  const update = state.update
  elements.version.textContent = `桌面版 ${update.currentVersion}`
  elements.autoCheck.checked = state.settings.autoCheckUpdates
  elements.statusDot.dataset.phase = update.phase
  elements.updateMessage.textContent = update.message
  elements.updateProgress.hidden = update.phase !== 'downloading'
  elements.updateProgressBar.style.width = `${update.percent ?? 0}%`
  elements.updateAction.disabled = false

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
  if (['disabled', 'checking', 'downloading'].includes(update.phase)) elements.updateAction.disabled = true
}

function renderPresets() {
  elements.presetGrid.replaceChildren(...state.presets.map(preset => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'preset'
    button.dataset.preset = preset.id
    button.setAttribute('role', 'radio')
    button.setAttribute('aria-checked', String(preset.id === state.settings.skin.preset))
    const preview = document.createElement('span')
    preview.className = 'preset-preview'
    preview.style.setProperty('--preview-background', preset.colors.background)
    preview.style.setProperty('--preview-sidebar', preset.colors.sidebar)
    preview.style.setProperty('--preview-surface', preset.colors.surface)
    preview.style.setProperty('--preview-input', preset.colors.input)
    preview.style.setProperty('--preview-accent', preset.colors.accent)
    const name = document.createElement('span')
    name.className = 'preset-name'
    name.textContent = preset.name
    const description = document.createElement('span')
    description.className = 'preset-description'
    description.textContent = preset.description
    button.append(preview, name, description)
    button.addEventListener('click', async () => {
      const skin = {
        preset: preset.id,
        ...preset.colors,
        radius: preset.radius,
        fontScale: preset.fontScale,
        reducedMotion: preset.reducedMotion,
      }
      state = await window.studio.saveSkin(skin)
      renderSkin()
      elements.saveStatus.textContent = '皮肤已保存并应用'
      elements.saveStatus.dataset.saved = 'true'
    })
    return button
  }))
}

function queueCustomSave() {
  state.settings.skin = skinFromForm()
  renderSkin()
  elements.saveStatus.textContent = '正在保存…'
  elements.saveStatus.dataset.saved = 'false'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    state = await window.studio.saveSkin(skinFromForm())
    renderSkin()
    elements.saveStatus.textContent = '皮肤已保存并应用'
    elements.saveStatus.dataset.saved = 'true'
  }, 160)
}

async function handleUpdateAction() {
  const phase = state.update.phase
  if (phase === 'available') state = await window.studio.downloadUpdate()
  else if (phase === 'ready') await window.studio.installUpdate()
  else state = await window.studio.checkForUpdates()
  renderUpdate()
}

async function initialize() {
  state = await window.studio.getState()
  renderPresets()
  renderSkin()
  renderUpdate()

  for (const field of colorFields) document.querySelector(`#${field}`).addEventListener('input', queueCustomSave)
  elements.radius.addEventListener('input', queueCustomSave)
  elements.fontScale.addEventListener('input', queueCustomSave)
  elements.reducedMotion.addEventListener('change', queueCustomSave)
  elements.resetSkin.addEventListener('click', async () => {
    state = await window.studio.resetSkin()
    renderSkin()
    elements.saveStatus.textContent = '已恢复官方皮肤'
    elements.saveStatus.dataset.saved = 'true'
  })
  elements.autoCheck.addEventListener('change', async () => {
    state = await window.studio.setAutoCheckUpdates(elements.autoCheck.checked)
    renderUpdate()
  })
  elements.updateAction.addEventListener('click', handleUpdateAction)
  window.studio.onStateChanged(nextState => {
    state = nextState
    renderSkin()
    renderUpdate()
  })
}

initialize().catch(error => {
  elements.updateTitle.textContent = '设置未能加载'
  elements.updateMessage.textContent = error?.message ?? String(error)
  elements.updateAction.disabled = true
})
