# Data Sources Reference

## Claude Code

**Path:** `~/.claude/stats-cache.json`
**Format:** JSON

```json
{
  "version": 1,
  "dailyActivity": [{ "date": "2025-01-15", "messageCount": 42, "sessionCount": 3, "toolCallCount": 120 }],
  "dailyModelTokens": [{ "date": "2025-01-15", "tokensByModel": { "claude-sonnet-4-20250514": 150000 } }],
  "modelUsage": {
    "claude-sonnet-4-20250514": {
      "inputTokens": 100000, "outputTokens": 50000,
      "cacheReadInputTokens": 200000, "cacheCreationInputTokens": 30000,
      "costUSD": 1.23, "contextWindow": 200000, "maxOutputTokens": 16384
    }
  },
  "totalSessions": 100, "totalMessages": 500, "firstSessionDate": "2025-01-01"
}
```

**Realtime Ledger:** `~/.agentic-commons/claude-ledger.json`

Maintained by hook.mjs. Has per-model input/output split (more accurate than stats-cache).

```json
{
  "version": 1,
  "dailyByModel": {
    "2025-01-15": {
      "claude-sonnet-4-20250514": {
        "inputUncached": 80000, "output": 50000,
        "cachedRead": 200000, "cachedWrite": 30000, "totalIO": 130000
      }
    }
  },
  "cursors": {
    "session:abc-123": {
      "transcriptPath": "/home/user/.claude/projects/.../transcript.jsonl",
      "processedLines": 1234, "sessionId": "abc-123", "updatedAt": "2025-01-15T10:00:00Z"
    }
  }
}
```

---

## Codex CLI

**Path:** `~/.codex/sessions/**/*.jsonl`
**Format:** JSONL (one JSON object per line)

**First line** — session metadata:
```json
{ "type": "session_meta", "payload": { "id": "2025-01-15T...", "model_provider": "openai", "cli_version": "1.0.0" } }
```

**Last lines** — token count event (search backward):
```json
{
  "timestamp": "2025-01-15T12:00:00Z",
  "type": "event_msg",
  "payload": {
    "type": "token_count",
    "info": {
      "total_token_usage": {
        "input_tokens": 50000, "cached_input_tokens": 10000,
        "output_tokens": 20000, "reasoning_output_tokens": 5000, "total_tokens": 70000
      }
    }
  }
}
```

**Model** from `turn_context` entry: `payload.model` or `payload.settings.model`

**Token formula:** `input_uncached = input_tokens - cached_input_tokens`

**Realtime Ledger:** `~/.agentic-commons/codex-ledger.json` (same structure, keys are `JSON.stringify([provider, model])`)

---

## OpenCode

**Path:** `~/.local/share/opencode/opencode.db`
**Format:** SQLite

**Query:**
```sql
SELECT
  date(time_created / 1000, 'unixepoch', 'localtime') as date,
  json_extract(data, '$.providerID') as provider,
  json_extract(data, '$.modelID') as model,
  COALESCE(SUM(json_extract(data, '$.tokens.input')), 0) as inputUncached,
  COALESCE(SUM(json_extract(data, '$.tokens.output')), 0) as output,
  COALESCE(SUM(json_extract(data, '$.tokens.cache.read')), 0) as cachedRead,
  COALESCE(SUM(json_extract(data, '$.tokens.cache.write')), 0) as cachedWrite
FROM message
WHERE json_extract(data, '$.role') = 'assistant'
  AND json_extract(data, '$.tokens') IS NOT NULL
GROUP BY date, provider, model
```

**Config dir:** `~/.opencode/` (Linux/macOS) or `~/AppData/Roaming/opencode` (Windows)

---

## Gemini CLI

**Path:** `~/.gemini/tmp/*/chats/session-*.json`
**Format:** JSON

```json
{
  "sessionId": "abc", "startTime": "2025-01-15T10:00:00Z", "lastUpdated": "...",
  "messages": [
    {
      "type": "gemini", "model": "gemini-2.5-pro",
      "tokens": { "input": 50000, "output": 10000, "cached": 20000, "thoughts": 5000, "tool": 0, "total": 65000 }
    }
  ]
}
```

**Important:** `input` INCLUDES cached tokens. Formula: `input_uncached = input - cached`

---

## External Usage

**Path:** `~/.agentic-commons/external-usage/*.jsonl`
**Format:** JSONL — flexible schema, auto-detected

### Supported token formats (checked in priority order):

**1. Direct fields:**
```json
{ "date": "2025-01-15", "model": "gpt-4o", "input_uncached": 1000, "output": 500, "cached_read": 200, "cached_write": 0 }
```

**2. Anthropic format (nested `usage`):**
```json
{ "date": "...", "model": "claude-3.5-sonnet", "usage": { "input_tokens": 1000, "output_tokens": 500, "cache_read_input_tokens": 200, "cache_creation_input_tokens": 0 } }
```

**3. OpenAI format:**
```json
{ "date": "...", "model": "gpt-4o", "usage": { "prompt_tokens": 1200, "completion_tokens": 500, "prompt_tokens_details": { "cached_tokens": 200 } } }
```

**4. Google format:**
```json
{ "date": "...", "model": "gemini-2.5-pro", "usageMetadata": { "promptTokenCount": 1200, "candidatesTokenCount": 500, "cachedContentTokenCount": 200 } }
```

### Date resolution (first match wins):
`date` → `timestamp` → `created_at` → `created`

Supports: ISO date string, ISO datetime, unix timestamp (seconds or milliseconds)

### Provider inference from model name:
- `gpt-*`, `o1-*`, `o3-*`, `o4-*` → `openai`
- `claude-*` → `anthropic`
- `gemini-*` → `google`

---

## Normalized Output Format (UsageDaily)

All sources normalize to:

```json
{
  "date": "2025-01-15",
  "source": "claude",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "input_uncached": 80000,
  "output": 50000,
  "cached_read": 200000,
  "cached_write": 30000,
  "total_io": 130000
}
```

- `total_io = input_uncached + output` (does NOT include cached tokens)
- Dedup key: `date|source|provider|model`
- Min upload threshold: 1,000 total_io tokens
