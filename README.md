# DeepSeek Harness Studio

面向 Windows x64 与 macOS Apple Silicon 的 DeepSeek Harness 社区桌面发行版。最终用户安装后直接打开应用，不需要预装 Node.js，也不需要通过命令行启动 Harness。

> 这不是 DeepSeek 官方发布的桌面客户端。桌面壳基于 MIT 许可分发官方 DeepSeek Harness，并保留原项目名称、许可与来源说明。

## 下载

从 [GitHub Releases](https://github.com/Doifi/deepseek-harness-studio/releases/latest) 下载最新版本：

- Windows x64：下载名称包含 `win-x64.exe` 的安装包。
- macOS Apple Silicon：下载名称包含 `mac-arm64.dmg` 的安装包。

在配置正式代码签名前，系统可能显示未知开发者警告。请只从上述 Releases 页面下载安装包。

## 已实现

- 内置 Electron、独立的官方 Node.js 24 LTS 运行时与 pnpm，不依赖系统 Node.js。
- 自动启动和管理官方 `dsh web`，关闭桌面应用时安全停止本地服务。
- 保留官方 Web UI、插件体系、MCP、Skills、会话和设置能力。
- 桌面壳不再注入皮肤、主题、缩放或悬浮入口，官方 Web UI 保持原样。
- Windows 安装包使用面向安装速度的压缩策略，并剔除运行时不会读取的 Source Map 与类型声明文件，同时保留官方运行依赖。
- 启动时可自动检查桌面应用更新；发现新版后由用户确认下载和安装。
- 更新过程不会上传会话、模型配置、API Key 或工作区内容。
- Harness 异常退出后最多自动重启三次，也可以通过菜单手动重启。
- 单实例、外链交给系统浏览器、隔离渲染进程，以及 Windows/macOS 双平台构建流程。

## 本地数据

- Studio 更新设置：应用数据目录下的 `studio-settings.json`
- Harness 数据：应用数据目录下的 `harness/`
- 运行日志：应用数据目录下的 `logs/harness.log`
- 更新日志：应用数据目录下的 `logs/updates.log`
- 默认工作区：用户“文档”目录下的 `DeepSeek Harness Workspace/`

Windows 的典型应用数据位置是 `%APPDATA%\DeepSeek Harness Studio`，macOS 是 `~/Library/Application Support/DeepSeek Harness Studio`。

## 开发与构建

开发者需要 Node.js 24；最终用户不需要。

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm smoke:service
pnpm start
```

Windows x64：`pnpm dist:win`。macOS Apple Silicon：`pnpm dist:mac`。

## 自动更新发布

客户端只接受 HTTPS 更新源（本机开发时允许 loopback HTTP）。正式构建时通过 `DSH_STUDIO_UPDATE_URL` 写入更新地址：

```powershell
$env:DSH_STUDIO_UPDATE_URL='https://github.com/OWNER/REPOSITORY/releases/latest/download/'
pnpm dist:win
```

构建会生成安装包、blockmap 和平台更新元数据。仓库中的 GitHub Actions 会在推送 `v*` 标签时构建并发布产物。未配置可信地址的本地构建会显示“更新源未配置”，不会访问占位域名。

macOS 自动更新要求应用完成代码签名。正式对外发布前也建议为 Windows 安装包配置代码签名证书。

## 上游与发布边界

- 官方仓库：<https://github.com/deepseek-ai/deepseek-harness>
- 锁定 Harness npm 版本：`0.1.1-rc.2`
- 桌面壳版本：`0.4.0`
- 上游目前属于预发布版本，升级依赖后必须重新完成桌面验收。

许可与归属见 [LICENSE](LICENSE) 和 [NOTICE.md](NOTICE.md)。

English documentation: [README.en.md](README.en.md)
