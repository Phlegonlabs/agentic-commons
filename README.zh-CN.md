<div align="center">

<h1>Agentic Commons</h1>

<h3>隐私优先的 AI 编程工具使用量分析</h3>

追踪 Claude Code、Codex CLI、OpenCode、Gemini CLI 等工具的 token 用量。<br>
本地优先采集，可验证聚合，可选云端同步。<br>
你的 prompt 永远不会离开你的机器。

<img src="https://img.shields.io/badge/🔒_隐私优先-success?style=for-the-badge" alt="Privacy first">&nbsp;
<img src="https://img.shields.io/badge/🤖_6+_AI_工具-blue?style=for-the-badge" alt="6+ tools">&nbsp;
<img src="https://img.shields.io/badge/📊_Token_分析-purple?style=for-the-badge" alt="Analytics">&nbsp;
<img src="https://img.shields.io/badge/⚡_自动同步-orange?style=for-the-badge" alt="Auto sync">

[![npm version](https://img.shields.io/npm/v/agentic-commons.svg?style=flat-square&color=cb3837)](https://npmjs.com/package/agentic-commons)
[![npm downloads](https://img.shields.io/npm/dm/agentic-commons.svg?style=flat-square&color=blue)](https://npmjs.com/package/agentic-commons)
[![GitHub stars](https://img.shields.io/github/stars/Phlegonlabs/agentic-commons?style=flat-square)](https://github.com/Phlegonlabs/agentic-commons)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[English](./README.md) | 简体中文 | [繁體中文](./README.zh-TW.md)

</div>

---

## 📑 快速导航

| 章节 | 说明 |
| --- | --- |
| [快速开始](#-快速开始) | 2 分钟完成安装 |
| [CLI 命令](#-cli-命令) | 完整命令参考 |
| [Claude Code Skill](#-claude-code-skill) | 在 Claude Code 内直接使用 |
| [支持的工具](#-支持的工具) | Claude、Codex、Gemini 等 |
| [隐私边界](#-隐私边界) | 上传什么 vs. 留在本地什么 |
| [外部 CLI 导入](#-外部-cli-自动导入) | 接入任意工具的用量 |
| [本地开发](#-本地开发) | 从源码构建 |

---

## 🚀 快速开始

**macOS / Linux:**

```bash
npm i -g agentic-commons
acommons setup
acommons doctor
```

**Windows:**

```powershell
npm i -g agentic-commons
acommons setup
acommons doctor
```

setup 完成后自动启用定时同步（macOS launchd 每小时，Windows schtasks，Linux crontab）。

手动同步（可选）：

```bash
acommons sync
```

> **环境要求：** Node.js >= 20, npm >= 10

---

## 🛠 CLI 命令

| 命令 | 说明 |
| --- | --- |
| `acommons setup` | 首次配置（hook、定时任务、脚本） |
| `acommons doctor` | 健康检查与诊断 |
| `acommons sync` | 采集 + 上传流水线 |
| `acommons stats` | 今日使用量概览 |
| `acommons daily` | 14 天每日明细 |
| `acommons models` | 按模型统计 token 用量 |
| `acommons total` | 全量汇总 |
| `acommons report` | 生成 HTML 使用报告 |
| `acommons watch` | 监控模式 |
| `acommons link` | 设备 OAuth 认证 |
| `acommons update` | 更新到最新版本 |

---

## 🎯 Claude Code Skill

> **无需安装 CLI** — 在 Claude Code 内直接使用 `/acommons`。

<table><tr>
<td><strong>SKILL</strong></td>
<td>

```
npx skills add Phlegonlabs/agentic-commons --skill acommons -g -y
```

</td>
<td>然后在 Claude Code 中输入 <code>/acommons</code></td>
</tr></table>

Skill 直接读取本地数据，并包含 Stop hook 在会话结束时自动更新 token 账本。

<details>
<summary><strong>全部 skill 命令</strong></summary>

| 命令 | 说明 |
| --- | --- |
| `/acommons` | 显示今日使用量（默认：stats） |
| `/acommons daily` | 14 天每日明细 |
| `/acommons models` | 按模型统计 token 用量 |
| `/acommons total` | 全量汇总 |
| `/acommons sync` | 执行采集 + 上传流水线 |
| `/acommons setup` | 首次配置 |
| `/acommons link` | 设备 OAuth 认证 |
| `/acommons doctor` | 健康检查与诊断 |
| `/acommons probe` | 探测已安装的 AI 工具 |
| `/acommons report` | 生成 HTML 使用报告 |

</details>

---

## 🤖 支持的工具

| 工具 | 配置目录 | 数据源 | 状态 |
| --- | --- | --- | :---: |
| Claude Code | `~/.claude` | `stats-cache.json` + ledger | 完整 |
| Codex CLI | `~/.codex` | `sessions/*.jsonl` + ledger | 完整 |
| OpenCode | `~/.local/share/opencode` | `opencode.db` | 完整 |
| Gemini CLI | `~/.gemini` | `session-*.json` | 完整 |
| Cursor | `~/.cursor` | 探测识别 | 探测 |
| Windsurf | `~/.codeium` | 探测识别 | 探测 |
| Aider | `~/.aider` | 探测识别 | 探测 |
| Goose | `~/.config/goose` | 探测识别 | 探测 |
| Amp | `~/.config/amp` | 探测识别 | 探测 |
| Kimi CLI | `~/.kimi` | 探测识别 | 探测 |
| Kiro | `~/.kiro` | 探测识别 | 探测 |
| External | `~/.agentic-commons/external-usage/` | `*.jsonl` 投递 | 完整 |

> **完整** = token 级分析。**探测** = `acommons probe` 可识别该工具。

---

## 🔒 隐私边界

**你的 prompt 永远不会离开你的机器。** 仅上传聚合统计。

| 会上传 | 永不上传 |
| --- | --- |
| `date`, `source`, `model` | Prompt / message 内容 |
| `input_uncached`, `output` | Transcript 文本与 reasoning blocks |
| `cached_read`, `cached_write`, `total_io` | 文件路径与仓库名 |
| | 原始会话日志 |

---

## 📦 外部 CLI 自动导入

将事件日志放入 `~/.agentic-commons/external-usage/*.jsonl`，`acommons sync` 会自动扫描并聚合。

**最小事件格式：**

```json
{
  "timestamp": "2026-02-19T16:55:00Z",
  "source": "opencode",
  "provider": "openai",
  "model": "gpt-5.1-codex-mini",
  "usage": { "prompt_tokens": 1200, "completion_tokens": 320 }
}
```

<details>
<summary><strong>也接受的字段格式</strong></summary>

| 格式 | 字段 |
| --- | --- |
| 标准化 | `input_uncached`, `output`, `cached_read`, `cached_write` |
| Anthropic | `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` |
| Gemini | `usageMetadata.promptTokenCount`, `usageMetadata.candidatesTokenCount` |

</details>

---

## 🔧 本地开发

```bash
git clone https://github.com/Phlegonlabs/agentic-commons.git
cd agentic-commons
npm install
npm run build:cli
npm run typecheck -w @agentic-commons/shared
```

---

## 📞 支持

| 渠道 | 链接 |
| --- | --- |
| 使用问题 | [GitHub Issues](https://github.com/Phlegonlabs/agentic-commons/issues) |
| 功能建议 | [GitHub Issues](https://github.com/Phlegonlabs/agentic-commons/issues) |
| 安全报告 | [GitHub Security Advisories](https://github.com/Phlegonlabs/agentic-commons/security/advisories)（私密） |

---

<div align="center">

**MIT License** · [Phlegonlabs](https://github.com/Phlegonlabs) — 隐私优先的 AI 使用量分析

</div>
