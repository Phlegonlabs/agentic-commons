# Agentic Commons

Agentic Commons is a CLI + API + Web stack for private-by-design AI usage analytics.

English | [Chinese (Simplified)](./README.zh-CN.md)

## What It Does

- Collects local Claude/Codex usage and aggregates daily model-level token totals.
- Syncs to cloud for leaderboard and public profile analytics.
- Keeps prompts, transcript content, and raw logs on your machine.

The English README is the canonical release reference. The Chinese README mirrors functionality and setup.

## Core Principles

- Privacy-first telemetry: upload allowlist only.
- Verifiable aggregation: model/day/token totals are auditable.
- Practical automation: setup installs scheduler and runs health checks.

## Repository Status

This repository is currently in open-source readiness mode and may remain private until maintainers publish it.

## Repository Layout

- `apps/cli`: `acommons` CLI source
- `apps/api`: Cloudflare Worker API
- `apps/web`: React + Tailwind frontend
- `packages/shared`: shared schema/types
- `supabase/migrations`: SQL migrations
- `docs/oss`: open-source readiness docs

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

## Local Development

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

## Deployment

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

## Security and Secrets

Never commit real secrets.

Examples only:

- `.env.example`
- `.env.production.example`

Production secrets must be managed via secret managers (Cloudflare/Supabase/GitHub).

See:

- `SECURITY.md`

## Web Routes

- `/`: home
- `/leaderboard`: leaderboard
- `/login`: login
- `/cli-commands`: CLI command reference
- `/privacy`: privacy summary
- `/terms`: terms
- `/changelog`: changelog
- `/me`: personal profile
- `/u/:handle`: public profile

## Contributing

Please read `CONTRIBUTING.md` before opening issues or PRs.

## Support

- Usage questions: GitHub Issues
- Feature requests: GitHub Issues
- Security reports: GitHub Security Advisories (private)
- Maintenance policy: best-effort, no SLA

See `SUPPORT.md` for details.

## License

MIT. See `LICENSE`.
