# Agentic Commons (`acommons`) - Implementation Plan

## Context

AI coding tools (Claude Code, OpenAI Codex) store detailed token usage data in local files, butæ²¡æœ‰ç»Ÿä¸€è§†å›¾ã€‚æˆ‘ä»¬è¦åšä¸€ä¸ª CLI å·¥å…· `acommons`ï¼Œè¯»å–æœ¬åœ°æ—¥å¿—ï¼Œå±•ç¤ºè·¨å·¥å…·çš„ token ä½¿ç”¨ç»Ÿè®¡ã€‚

- å…ˆç»™è‡ªå·±ç”¨ï¼ŒåŽé¢å†è€ƒè™‘åˆ†å‘
- Tech stack: TypeScript + Node.js
- çº¯æœ¬åœ°è¯»å–ï¼Œä¸ç¢°å¯¹è¯å†…å®¹ï¼Œä¸è”ç½‘

---

## Data Sources

### Claude Code (read `~/.claude/stats-cache.json`)
- æ¯æ—¥ tokenï¼ˆæŒ‰æ¨¡åž‹æ‹†åˆ†ï¼‰ã€session/message/toolCall æ•°
- ç´¯è®¡ input/output/cacheRead/cacheCreation tokens
- æŒ‰å°æ—¶æ´»è·ƒåˆ†å¸ƒã€æœ€é•¿ session

### OpenAI Codex (read `~/.codex/sessions/{YYYY}/{MM}/{DD}/*.jsonl`)
- æ¯ä¸ª session æ–‡ä»¶æœ€åŽä¸€æ¡ `token_count` äº‹ä»¶ â†’ input/output/cached/reasoning tokens
- Rate limit ç™¾åˆ†æ¯” + é‡ç½®æ—¶é—´
- `session_meta` â†’ æ¨¡åž‹åã€git branch

**ä¸ç¢°**: `history.jsonl`ã€å¯¹è¯å†…å®¹ã€auth æ–‡ä»¶

---

## Commands

| Command | What it does |
|---------|-------------|
| `acommons` / `acommons stats` | ä»Šæ—¥ä¸¤ä¸ªå·¥å…·çš„ç”¨é‡æ±‡æ€» |
| `acommons daily` | æœ€è¿‘ 14 å¤©çš„æ¯æ—¥ç”¨é‡ |
| `acommons models` | æŒ‰æ¨¡åž‹æ‹†åˆ†çš„ token æ¶ˆè€— |
| `acommons rate` | Codex rate limit çŠ¶æ€ï¼ˆå‰©ä½™%ã€é‡ç½®æ—¶é—´ï¼‰ |
| `acommons report` | ç”Ÿæˆé™æ€ HTML æŠ¥å‘Šï¼Œæµè§ˆå™¨æ‰“å¼€çœ‹ tables |

---

## File Structure

```
agentic-commons/
  src/
    cli.ts              -- Entry point, arg routing
    types.ts            -- All shared type definitions
    format.ts           -- Terminal output (tables, colors, numbers)
    commands/
      stats.ts          -- `acommons stats`
      daily.ts          -- `acommons daily`
      models.ts         -- `acommons models`
      rate.ts           -- `acommons rate`
      report.ts         -- `acommons report` (generate static HTML)
      sync.ts           -- `acommons sync` (aggregate to usage.json)
      log.ts            -- `acommons log` (hook callback)
      setup.ts          -- `acommons setup` (inject hooks + scheduler)
    sources/
      paths.ts          -- Cross-platform path resolution
      claude.ts         -- Read stats-cache.json
      codex.ts          -- Reverse-scan JSONL
      store.ts          -- Read/write ~/.agentic-commons/usage.json
  package.json
  tsconfig.json
```

---

## Key Design Decisions

### Codex JSONL Parsing: Reverse Scan

Session files can be 4.6MB+,ä½† `token_count` äº‹ä»¶æ€»åœ¨æœ€åŽå‡ è¡Œã€‚

ç­–ç•¥: åªè¯»æ–‡ä»¶æœ«å°¾ 8KB â†’ ä»ŽåŽå¾€å‰æ‰¾ç¬¬ä¸€æ¡ `token_count` (info !== null) â†’ ç»ä¸åŠ è½½å…¨æ–‡ä»¶ã€‚

```
fs.open() â†’ fstat() size â†’ read last 8KB â†’ split lines â†’ reverse iterate â†’ find match
```

Fallback: 8KB æ²¡æ‰¾åˆ° â†’ æ‰©åˆ° 32KB â†’ still not â†’ full forward scan (should never happen)

`session_meta` åœ¨ç¬¬ 1 è¡Œ: è¯»å‰ 16KB â†’ æ‰¾ç¬¬ä¸€ä¸ª newline â†’ parseã€‚

### No Telemetry in v1

`~/.claude/telemetry/` æ–‡ä»¶æ˜¯ "failed to send" äº‹ä»¶ï¼Œå­˜åœ¨ä¸ä¿è¯ã€‚`stats-cache.json` å·²ç»å¤Ÿç”¨ã€‚Telemetry çš„ per-session cost + lines changed ç•™ç»™ v2ã€‚

### Manual Arg Parsing

4 ä¸ªå›ºå®šå‘½ä»¤ï¼Œä¸éœ€è¦ commander/yargsã€‚`process.argv[2]` åˆ¤æ–­å‘½ä»¤ï¼ŒæœªçŸ¥å‘½ä»¤æ‰“ helpã€‚

---

## Dependencies (Minimal)

**Runtime**: `chalk` v5 (terminal colors, auto-detect support)
**Dev**: `typescript`, `@types/node`

Total: 1 runtime dependency.

---

## Commands (Final)

| Command | What it does |
|---------|-------------|
| `acommons` / `acommons stats` | ä»Šæ—¥ä¸¤ä¸ªå·¥å…·çš„ç”¨é‡æ±‡æ€» (terminal) |
| `acommons daily` | æœ€è¿‘ 14 å¤©çš„æ¯æ—¥ç”¨é‡ (terminal) |
| `acommons models` | æŒ‰æ¨¡åž‹æ‹†åˆ†çš„ token æ¶ˆè€— (terminal) |
| `acommons rate` | Codex rate limit çŠ¶æ€ (terminal) |
| `acommons report` | ç”Ÿæˆé™æ€ HTML æŠ¥å‘Šï¼Œè‡ªåŠ¨æ‰“å¼€æµè§ˆå™¨ |
| `acommons setup` | ä¸€æ¬¡æ€§é…ç½®ï¼šæ³¨å…¥ hooks + è®¾ç½®å®šæ—¶ä»»åŠ¡ |
| `acommons sync` | è¯»å–ä¸¤å®¶æ•°æ®ï¼Œèšåˆåˆ° `~/.agentic-commons/usage.json` |
| `acommons log` | è¢« hook è°ƒç”¨ï¼Œè®°å½•å•æ¬¡ session ç»Ÿè®¡ï¼ˆå†…éƒ¨å‘½ä»¤ï¼‰ |

---

## Automation Architecture

### `acommons setup` åšçš„äº‹

1. åˆ›å»º `~/.agentic-commons/` ç›®å½•
2. æ³¨å…¥ Claude Code Hook â†’ `~/.claude/settings.json` çš„ `hooks.Stop` åŠ ä¸€æ¡ `acommons log`
3. æ³¨å…¥ Codex Hookï¼ˆå¦‚æžœ `~/.codex/` å­˜åœ¨ï¼‰
4. è®¾ç½®ç³»ç»Ÿå®šæ—¶ä»»åŠ¡ï¼ˆæ¯å°æ—¶æ‰§è¡Œ `acommons sync && acommons report`ï¼‰:
   - Windows: `schtasks /create /tn "AgenticCommons" /tr "acommons sync && acommons report" /sc hourly`
   - macOS: å†™ `~/Library/LaunchAgents/com.agentic-commons.plist`
   - Linux: å†™ crontab `0 * * * * acommons sync && acommons report`
5. é¦–æ¬¡è¿è¡Œ `acommons sync` ç”Ÿæˆåˆå§‹æ•°æ®

### Data Storage (`~/.agentic-commons/`)

```
~/.agentic-commons/
  usage.json         -- èšåˆåŽçš„ç»Ÿä¸€æ ¼å¼æ•°æ®
  report.html        -- æœ€æ–°çš„ HTML æŠ¥å‘Š
  config.json        -- setup é…ç½®ï¼ˆå“ªäº› hooks è£…äº†ã€scheduler çŠ¶æ€ï¼‰
```

### `acommons sync` é€»è¾‘

1. è¯» `~/.claude/stats-cache.json` â†’ æå– Claude æ•°æ®
2. æ‰«æ `~/.codex/sessions/` â†’ æå– Codex æ•°æ®
3. åˆå¹¶å†™å…¥ `~/.agentic-commons/usage.json`

### `acommons log` é€»è¾‘ï¼ˆè¢« hook è°ƒç”¨ï¼‰

1. è¢« Claude Code Stop hook è§¦å‘
2. è¯» `~/.claude/stats-cache.json` æœ€æ–°ä¸€æ¡
3. Append åˆ° `~/.agentic-commons/usage.json`
4. å¯é€‰ï¼šterminal æ‰“å°ä¸€è¡Œå½“æ¬¡ session ç»Ÿè®¡

### è‡ªåŠ¨åŒ–æµç¨‹å›¾

```
å®‰è£…: npm i -g agentic-commons
é…ç½®: acommons setup
         â†“
    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
    â”‚ Claude Code    â”‚     â”‚ Codex           â”‚
    â”‚ Stop Hook      â”‚     â”‚ (å®šæ—¶ä»»åŠ¡æ‰«æ)    â”‚
    â”‚ â†’ acommons log       â”‚     â”‚                 â”‚
    â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â†“                      â†“
    ~/.agentic-commons/usage.json
         â†“
    acommons report â†’ report.html
         â†“
    æµè§ˆå™¨æ‰“å¼€çœ‹ç»“æžœ
```

---

## Implementation Sequence

### Step 1: Project Skeleton
- `package.json` (bin: `"acommons": "./dist/cli.js"`)
- `tsconfig.json` (ESM, target ES2022, strict)
- `src/types.ts` (all shared types)

### Step 2: Core Sources
- `src/sources/paths.ts` (os.homedir + path.join)
- `src/sources/claude.ts` (JSON.parse stats-cache.json)
- `src/sources/codex.ts` (reverse JSONL scan)

### Step 3: CLI Commands
- `src/format.ts` (number formatting, table alignment, chalk)
- `src/cli.ts` (entry point + routing)
- `src/commands/stats.ts`
- `src/commands/daily.ts`
- `src/commands/models.ts`
- `src/commands/rate.ts`
- Test: `npm link && acommons stats`

### Step 4: Sync + Storage
- `src/commands/sync.ts` (read both sources â†’ write usage.json)
- `src/commands/log.ts` (hook callback, append to usage.json)

### Step 5: HTML Report
- `src/commands/report.ts` (generate self-contained HTML from usage.json)

### Step 6: Setup + Automation
- `src/commands/setup.ts`
  - Inject Claude Code hook into `~/.claude/settings.json`
  - Detect OS, create scheduler (schtasks / launchd / crontab)
  - Write `~/.agentic-commons/config.json`
  - Run initial sync

---

## Types (Core)

```typescript
type ToolSource = 'claude' | 'codex'

type DailyTokens = {
  date: string
  source: ToolSource
  model: string
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  reasoningTokens: number
  totalTokens: number
}

type DailySummary = {
  date: string
  source: ToolSource
  sessions: number
  messages: number
  toolCalls: number
  totalTokens: number
}

type ModelUsage = {
  model: string
  source: ToolSource
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  reasoningTokens: number
  totalTokens: number
}

type RateLimit = {
  name: string
  usedPercent: number
  windowMinutes: number
  resetsAt: number
}

type CodexRateStatus = {
  limits: RateLimit[]
  credits: { hasCredits: boolean; unlimited: boolean; balance: number | null }
  timestamp: string
}
```

---

## Expected Output Examples

### `acommons stats`
```
  Agentic Commons - Today (2026-02-17)

  Tool     Sessions  Messages  Tokens      Tool Calls
  Claude   5         398       48,559      71
  Codex    2         --        796,558     --
  Total    7                   845,117
```

### `acommons rate`
```
  Codex Rate Limits

  5-hour   [â–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘]  23%   resets in 3h 42m
  7-day    [â–ˆâ–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘]   7%   resets 2026-02-24
```

### `acommons report`
Generates `report.html` and auto-opens in browser. Content:

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Agentic Commons Report - 2026-02-17               â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                     â”‚
â”‚  TODAY                                              â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚ Tool     â”‚ Sessions â”‚ Messages â”‚ Tokens        â”‚ â”‚
â”‚  â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤ â”‚
â”‚  â”‚ Claude   â”‚ 5        â”‚ 398      â”‚ 48,559        â”‚ â”‚
â”‚  â”‚ Codex    â”‚ 2        â”‚ --       â”‚ 796,558       â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                     â”‚
â”‚  DAILY TREND (14 days)                              â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”      â”‚
â”‚  â”‚ Date       â”‚ Claude        â”‚ Codex        â”‚      â”‚
â”‚  â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤      â”‚
â”‚  â”‚ 02-17      â”‚ 48,559        â”‚ 796,558      â”‚      â”‚
â”‚  â”‚ 02-16      â”‚ 398           â”‚ 1,200,000    â”‚      â”‚
â”‚  â”‚ ...        â”‚ ...           â”‚ ...          â”‚      â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜      â”‚
â”‚                                                     â”‚
â”‚  MODEL BREAKDOWN                                    â”‚
â”‚  RATE LIMITS                                        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

Implementation: string template literals generating HTML with inline `<style>`.
No framework, no build step, no chart library. Pure HTML tables + CSS.

---

## Verification

1. `npm run build` â†’ no TypeScript errors
2. `npm link` â†’ `acommons` command available globally
3. `acommons stats` â†’ shows Claude + Codex today's data
4. `acommons daily` â†’ shows 14-day table
5. `acommons models` â†’ shows per-model breakdown
6. `acommons rate` â†’ shows Codex rate limit bars
7. Cross-check: compare `acommons stats` output against raw `stats-cache.json` values
8. `acommons report` â†’ generates HTML, opens in browser, tables render correctly

