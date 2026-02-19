# Agentic Commons

Agentic Commons is an open-core project for private-by-design AI usage analytics.

English | [Chinese (Simplified)](./README.zh-CN.md)

## Open-Core Scope

Public in this repository:

- `apps/cli`: `acommons` CLI source
- `packages/shared`: shared schema/types
- Public docs, contribution guidelines, and security reporting policy

Private (not open-sourced in this repository):

- Hosted API implementation
- Hosted web application implementation
- Infrastructure and database migration assets

## What It Does

- Collects local Claude/Codex usage and aggregates daily model-level token totals.
- Syncs to a hosted platform for leaderboard and public profile analytics.
- Keeps prompts, transcript content, and raw logs on your machine.

The English README is the canonical release reference. The Chinese README mirrors functionality and setup.

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

## Local Development (Public Repo)

Install dependencies:

```bash
npm install
```

Validate:

```bash
npm run build:cli
npm run typecheck -w @agentic-commons/shared
```

## Hosted Platform Note

The production API/web platform and infrastructure migrations are private internal assets and are not distributed in this repository.

## Security and Secrets

Never commit real secrets.

Production secrets must be managed via secret managers.

See:

- `SECURITY.md`

## Contributing

Please read `CONTRIBUTING.md` before opening issues or PRs.

## Support

- Usage questions: GitHub Issues
- Feature requests: GitHub Issues
- Security reports: GitHub Security Advisories (private)
- Maintenance policy: best-effort, no SLA

## License

MIT. See `LICENSE`.
