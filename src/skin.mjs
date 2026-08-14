const HEX_COLOR = /^#[0-9a-f]{6}$/i

export const SKIN_PRESETS = Object.freeze([
  {
    id: 'official',
    name: '官方原色',
    description: '保持 DeepSeek Harness 官方界面配色',
    colors: { accent: '#4d6bfe', background: '#f7f8fa', surface: '#ffffff', text: '#181a1f' },
    radius: 12,
  },
  {
    id: 'midnight',
    name: '深海夜航',
    description: '低眩光深色工作台',
    colors: { accent: '#6e9bff', background: '#07111f', surface: '#0e1c2f', text: '#eaf1ff' },
    radius: 14,
  },
  {
    id: 'violet',
    name: '星云紫',
    description: '克制的紫色暗调',
    colors: { accent: '#a58bff', background: '#110d1c', surface: '#1c162b', text: '#f3edff' },
    radius: 16,
  },
  {
    id: 'forest',
    name: '松林',
    description: '安静自然的绿色深调',
    colors: { accent: '#63c69a', background: '#091510', surface: '#10231b', text: '#e8f7ef' },
    radius: 12,
  },
  {
    id: 'custom',
    name: '自定义',
    description: '使用自己的界面色板与圆角',
    colors: { accent: '#4d6bfe', background: '#f7f8fa', surface: '#ffffff', text: '#181a1f' },
    radius: 12,
  },
])

const PRESET_BY_ID = new Map(SKIN_PRESETS.map(preset => [preset.id, preset]))

function validColor(value, fallback) {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback
}

function validRadius(value, fallback) {
  const radius = Number(value)
  return Number.isFinite(radius) ? Math.min(24, Math.max(4, Math.round(radius))) : fallback
}

export function normalizeSkin(value = {}) {
  const preset = PRESET_BY_ID.get(value.preset) ?? PRESET_BY_ID.get('official')
  const source = value.preset === 'custom' ? value : preset
  return {
    preset: preset.id,
    accent: validColor(source.accent, preset.colors.accent),
    background: validColor(source.background, preset.colors.background),
    surface: validColor(source.surface, preset.colors.surface),
    text: validColor(source.text, preset.colors.text),
    radius: validRadius(source.radius, preset.radius),
  }
}

function channel(color, offset) {
  return Number.parseInt(color.slice(offset, offset + 2), 16)
}

function rgba(color, alpha) {
  return `rgba(${channel(color, 1)}, ${channel(color, 3)}, ${channel(color, 5)}, ${alpha})`
}

function isDark(color) {
  const luminance = (0.2126 * channel(color, 1)) + (0.7152 * channel(color, 3)) + (0.0722 * channel(color, 5))
  return luminance < 128
}

export function buildSkinCss(value = {}) {
  const skin = normalizeSkin(value)
  const dark = isDark(skin.background)
  const secondaryText = rgba(skin.text, dark ? 0.72 : 0.66)
  const tertiaryText = rgba(skin.text, dark ? 0.5 : 0.46)
  const border = rgba(skin.text, dark ? 0.16 : 0.11)
  const hover = rgba(skin.accent, dark ? 0.18 : 0.1)
  const base = `
#dsh-studio-appearance-button {
  position: fixed !important;
  right: 18px !important;
  bottom: 18px !important;
  z-index: 2147483000 !important;
  min-width: auto !important;
  height: 34px !important;
  padding: 0 13px !important;
  border: 1px solid ${rgba(skin.accent, 0.32)} !important;
  border-radius: 999px !important;
  color: ${dark ? '#ffffff' : skin.accent} !important;
  background: ${dark ? rgba(skin.surface, 0.92) : 'rgba(255, 255, 255, 0.94)'} !important;
  box-shadow: 0 8px 28px ${rgba(dark ? '#000000' : skin.accent, dark ? 0.32 : 0.16)} !important;
  backdrop-filter: blur(18px) !important;
  font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif !important;
  letter-spacing: .01em !important;
  cursor: pointer !important;
  transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease !important;
}
#dsh-studio-appearance-button:hover {
  transform: translateY(-1px) !important;
  background: ${dark ? rgba(skin.accent, 0.22) : '#ffffff'} !important;
  box-shadow: 0 10px 34px ${rgba(dark ? '#000000' : skin.accent, dark ? 0.4 : 0.22)} !important;
}
#dsh-studio-appearance-button:focus-visible {
  outline: 3px solid ${rgba(skin.accent, 0.28)} !important;
  outline-offset: 3px !important;
}
`

  if (skin.preset === 'official') return base

  return `${base}
:root,
body,
#root,
#root * {
  color-scheme: ${dark ? 'dark' : 'light'} !important;
  --dsw-alias-bg-base: ${skin.background} !important;
  --dsw-alias-bg-layer-1: ${skin.surface} !important;
  --dsw-alias-bg-layer-2: ${dark ? rgba(skin.text, 0.055) : rgba(skin.text, 0.035)} !important;
  --dsw-alias-bg-layer-3: ${dark ? rgba(skin.text, 0.09) : rgba(skin.text, 0.055)} !important;
  --dsw-alias-bg-overlay: ${skin.surface} !important;
  --dsw-alias-bg-mask-1: ${rgba(skin.background, 0.72)} !important;
  --dsw-alias-bg-mask-2: ${rgba(skin.background, 0.82)} !important;
  --dsw-alias-bg-mask-3: ${rgba(skin.background, 0.9)} !important;
  --dsw-alias-bg-skeleton: ${rgba(skin.text, dark ? 0.08 : 0.06)} !important;
  --dsw-alias-brand-primary: ${skin.accent} !important;
  --dsw-alias-brand-text: ${skin.accent} !important;
  --dsw-alias-button-primary-fill: ${skin.accent} !important;
  --dsw-alias-button-primary-hover: ${rgba(skin.accent, 0.82)} !important;
  --dsw-alias-button-ghost-active-fill: ${hover} !important;
  --dsw-alias-interactive-bg-hover: ${hover} !important;
  --dsw-alias-interactive-bg-active: ${rgba(skin.accent, dark ? 0.26 : 0.15)} !important;
  --dsw-alias-label-primary: ${skin.text} !important;
  --dsw-alias-label-secondary: ${secondaryText} !important;
  --dsw-alias-label-tertiary: ${tertiaryText} !important;
  --dsw-alias-label-dimmed: ${rgba(skin.text, dark ? 0.36 : 0.32)} !important;
  --dsw-alias-border-l1: ${border} !important;
  --dsw-alias-border-l2: ${border} !important;
  --dsw-alias-border-l3: ${rgba(skin.text, dark ? 0.22 : 0.16)} !important;
  --dsw-alias-border-inverted: ${border} !important;
  --dsw-alias-border-inverted2: ${rgba(skin.text, dark ? 0.22 : 0.16)} !important;
  --dsw-alias-markdown-code-block: ${dark ? rgba('#000000', 0.24) : rgba(skin.text, 0.045)} !important;
  --dsw-specific-menu: ${skin.surface} !important;
  --dsw-alias-toast-bg: ${skin.surface} !important;
  --dsw-alias-tooltip-bg: ${dark ? '#02060c' : skin.text} !important;
  --dsh-scrollbar-thumb: ${rgba(skin.text, 0.22)} !important;
  --dsh-scrollbar-thumb-hover: ${rgba(skin.text, 0.34)} !important;
  --dsl-code-block-border-radius: ${skin.radius}px !important;
  --dsl-terminal-radius: ${skin.radius}px !important;
  --dsl-read-radius: ${skin.radius}px !important;
  --dsl-diff-radius: ${skin.radius}px !important;
  --dsl-search-radius: ${skin.radius}px !important;
  --dsl-web-radius: ${skin.radius}px !important;
}
html, body, #root {
  background: ${skin.background} !important;
  color: ${skin.text} !important;
}
button, input, textarea, select, [role="dialog"], [role="menu"] {
  --studio-skin-radius: ${skin.radius}px;
}
::selection { color: ${dark ? '#ffffff' : skin.text}; background: ${rgba(skin.accent, 0.34)}; }
`
}
