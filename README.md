# agentic-commons

Agentic Commons is a CLI + API + Web app for Claude/Codex token analytics.

## Project Layout

- `apps/cli/src/*`: CLI source (`acommons` command)
- `apps/api`: API service (Cloudflare Worker entry + local Node server)
- `apps/web`: frontend (React Router + Tailwind)
- `packages/shared`: shared schema/types
- `plans/*`: planning docs

## Requirements

- Node.js >= 20
- npm >= 10

## Open Source Safety

This repo is safe to open source if secrets stay out of git.

- Commit only example env files (for example `apps/web/.env.production.example`).
- Do not commit real values in `.env*` or `apps/web/.env.production.local`.
- Keep API secrets in Cloudflare Worker secrets only:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `API_TOKEN_PEPPER`
- Build-time web vars (`VITE_*`) should be injected locally or in CI, not stored in git.
- If someone forks this repo, they must set up their own Supabase and Cloudflare project.

## Local Run (Developer)

1. Install dependencies:

```bash
npm install
```

2. Start API (terminal A):

```bash
npm run dev:api
```

API default: `http://127.0.0.1:8787`

3. Start Web (terminal B):

```powershell
$env:VITE_API_BASE="http://127.0.0.1:8787"
$env:VITE_SUPABASE_URL="https://<your-project>.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="<your-anon-key>"
npm run dev:web
```

Web default: `http://127.0.0.1:5173`

## CLI Usage

Install globally from local repo:

```bash
npm run build
npm i -g .
```

Basic commands:

```bash
acommons setup
acommons stats
acommons daily
acommons models
acommons rate
acommons report
acommons link
acommons update
acommons doctor
acommons total
acommons watch
```

### MacBook Quick Start

Prerequisite: Node.js and npm are already installed.

```bash
node -v
npm -v
npm i -g agentic-commons
acommons setup
acommons doctor
```

After `setup`, automatic sync is enabled (macOS `launchd`, hourly).  
Manual upload is optional:

```bash
acommons sync
```

### Mac Troubleshooting

If `acommons` is not found:

```bash
which acommons
npm i -g agentic-commons
```

If auto sync is not running:

```bash
launchctl list | grep com.agentic-commons
cat ~/Library/LaunchAgents/com.agentic-commons.plist
launchctl unload ~/Library/LaunchAgents/com.agentic-commons.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.agentic-commons.plist
acommons doctor
```

Optional cloud upload from CLI:

```powershell
$env:ACOMMONS_API_URL="http://127.0.0.1:8787"
$env:ACOMMONS_USER_ID="demo-user"
acommons sync
```

Or with JWT:

```powershell
$env:ACOMMONS_API_URL="http://127.0.0.1:8787"
$env:ACOMMONS_API_TOKEN="<your-jwt>"
acommons sync
```

## Web Pages

- `/`: home + install guide
- `/cli-commands`: CLI command reference
- `/login`: Google OAuth + Email Magic Link
- `/auth/callback`: auth callback landing
- `/onboarding/profile`: first-login handle/profile setup
- `/onboarding/privacy`: first-login privacy selection
- `/leaderboard`: ranking tabs (`24h`, `7d`, `all`)
- `/privacy`: privacy summary
- `/terms`: terms and conditions
- `/changelog`: release timeline
- `/u/:handle`: public profile page
- `/me`: personal profile page

## Test and Verification

```bash
npm run test
npm run typecheck
npm run build
```

## Privacy Boundary

Allowed upload fields only:

- `date`, `source`, `model`
- `input_uncached`, `output`, `cached_read`, `cached_write`, `total_io`

Never uploaded:

- prompts/messages
- transcript `message.content` / thinking blocks
- file paths/repo names
- raw session logs

## Deploy to Cloudflare

API Worker:

```bash
npm run deploy:api
```

Initialize Supabase tables once (run in Supabase SQL Editor):

```sql
-- paste and run:
-- supabase/migrations/20260218_init_core_tables.sql
```

Set API secrets:

```bash
npx wrangler secret put SUPABASE_URL --config apps/api/wrangler.toml
npx wrangler secret put SUPABASE_ANON_KEY --config apps/api/wrangler.toml
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config apps/api/wrangler.toml
npx wrangler secret put API_TOKEN_PEPPER --config apps/api/wrangler.toml
npx wrangler secret put MAINTENANCE_TOKEN --config apps/api/wrangler.toml
npm run deploy:api
```

Web Pages:

1. One-time setup local production env file:

```powershell
Copy-Item apps/web/.env.production.example apps/web/.env.production.local
```

Then edit `apps/web/.env.production.local`:

```env
VITE_API_BASE=https://agentic-commons-api.phlegonlabs.workers.dev
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

2. Create Pages project once (if not created yet):

```bash
npx wrangler pages project create agentic-commons-web --production-branch main
```

3. Deploy web:

```bash
npm run deploy:web
```

Deploy both API + web:

```bash
npm run deploy:all
```

## Publish to npm

```bash
npm login
npm whoami
npm run build
npm pack --dry-run
npm publish --access public
```

## CLI Device Linking

- `acommons setup` now attempts device linking in-browser before first cloud sync.
- `acommons setup` now runs a post-setup self-check (`acommons doctor`) automatically.
- `acommons setup` automatically migrates legacy Claude `hooks.Stop` command entries to matcher-based format and repairs malformed Stop entries where `hooks` is missing/invalid.
- `acommons log` (called by Claude Stop hook) now prefers realtime token aggregation from hook `transcript_path` usage and uploads cumulative daily totals without reading/storing message content.
- After a device is linked once, uploads use a locally stored device token (Windows stores it with DPAPI encryption at rest); continuous web login is not required.
- Multiple devices can be linked to the same account; each device can upload independently.
- `acommons sync` uses Claude realtime ledger totals when available and falls back to `stats-cache` aggregates otherwise.
- `acommons sync` uses Codex realtime ledger totals when available and falls back to `.codex/sessions` aggregation otherwise.
- `acommons watch` tails `.codex/sessions`, updates `~/.agentic-commons/codex-ledger.json`, and uploads pending Codex daily totals in near realtime (10s debounce batches).
- `acommons sync` falls back to interactive device linking when no API token is found.
- `acommons link` can be used anytime to force a re-link.
- `acommons sync` checks npm once per day and auto-updates to latest by default.
- `acommons update` can be used for manual upgrade on demand.
- API stores `usage_daily` for recent windows and maintains `usage_all_time` aggregates for all-time leaderboard/profile totals.
- API defaults `/v1/me/usage` to last 30 days when `from/to` are omitted.
- API runs daily cleanup of `usage_daily` rows older than `USAGE_DAILY_RETENTION_DAYS` (default 90) via Worker cron trigger.

For local dev-only header auth fallback, set:

```powershell
$env:ACOMMONS_ALLOW_DEV_HEADER_AUTH="true"
$env:ACOMMONS_USER_ID="demo-user"
```

For local API development (instead of production API base), set:

```powershell
$env:ACOMMONS_LOCAL_API="true"
```

To disable auto-update:

```powershell
$env:ACOMMONS_AUTO_UPDATE="false"
```

