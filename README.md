# Agentic Commons

Agentic Commons is an open-core project for private-by-design AI usage analytics.

English | [Chinese (Simplified)](./README.zh-CN.md) | [Chinese (Traditional)](./README.zh-TW.md)

## What It Does

- Collects local Claude/Codex usage and aggregates daily model-level token totals.
- Syncs to a hosted platform for leaderboard and public profile analytics.
- Keeps prompts, transcript content, and raw logs on your machine.

The English README is the canonical release reference. Chinese docs provide localized summaries.

## Core Principles

- Privacy-first telemetry: upload allowlist only.
- Verifiable aggregation: model/day/token totals are auditable.
- Practical automation: setup installs scheduler and runs health checks.

## Privacy Boundary

### Uploaded fields

- `date`, `source`, `model`
- `input_uncached`, `output`, `cached_read`, `cached_write`, `total_io`

### Never uploaded

- Prompt/message content
- Transcript text and reasoning blocks
- File paths and repository names
- Raw session logs

## Requirements

- Node.js >= 20
- npm >= 10

## Quick Start (Mac)

```bash
node -v
npm -v
npm i -g agentic-commons
acommons setup
acommons doctor
```

After setup, automatic sync is enabled (launchd hourly).

Manual sync (optional):

```bash
acommons sync
```

## Quick Start (Windows)

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

## CLI Commands

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

## External CLI Auto-Import

Use this when you want many third-party CLI tools to feed usage automatically.

- Drop event logs into `~/.agentic-commons/external-usage/*.jsonl` (or `*.ndjson`).
- Each line should be one JSON object.
- `acommons sync` will auto-scan and aggregate these rows by `date + source + provider + model`.

Minimal event shape:

```json
{
  "timestamp": "2026-02-19T16:55:00Z",
  "source": "opencode",
  "provider": "openai",
  "model": "gpt-5.1-codex-mini",
  "usage": {
    "prompt_tokens": 1200,
    "completion_tokens": 320
  }
}
```

Also accepted:

- normalized fields: `input_uncached`, `output`, `cached_read`, `cached_write`
- Anthropic fields: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`
- Gemini fields under `usageMetadata`: `promptTokenCount`, `candidatesTokenCount`

### Local Test Then Upload

1. Create sample events:

```bash
mkdir -p ~/.agentic-commons/external-usage
cat >> ~/.agentic-commons/external-usage/opencode.jsonl <<'JSON'
{"timestamp":"2026-02-19T17:20:00Z","source":"opencode","provider":"openai","model":"gpt-5.1-codex-mini","usage":{"prompt_tokens":1200,"completion_tokens":300}}
JSON
```

2. Verify local discovery:

```bash
acommons doctor
```

Look for:
- `External usage dropbox`
- `OpenCode dir`
- `External parsed rows`

3. Upload:

```bash
acommons sync
```

4. Optional template:

Use `templates/multi-cli-usage-writer-template.mjs` as the standard writer for other CLI tools.

## Local Development

Install dependencies:

```bash
npm install
```

Validate:

```bash
npm run build:cli
npm run typecheck -w @agentic-commons/shared
```

## Security and Secrets

Never commit real secrets.

Production secrets must be managed via secret managers.

See:

- `SECURITY.md`

## Contributing

Please read `CONTRIBUTING.md` before opening issues.

## Support

- Usage questions: GitHub Issues
- Feature requests: GitHub Issues
- Security reports: GitHub Security Advisories (private)
- Maintenance policy: best-effort, no SLA

## License

MIT. See `LICENSE`.
