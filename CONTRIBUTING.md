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
npm run test -w @agentic-commons/api
npm run build -w @agentic-commons/web
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

## Code of Conduct

By participating, you agree to follow `CODE_OF_CONDUCT.md`.
