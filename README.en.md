# DeepSeek Harness Studio

A community desktop distribution of DeepSeek Harness for Windows x64 and macOS Apple Silicon. End users can install and open the app without installing Node.js or starting Harness from a terminal.

> This is not an official DeepSeek desktop client. The wrapper redistributes the official MIT-licensed DeepSeek Harness with its name, license, and attribution intact.

## Download

Download the latest version from [GitHub Releases](https://github.com/Doifi/deepseek-harness-studio/releases/latest):

- Windows x64: choose the installer ending in `win-x64.exe`.
- macOS Apple Silicon: choose the image ending in `mac-arm64.dmg`.

Until production signing is configured, Windows and macOS may display an unknown-developer warning. Only download installers from the Releases page above.

## Included behavior

- Bundled Electron, a separate official Node.js 24 LTS runtime, and pnpm.
- Automatic startup, supervision, and graceful shutdown of the official `dsh web` service.
- The official Web UI, plugin composition, MCP, Skills, sessions, and settings.
- A local skin center with four curated presets, custom colors, and adjustable interface radii.
- Automatic update checks after startup, user-controlled download, progress feedback, and safe restart-to-install.
- No session, model, credential, or workspace data is uploaded by the desktop updater.
- Single-instance behavior, external-link isolation, a sandboxed renderer, and Windows/macOS build jobs.

## Local data

- Studio preferences: `studio-settings.json` under Electron's app-data directory
- Harness home: `harness/` under the app-data directory
- Harness log: `logs/harness.log`
- Updater log: `logs/updates.log`
- Default workspace: `DeepSeek Harness Workspace/` under the user's Documents directory

## Development and packaging

Developers need Node.js 24; end users do not.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm start
```

Build Windows x64 with `pnpm dist:win` and macOS arm64 with `pnpm dist:mac`.

## Publishing automatic updates

Set an HTTPS generic update feed when producing a release build:

```powershell
$env:DSH_STUDIO_UPDATE_URL='https://github.com/OWNER/REPOSITORY/releases/latest/download/'
pnpm dist:win
```

The build produces installers, blockmaps, and the platform update metadata. The included GitHub Actions workflow injects the current repository's Releases URL and publishes both platforms when a `v*` tag is pushed. Local builds without a trusted feed remain usable and clearly report that updates are not configured instead of contacting a placeholder domain.

macOS automatic updates require code signing. Windows signing is also strongly recommended before public distribution.

The project pins `@deepseek-ai/dsh` to `0.1.0-rc.6`; the desktop wrapper version is `0.2.0`. Upstream remains a developer preview, so every dependency upgrade requires a fresh desktop acceptance run.

See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) for license and attribution details.
