<div align="center">

<h1>Agentic Commons</h1>

<h3>Private-by-design AI usage analytics for coding tools</h3>

Track token usage across Claude Code, Codex CLI, OpenCode, Gemini CLI, and more.<br>
Local-first collection, verifiable aggregation, optional cloud sync.<br>
Your prompts never leave your machine.

<img src="https://img.shields.io/badge/🔒_Privacy_First-success?style=for-the-badge" alt="Privacy first">&nbsp;
<img src="https://img.shields.io/badge/🤖_6+_AI_Tools-blue?style=for-the-badge" alt="6+ tools">&nbsp;
<img src="https://img.shields.io/badge/📊_Token_Analytics-purple?style=for-the-badge" alt="Analytics">&nbsp;
<img src="https://img.shields.io/badge/⚡_Auto_Sync-orange?style=for-the-badge" alt="Auto sync">

[![npm version](https://img.shields.io/npm/v/agentic-commons.svg?style=flat-square&color=cb3837)](https://npmjs.com/package/agentic-commons)
[![npm downloads](https://img.shields.io/npm/dm/agentic-commons.svg?style=flat-square&color=blue)](https://npmjs.com/package/agentic-commons)
[![GitHub stars](https://img.shields.io/github/stars/Phlegonlabs/agentic-commons?style=flat-square)](https://github.com/Phlegonlabs/agentic-commons)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

English | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md)

</div>

---

## 📑 Quick Navigation

| Section | Description |
| --- | --- |
| [Quick Start](#-quick-start) | Install in 2 minutes |
| [CLI Commands](#-cli-commands) | Full command reference |
| [Claude Code Skill](#-claude-code-skill) | Use inside Claude Code directly |
| [Supported Tools](#-supported-tools) | Claude, Codex, Gemini, and more |
| [Privacy Boundary](#-privacy-boundary) | What's uploaded vs. what stays local |
| [External CLI Import](#-external-cli-auto-import) | Feed usage from any tool |
| [Local Development](#-local-development) | Build from source |

---

## 🚀 Quick Start

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

After setup, automatic sync is enabled (launchd hourly on macOS, schtasks on Windows, crontab on Linux).

Manual sync (optional):

```bash
acommons sync
```

> **Requirements:** Node.js >= 20, npm >= 10

---

## 🛠 CLI Commands

| Command | Description |
| --- | --- |
| `acommons setup` | First-time setup (hook, scheduler, scripts) |
| `acommons doctor` | Health check and diagnostics |
| `acommons sync` | Collect + upload pipeline |
| `acommons stats` | Today's usage summary |
| `acommons daily` | 14-day daily breakdown |
| `acommons models` | Per-model token usage |
| `acommons total` | All-time aggregated summary |
| `acommons report` | Generate HTML usage report |
| `acommons watch` | Watch mode |
| `acommons link` | Device OAuth authentication |
| `acommons update` | Update to latest version |

---

## 🎯 Claude Code Skill

> **No CLI install required** — use `/acommons` directly inside Claude Code.

<table><tr>
<td><strong>SKILL</strong></td>
<td>

```
npx skills add Phlegonlabs/agentic-commons --skill acommons -g -y
```

</td>
<td>then type <code>/acommons</code> in Claude Code</td>
</tr></table>

The skill reads local data directly and includes a Stop hook for automatic token ledger updates on session end.

<details>
<summary><strong>All skill commands</strong></summary>

| Command | Description |
| --- | --- |
| `/acommons` | Show today's usage (default: stats) |
| `/acommons daily` | 14-day daily breakdown |
| `/acommons models` | Per-model token usage |
| `/acommons total` | All-time summary |
| `/acommons sync` | Run collect + upload pipeline |
| `/acommons setup` | First-time setup |
| `/acommons link` | Device OAuth authentication |
| `/acommons doctor` | Health check and diagnostics |
| `/acommons probe` | Detect all installed AI tools |
| `/acommons report` | Generate HTML usage report |

</details>

---

## 🤖 Supported Tools

| Tool | Config Dir | Data Source | Status |
| --- | --- | --- | :---: |
| Claude Code | `~/.claude` | `stats-cache.json` + ledger | Full |
| Codex CLI | `~/.codex` | `sessions/*.jsonl` + ledger | Full |
| OpenCode | `~/.local/share/opencode` | `opencode.db` | Full |
| Gemini CLI | `~/.gemini` | `session-*.json` | Full |
| Cursor | `~/.cursor` | Probe detection | Detect |
| Windsurf | `~/.codeium` | Probe detection | Detect |
| Aider | `~/.aider` | Probe detection | Detect |
| Goose | `~/.config/goose` | Probe detection | Detect |
| Amp | `~/.config/amp` | Probe detection | Detect |
| Kimi CLI | `~/.kimi` | Probe detection | Detect |
| Kiro | `~/.kiro` | Probe detection | Detect |
| External | `~/.agentic-commons/external-usage/` | `*.jsonl` drop-in | Full |

> **Full** = token-level analytics. **Detect** = `acommons probe` recognizes the tool.

---

## 🔒 Privacy Boundary

**Your prompts never leave your machine.** Only aggregated stats are uploaded.

| Uploaded | Never Uploaded |
| --- | --- |
| `date`, `source`, `model` | Prompt / message content |
| `input_uncached`, `output` | Transcript text and reasoning blocks |
| `cached_read`, `cached_write`, `total_io` | File paths and repository names |
| | Raw session logs |

---

## 📦 External CLI Auto-Import

Drop event logs into `~/.agentic-commons/external-usage/*.jsonl` and `acommons sync` will auto-scan and aggregate them.

**Minimal event shape:**

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
<summary><strong>Also accepted field formats</strong></summary>

| Format | Fields |
| --- | --- |
| Normalized | `input_uncached`, `output`, `cached_read`, `cached_write` |
| Anthropic | `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` |
| Gemini | `usageMetadata.promptTokenCount`, `usageMetadata.candidatesTokenCount` |

</details>

**Quick test:**

```bash
mkdir -p ~/.agentic-commons/external-usage
cat >> ~/.agentic-commons/external-usage/opencode.jsonl <<'JSON'
{"timestamp":"2026-02-19T17:20:00Z","source":"opencode","provider":"openai","model":"gpt-5.1-codex-mini","usage":{"prompt_tokens":1200,"completion_tokens":300}}
JSON
acommons doctor   # verify detection
acommons sync     # upload
```

---

## 🔧 Local Development

```bash
git clone https://github.com/Phlegonlabs/agentic-commons.git
cd agentic-commons
npm install
npm run build:cli
npm run typecheck -w @agentic-commons/shared
```

---

## 📞 Support

| Channel | Link |
| --- | --- |
| Usage Questions | [GitHub Issues](https://github.com/Phlegonlabs/agentic-commons/issues) |
| Feature Requests | [GitHub Issues](https://github.com/Phlegonlabs/agentic-commons/issues) |
| Security Reports | [GitHub Security Advisories](https://github.com/Phlegonlabs/agentic-commons/security/advisories) (private) |

---

<div align="center">

**MIT License** · [Phlegonlabs](https://github.com/Phlegonlabs) — Private-by-design AI usage analytics

</div>
