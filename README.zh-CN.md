# Agentic Commons

Agentic Commons 是一个以隐私为边界的 AI 使用量分析 open-core 项目。

[English](./README.md) | 简体中文

## Open-Core 边界

本仓库公开内容：

- `apps/cli`：`acommons` CLI 源码
- `packages/shared`：共享 schema/types
- 公开文档、贡献规范与安全提交流程

本仓库不公开（私有）：

- 托管 API 的生产实现
- 托管 Web 的生产实现
- 基础设施与数据库迁移资产

## 项目做什么

- 在本地收集 Claude/Codex 使用量，并按天按模型聚合 token 总量。
- 同步到托管平台用于排行榜与公开 profile 统计。
- 不上传 prompts、对话内容和原始日志。

英文 README 是发布与版本说明的基准文档。中文 README 保持功能与使用方式对齐。

## 核心原则

- 隐私优先：仅上传白名单字段。
- 可验证聚合：按模型/日期/token 的统计可审计。
- 实用自动化：`setup` 自动安装定时任务并执行自检。

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

## Claude Code Skill

在 Claude Code 内直接使用 `/acommons` — 查看统计无需安装 CLI。

```
/acommons            显示今日使用量（默认：stats）
/acommons daily      14 天每日明细
/acommons models     按模型统计 token 用量
/acommons total      全量汇总
/acommons sync       执行采集 + 上传流水线
/acommons setup      首次配置
/acommons link       设备 OAuth 认证
/acommons doctor     健康检查与诊断
/acommons probe      探测已安装的 AI 工具
/acommons report     生成 HTML 使用报告
```

安装 skill：

```bash
npx skills add Phlegonlabs/agentic-commons --skill acommons -g -y
```

Skill 直接读取本地数据，并包含 Stop hook 在会话结束时自动更新 token 账本。

## 本地开发（公开仓库）

安装依赖：

```bash
npm install
```

校验：

```bash
npm run build:cli
npm run typecheck -w @agentic-commons/shared
```

## 托管平台说明

生产 API/Web 平台与基础设施迁移资产属于私有内部内容，不在本仓库分发。

## 安全与密钥

不要提交真实密钥。

生产密钥必须通过 secret manager 管理。

参见：

- `SECURITY.md`

## 贡献

提交 Issue 或 PR 前请先阅读 `CONTRIBUTING.md`。

## 支持

- 使用问题：GitHub Issues
- 功能建议：GitHub Issues
- 安全报告：GitHub Security Advisories（私密）
- 维护策略：best-effort，无 SLA

## 许可证

MIT，见 `LICENSE`。
