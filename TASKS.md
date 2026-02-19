# Agentic Commons - Tasks

## Step 1: Project Skeleton
- [x] ~~Create package.json, tsconfig.json, src/types.ts~~

## Step 2: Core Sources
- [x] ~~Create src/sources/paths.ts (cross-platform path resolution)~~
- [x] ~~Create src/sources/claude.ts (read stats-cache.json)~~
- [x] ~~Create src/sources/codex.ts (reverse JSONL scan)~~
- [x] ~~Create src/sources/store.ts (read/write usage.json)~~

## Step 3: CLI + Commands
- [x] ~~Create src/format.ts (terminal output helpers)~~
- [x] ~~Create src/cli.ts (entry point + routing)~~
- [x] ~~Create src/commands/stats.ts~~
- [x] ~~Create src/commands/daily.ts~~
- [x] ~~Create src/commands/models.ts~~
- [x] ~~Create src/commands/rate.ts~~

## Step 4: Sync + Storage
- [x] ~~Create src/commands/sync.ts~~
- [x] ~~Create src/commands/log.ts~~

## Step 5: HTML Report
- [x] ~~Create src/commands/report.ts~~

## Step 6: Setup + Automation
- [x] ~~Create src/commands/setup.ts~~

## Step 7: Verification
- [x] ~~Build, link, and test all commands~~

## Security Audit (2026-02-19)
- [ ] **→ Multi-agent security audit of agenticcommons.xyz**
  - [ ] API security testing (auth bypass, injection, rate limiting)
  - [ ] Frontend security testing (XSS, CORS, client-side)
  - [ ] Infrastructure & config security review
  - [ ] Compile final security report

## Security Patch Plan (2026-02-19)
1. [x] ~~Implement high-risk guards (`dev auth`, CORS tightening, timing-safe token compare, rate limiting)~~
2. [x] ~~Implement data consistency fixes (`approveDeviceCode` TOCTOU, atomic usage upsert)~~
3. [x] ~~Implement query and validation hardening (leaderboard limits, input bounds, protocol checks, error-detail redaction)~~
4. [x] ~~Implement operational hardening (expired session cleanup, safer delete/export paths)~~
5. [x] ~~Add/adjust tests and run verification + deploy~~

## Device Bucket Plan (2026-02-19)
1. [x] ~~Add DB primitives for per-device usage + device registry~~
2. [x] ~~Thread device identity through API upload path and store layer~~
3. [x] ~~Update CLI to persist/send device identity for link/upload~~
4. [x] ~~Add regression tests for reconnect/no-duplicate behavior~~
5. [x] ~~Verify + deploy + online smoke test~~
