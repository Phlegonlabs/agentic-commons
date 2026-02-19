# 2026-02-18 MVP Execution Plan

## Frozen Scope
Implement current MVP only (no multi-provider expansion).

## Tasks
1. Add shared schema package with strict allowlist validation.
2. Implement API endpoints for usage ingest, leaderboard, profile, privacy, export, delete.
3. Build frontend with homepage, leaderboard, and profile pages.
4. Wire CLI `acommons sync` optional cloud upload.
5. Add tests for validation, leaderboard windows, and privacy behavior.
6. Run build + test verification.

## Verification Commands
- `npm install`
- `npm run test -w @agentic-commons/api`
- `npm run build -w @agentic-commons/shared`
- `npm run build -w @agentic-commons/api`
- `npm run build -w @agentic-commons/web`
- `npm run build`

## Acceptance
- Homepage includes installation instructions.
- Leaderboard page provides `24h`, `7d`, and `all` tabs.
- Personal page supports profile edits and privacy toggle.
- Public profile URL renders user profile + totals.
- API enforces privacy-safe payload contract.
