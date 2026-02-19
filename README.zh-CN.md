# Agentic Commons

Agentic Commons 是一个由 CLI + API + Web 组成的 AI 使用量分析系统，默认以隐私为边界。

[English](./README.md) | 简体中文

## 项目做什么

- 在本地收集 Claude/Codex 使用量，并按天按模型聚合 token 总量。
- 同步到云端用于排行榜与公开 profile 统计。
- 不上传 prompts、对话内容和原始日志。

英文 README 是发布与版本说明的基准文档。中文 README 保持功能与使用方式对齐。

## 核心原则

- 隐私优先：仅上传白名单字段。
- 可验证聚合：按模型/日期/token 的统计可审计。
- 实用自动化：`setup` 自动安装定时任务并执行自检。

## 仓库结构

- `apps/cli`: `acommons` CLI 源码
- `apps/api`: Cloudflare Worker API
- `apps/web`: React + Tailwind 前端
- `packages/shared`: 共享 schema/types
- `supabase/migrations`: SQL 迁移
- `docs/oss`: 开源准备文档

## 隐私边界

### 会上传的字段

- `date`, `source`, `model`
- `input_uncached`, `output`, `cached_read`, `cached_write`, `total_io`

### 永不上传

- Prompt/message 内容
- Transcript 文本与 reasoning blocks
- 文件路径与仓库名
- 原始会话日志

## 环境要求

- Node.js >= 20
- npm >= 10

## 快速开始（Mac）

```bash
node -v
npm -v
npm i -g agentic-commons
acommons setup
acommons doctor
```

完成 setup 后会自动同步（macOS launchd 每小时）。

可选手动同步：

```bash
acommons sync
```

## 快速开始（Windows）

```powershell
node -v
npm -v
npm i -g agentic-commons
acommons setup
acommons doctor
```

可选手动同步：

```powershell
acommons sync
```

## CLI 命令

核心：

```bash
acommons setup
acommons doctor
acommons sync
```

可选：

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

## 本地开发

安装依赖：

```bash
npm install
```

运行 API：

```bash
npm run dev:api
```

运行 Web：

```powershell
$env:VITE_API_BASE="http://127.0.0.1:8787"
$env:VITE_SUPABASE_URL="https://<your-project>.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="<your-anon-key>"
npm run dev:web
```

校验：

```bash
npm run build:cli
npm run test -w @agentic-commons/api
npm run build -w @agentic-commons/web
```

## 部署

部署 API：

```bash
npm run deploy:api
```

部署 Web：

```bash
npm run deploy:web
```

全部部署：

```bash
npm run deploy:all
```

Supabase 迁移位于：

```text
supabase/migrations/*.sql
```

## 安全与密钥

不要提交真实密钥。

示例文件：

- `.env.example`
- `.env.production.example`

生产密钥必须放在 secret manager（Cloudflare/Supabase/GitHub）。

参见：

- `SECURITY.md`

## Web 页面

- `/`: 首页
- `/leaderboard`: 排行榜
- `/login`: 登录
- `/cli-commands`: CLI 命令参考
- `/privacy`: 隐私说明
- `/terms`: 条款
- `/changelog`: 更新日志
- `/me`: 个人主页
- `/u/:handle`: 公开主页

## 贡献

提交 Issue 或 PR 前请先阅读 `CONTRIBUTING.md`。

## 支持

- 使用问题：GitHub Issues
- 功能建议：GitHub Issues
- 安全报告：GitHub Security Advisories（私密）
- 维护策略：best-effort，无 SLA

详情见 `SUPPORT.md`。

## 许可证

MIT，见 `LICENSE`。
