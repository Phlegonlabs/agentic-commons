# Contributing

Thanks for contributing to Agentic Commons.

## Ground Rules

- Keep changes focused and minimal.
- Avoid unrelated refactors in the same PR.
- Never commit secrets, private keys, or real `.env` values.
- For security vulnerabilities, do not use public issues. Use `SECURITY.md`.

## Development Setup

Requirements:

- Node.js >= 20
- npm >= 10

Install:

```bash
npm install
```

## Verify Before PR

Run the smallest relevant checks first, then broader checks if needed.

```bash
npm run build:cli
npm run typecheck -w @agentic-commons/shared
```

## Pull Request Checklist

- Clear title and summary
- Linked issue (if applicable)
- Scope is limited to the intended change
- Tests/checks are run and results included
- No secrets or sensitive environment details

## Commit Guidance

Use clear commit messages, for example:

- `feat: add x`
- `fix: correct y`
- `chore: update z`

## Commit and Push Workflow

This repository uses branch protection on `main`.

Use this flow:

```bash
git checkout -b feat/short-name
npm run build
npm run typecheck
git add <files>
git commit -m "type: concise summary"
git push -u origin feat/short-name
```

Then open a PR to `main` and wait for `build-and-test` to pass.

Repository boundary:

- Public repo (`agentic-commons`): only CLI/shared/public docs changes.
- Private repo (`agentic-commons-platform`): API/web/infrastructure changes.
- Do not mix public and private changes in one commit.

## Code of Conduct

By participating, you agree to follow `CODE_OF_CONDUCT.md`.
