function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function document({ title, eyebrow, heading, message, detail = '', error = false }) {
  const detailBlock = detail === '' ? '' : `<pre>${escapeHtml(detail)}</pre>`
  const accent = error ? '#ff8b8b' : '#9cbfff'
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, "Segoe UI", "PingFang SC", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: #eef4ff; background: radial-gradient(circle at 20% 10%, #24375f 0, #111a2e 38%, #070d17 100%); }
    main { width: min(680px, calc(100vw - 48px)); padding: 48px; border: 1px solid rgba(255,255,255,.12); border-radius: 28px; background: rgba(9,16,29,.72); box-shadow: 0 30px 100px rgba(0,0,0,.38); backdrop-filter: blur(24px); }
    .mark { width: 64px; height: 64px; display: grid; place-items: center; border-radius: 18px; color: #07101d; background: ${accent}; font-size: 30px; font-weight: 800; }
    .eyebrow { margin: 28px 0 8px; color: ${accent}; font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(30px, 5vw, 48px); line-height: 1.08; letter-spacing: -.03em; }
    p { margin: 18px 0 0; color: #b9c5d8; font-size: 16px; line-height: 1.7; }
    pre { max-height: 220px; margin: 28px 0 0; padding: 18px; overflow: auto; color: #ffb8b8; border: 1px solid rgba(255,139,139,.24); border-radius: 14px; background: rgba(38,8,13,.5); white-space: pre-wrap; font: 12px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .pulse { width: 10px; height: 10px; margin-top: 28px; border-radius: 50%; background: ${accent}; box-shadow: 0 0 0 0 ${accent}; animation: pulse 1.8s infinite; }
    @keyframes pulse { 70% { box-shadow: 0 0 0 18px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
    @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
  </style>
</head>
<body>
  <main>
    <div class="mark">DS</div>
    <div class="eyebrow">${escapeHtml(eyebrow)}</div>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(message)}</p>
    ${detailBlock}
    ${error ? '' : '<div class="pulse" aria-hidden="true"></div>'}
  </main>
</body>
</html>`
}

export function startupPage(message = '正在启动本地 Harness 服务并加载官方 Web UI。') {
  return document({
    title: 'DeepSeek Harness Studio',
    eyebrow: 'LOCAL SERVICE',
    heading: '正在准备工作区',
    message,
  })
}

export function errorPage(error, output = '') {
  const message = error instanceof Error ? error.message : String(error)
  const detail = [message, output].filter(Boolean).join('\n\n').slice(-8_000)
  return document({
    title: 'Harness 服务启动失败',
    eyebrow: 'SERVICE UNAVAILABLE',
    heading: 'Harness 服务未能启动',
    message: '请从“Harness”菜单选择“重新启动服务”。诊断日志保存在应用数据目录。',
    detail,
    error: true,
  })
}
