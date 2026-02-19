# Agentic Commons

Agentic Commons is a CLI + API + Web stack for private-by-design AI usage analytics.

Agentic Commons 是一个由 CLI + API + Web 组成的 AI 使用量分析系统，默认以隐私为边界。

## What It Does / 项目做什么

- Collects local Claude/Codex usage and aggregates daily model-level token totals.
- Syncs to cloud for leaderboard and public profile analytics.
- Keeps prompts, transcript content, and raw logs on your machine.

- 在本地收集 Claude/Codex 使用量，并按天按模型聚合 token 总量。
- 同步到云端用于排行榜与公开 profile 统计。
- 不上传 prompts、对话内容和原始日志。

## Core Principles / 核心原则

- Privacy-first telemetry: upload allowlist only.
- Verifiable aggregation: model/day/token totals are auditable.
- Practical automation: setup installs scheduler and runs health checks.

- 隐私优先：仅上传白名单字段。
- 可验证聚合：按模型/日期/token 的统计可审计。
- 实用自动化：setup 自动安装定时任务并执行自检。

## Repository Status / 仓库状态

This repository is currently in open-source readiness mode and may remain private until maintainers publish it.  
当前仓库处于开源准备阶段，在维护者正式发布前可保持私有。

## Repository Layout / 仓库结构

- `apps/cli`: `acommons` CLI source
- `apps/api`: Cloudflare Worker API
- `apps/web`: React + Tailwind frontend
- `packages/shared`: shared schema/types
- `supabase/migrations`: SQL migrations
- `docs/oss`: open-source readiness docs

## Privacy Boundary / 隐私边界

### Uploaded fields / 上传字段

- `date`, `source`, `model`
- `input_uncached`, `output`, `cached_read`, `cached_write`, `total_io`

### Never uploaded / 永不上传

- Prompt/message content
- Transcript text and reasoning blocks
- File paths and repository names
- Raw session logs

## Requirements / 环境要求

- Node.js >= 20
- npm >= 10

## Quick Start (Mac) / Mac 快速开始

```bash
node -v
npm -v
npm i -g agentic-commons
acommons setup
acommons doctor
```

After setup, automatic sync is enabled (launchd hourly).  
完成 setup 后会自动同步（macOS launchd 每小时）。

Manual sync (optional) / 可选手动同步:

```bash
acommons sync
```

## Quick Start (Windows) / Windows 快速开始

```powershell
node -v
npm -v
npm i -g agentic-commons
acommons setup
acommons doctor
```

Manual sync (optional):

```powershell
acommons sync
```

## CLI Commands / CLI 命令

Core:

```bash
acommons setup
acommons doctor
acommons sync
```

Optional:

```bash
acommons stats
acommons daily
acommons models
acommons total
acommons report
acommons watch
acommons link
acommons update
```

## Local Development / 本地开发

Install dependencies:

```bash
npm install
```

Run API:

```bash
npm run dev:api
```

Run Web:

```powershell
$env:VITE_API_BASE="http://127.0.0.1:8787"
$env:VITE_SUPABASE_URL="https://<your-project>.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="<your-anon-key>"
npm run dev:web
```

Validation:

```bash
npm run build:cli
npm run test -w @agentic-commons/api
npm run build -w @agentic-commons/web
```

## Deployment / 部署

Deploy API:

```bash
npm run deploy:api
```

Deploy Web:

```bash
npm run deploy:web
```

Deploy all:

```bash
npm run deploy:all
```

Supabase migrations are in:

```text
supabase/migrations/*.sql
```

## Security and Secrets / 安全与密钥

Never commit real secrets.  
不要将真实密钥提交到仓库。

Examples only:

- `.env.example`
- `.env.production.example`

Production secrets must be managed via secret managers (Cloudflare/Supabase/GitHub).  
生产密钥必须放在 secret manager，不可入库。

See:

- `SECURITY.md`
- `docs/oss/PRIVATE_VS_PUBLIC_BOUNDARY.md`

## Web Routes / Web 页面

- `/`: home
- `/leaderboard`: leaderboard
- `/login`: login
- `/cli-commands`: CLI command reference
- `/privacy`: privacy summary
- `/terms`: terms
- `/changelog`: changelog
- `/me`: personal profile
- `/u/:handle`: public profile

## Contributing / 贡献

Please read `CONTRIBUTING.md` before opening issues or PRs.  
提交 Issue 或 PR 前请先阅读 `CONTRIBUTING.md`。

## Support / 支持

- Usage questions: GitHub Issues
- Feature requests: GitHub Issues
- Security reports: GitHub Security Advisories (private)
- Maintenance policy: best-effort, no SLA

See `SUPPORT.md` for details.

## License / 许可证

MIT. See `LICENSE`.
