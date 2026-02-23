<div align="center">

<h1>Agentic Commons</h1>

<h3>隱私優先的 AI 編程工具使用量分析</h3>

追蹤 Claude Code、Codex CLI、OpenCode、Gemini CLI 等工具的 token 用量。<br>
本機優先採集，可驗證聚合，可選雲端同步。<br>
你的 prompt 永遠不會離開你的機器。

<img src="https://img.shields.io/badge/🔒_隱私優先-success?style=for-the-badge" alt="Privacy first">&nbsp;
<img src="https://img.shields.io/badge/🤖_6+_AI_工具-blue?style=for-the-badge" alt="6+ tools">&nbsp;
<img src="https://img.shields.io/badge/📊_Token_分析-purple?style=for-the-badge" alt="Analytics">&nbsp;
<img src="https://img.shields.io/badge/⚡_自動同步-orange?style=for-the-badge" alt="Auto sync">

[![npm version](https://img.shields.io/npm/v/agentic-commons.svg?style=flat-square&color=cb3837)](https://npmjs.com/package/agentic-commons)
[![npm downloads](https://img.shields.io/npm/dm/agentic-commons.svg?style=flat-square&color=blue)](https://npmjs.com/package/agentic-commons)
[![GitHub stars](https://img.shields.io/github/stars/Phlegonlabs/agentic-commons?style=flat-square)](https://github.com/Phlegonlabs/agentic-commons)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[English](./README.md) | [简体中文](./README.zh-CN.md) | 繁體中文

</div>

---

## 📑 快速導覽

| 章節 | 說明 |
| --- | --- |
| [快速開始](#-快速開始) | 2 分鐘完成安裝 |
| [CLI 命令](#-cli-命令) | 完整命令參考 |
| [Claude Code Skill](#-claude-code-skill) | 在 Claude Code 內直接使用 |
| [支援的工具](#-支援的工具) | Claude、Codex、Gemini 等 |
| [隱私邊界](#-隱私邊界) | 上傳什麼 vs. 留在本機什麼 |
| [外部 CLI 匯入](#-外部-cli-自動匯入) | 接入任意工具的用量 |
| [本機開發](#-本機開發) | 從原始碼建置 |

---

## 🚀 快速開始

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

setup 完成後自動啟用定時同步（macOS launchd 每小時，Windows schtasks，Linux crontab）。

手動同步（可選）：

```bash
acommons sync
```

> **環境需求：** Node.js >= 20, npm >= 10

---

## 🛠 CLI 命令

| 命令 | 說明 |
| --- | --- |
| `acommons setup` | 首次設定（hook、排程、腳本） |
| `acommons doctor` | 健康檢查與診斷 |
| `acommons sync` | 採集 + 上傳流水線 |
| `acommons stats` | 今日使用量概覽 |
| `acommons daily` | 14 天每日明細 |
| `acommons models` | 按模型統計 token 用量 |
| `acommons total` | 全量彙總 |
| `acommons report` | 產生 HTML 使用報告 |
| `acommons watch` | 監控模式 |
| `acommons link` | 裝置 OAuth 認證 |
| `acommons update` | 更新到最新版本 |

---

## 🎯 Claude Code Skill

在 Claude Code 內直接使用 `/acommons` — 查看統計無需安裝 CLI。

```
/acommons            顯示今日用量（預設：stats）
/acommons daily      14 天每日明細
/acommons models     按模型統計 token 用量
/acommons total      全量彙總
/acommons sync       執行採集 + 上傳流水線
/acommons setup      首次設定
/acommons link       裝置 OAuth 認證
/acommons doctor     健康檢查與診斷
/acommons probe      偵測已安裝的 AI 工具
/acommons report     產生 HTML 使用報告
```

**安裝 skill：**

```bash
npx skills add Phlegonlabs/agentic-commons --skill acommons -g -y
```

Skill 直接讀取本機資料，並包含 Stop hook 在工作階段結束時自動更新 token 帳本。

---

## 🤖 支援的工具

| 工具 | 設定目錄 | 資料來源 | 狀態 |
| --- | --- | --- | :---: |
| Claude Code | `~/.claude` | `stats-cache.json` + ledger | 完整 |
| Codex CLI | `~/.codex` | `sessions/*.jsonl` + ledger | 完整 |
| OpenCode | `~/.local/share/opencode` | `opencode.db` | 完整 |
| Gemini CLI | `~/.gemini` | `session-*.json` | 完整 |
| Cursor | `~/.cursor` | 探測識別 | 探測 |
| Windsurf | `~/.codeium` | 探測識別 | 探測 |
| Aider | `~/.aider` | 探測識別 | 探測 |
| Goose | `~/.config/goose` | 探測識別 | 探測 |
| Amp | `~/.config/amp` | 探測識別 | 探測 |
| Kimi CLI | `~/.kimi` | 探測識別 | 探測 |
| Kiro | `~/.kiro` | 探測識別 | 探測 |
| External | `~/.agentic-commons/external-usage/` | `*.jsonl` 投遞 | 完整 |

> **完整** = token 級分析。**探測** = `acommons probe` 可識別該工具。

---

## 🔒 隱私邊界

**你的 prompt 永遠不會離開你的機器。** 僅上傳聚合統計。

| 會上傳 | 永不上傳 |
| --- | --- |
| `date`, `source`, `model` | Prompt / message 內容 |
| `input_uncached`, `output` | Transcript 文字與 reasoning blocks |
| `cached_read`, `cached_write`, `total_io` | 檔案路徑與倉庫名 |
| | 原始工作階段日誌 |

---

## 📦 外部 CLI 自動匯入

將事件日誌放入 `~/.agentic-commons/external-usage/*.jsonl`，`acommons sync` 會自動掃描並聚合。

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
<summary><strong>也接受的欄位格式</strong></summary>

| 格式 | 欄位 |
| --- | --- |
| 標準化 | `input_uncached`, `output`, `cached_read`, `cached_write` |
| Anthropic | `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` |
| Gemini | `usageMetadata.promptTokenCount`, `usageMetadata.candidatesTokenCount` |

</details>

---

## 🔧 本機開發

```bash
git clone https://github.com/Phlegonlabs/agentic-commons.git
cd agentic-commons
npm install
npm run build:cli
npm run typecheck -w @agentic-commons/shared
```

---

## 📞 支援

| 管道 | 連結 |
| --- | --- |
| 使用問題 | [GitHub Issues](https://github.com/Phlegonlabs/agentic-commons/issues) |
| 功能建議 | [GitHub Issues](https://github.com/Phlegonlabs/agentic-commons/issues) |
| 安全報告 | [GitHub Security Advisories](https://github.com/Phlegonlabs/agentic-commons/security/advisories)（私密） |

---

<div align="center">

**MIT License** · [Phlegonlabs](https://github.com/Phlegonlabs) — 隱私優先的 AI 使用量分析

</div>
