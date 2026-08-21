# DeepSeek Harness Studio 0.4.0

## 官方 Harness 更新

- 将官方 `@deepseek-ai/dsh` 从 `0.1.0-rc.6` 升级到 `0.1.1-rc.2`。
- 保留上游仍在使用的基础包作为 Electron 打包兼容依赖，避免 peer dependency 在成品中被漏收集。
- 更新后重新执行 CLI、服务冷启动与 Windows 打包验收。

## 取消 Studio 外观功能

- 删除 Studio 内置皮肤、自定义色板、缩放和动画覆盖。
- 删除社区外观插件中心、离线皮肤包、插件安装管理代码和悬浮入口。
- 不再向官方 Harness Web UI 注入 CSS 或 JavaScript，官方界面和官方插件能力保持原样。
- Studio 设置窗口现在只管理桌面应用自动更新。

## 稳定性

- Harness 冷启动容错由 90 秒提高到 180 秒，避免新安装后逐文件安全扫描造成误报；正常启动不会额外等待。
