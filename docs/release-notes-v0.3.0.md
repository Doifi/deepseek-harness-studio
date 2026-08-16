# DeepSeek Harness Studio v0.3.0

本次更新重点改善 Windows 安装体验，并补全 Studio 外观自定义能力。

## 更新内容

- Windows 安装包改用面向安装速度的压缩策略。
- 移除运行时不会读取的 Source Map 与类型声明文件，待释放文件数量较 v0.2.0 减少约 37%，同时保留官方 Harness、插件与运行依赖。
- 安装器由 169.7 MB 降至 160.9 MB。
- 皮肤现在统一覆盖侧栏、主内容、面板、弹层、菜单、输入区、Markdown 与滚动条。
- 自定义色板新增侧栏颜色和输入区颜色。
- 新增实时界面预览、文字对比度提示、85%–120% 界面缩放和减少动画选项。
- 保持官方 Web UI、插件、MCP、Skills、本地会话和自动更新能力。

## 平台

- Windows x64
- macOS Apple Silicon（由 GitHub Actions 生成）

## 校验

- 17 项自动化测试全部通过。
- 已从最终 Windows 打包目录启动真实 Harness Web UI。
- 生产依赖审计未发现已知漏洞。

> DeepSeek Harness Studio 是社区桌面发行版，并非 DeepSeek 官方桌面客户端。官方 Harness 来源与许可信息见项目的 NOTICE 和 LICENSE 文件。
