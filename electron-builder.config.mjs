const configuredUpdateUrl = String(process.env.DSH_STUDIO_UPDATE_URL ?? '').trim()
const metadataUpdateUrl = /^https:\/\//i.test(configuredUpdateUrl) ? configuredUpdateUrl : ''
const publishUrl = metadataUpdateUrl || 'https://updates.invalid/deepseek-harness-studio/'

export default {
  appId: 'ai.deepseek.harness.studio',
  productName: 'DeepSeek Harness Studio',
  copyright: 'Copyright © 2026 DeepSeek Harness Studio contributors',
  asar: false,
  compression: 'maximum',
  artifactName: 'DeepSeek-Harness-Studio-${version}-${os}-${arch}.${ext}',
  electronUpdaterCompatibility: '>=2.16',
  extraMetadata: {
    studioUpdateUrl: metadataUpdateUrl,
  },
  directories: {
    output: 'release',
    buildResources: 'build',
  },
  files: [
    'src/**/*',
    'package.json',
    'LICENSE',
    'NOTICE.md',
  ],
  extraResources: [
    { from: 'build/node-runtime', to: 'node-runtime' },
  ],
  publish: [
    { provider: 'generic', url: publishUrl },
  ],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.svg',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'DeepSeek Harness Studio',
    uninstallDisplayName: 'DeepSeek Harness Studio',
  },
  mac: {
    target: [
      { target: 'dmg', arch: ['arm64'] },
      { target: 'zip', arch: ['arm64'] },
    ],
    icon: 'build/icon.svg',
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
  },
  dmg: {
    title: '${productName} ${version}',
    backgroundColor: '#f4f7fb',
    iconSize: 88,
    contents: [
      { x: 140, y: 220, type: 'file' },
      { x: 400, y: 220, type: 'link', path: '/Applications' },
    ],
  },
}
