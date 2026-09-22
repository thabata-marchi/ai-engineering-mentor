# Contributing

Thanks for your interest! This is a **study project** (AI Engineering postgrad —
UNIPDS), built step by step with a didactic focus. Contributions and questions are welcome.

## Project principles
- **Hexagonal architecture:** `core` (pure logic, no I/O) → `application` (use cases)
  → `adapters` (concrete technology). Depend on **ports** (interfaces), never on
  implementations.
- **Tests from day one:** every new behavior comes with a test (`node:test`), using
  doubles (fakes) — no network/cost in the tests.
- **Native TypeScript, no build:** we run with `--experimental-strip-types`. So **do
  not** use "parameter properties" (`constructor(private x)`) — declare the fields
  explicitly.
- **Didactic English comments:** the code is a learning log.
- **Small, descriptive commits.**

## Running locally
```bash
npm install
npm test          # runs the whole suite
npm run typecheck # checks the types (tsc --noEmit)
npm run demo      # flow with doubles, no config needed
```
Requires **Node >= 22.6** (ideally Node 24).

## Before opening a PR
1. `npm run typecheck` with no errors.
2. `npm test` green.
3. Clear comments and names; keep the hexagonal pattern.
4. Describe the "why" in the PR, not just the "what".

## Knowledge base and secrets
- **Never** commit books/PDFs (copyright) — the `data/` folder is ignored.
- **Never** commit secrets. Use `.env` (ignored); see `.env.example`.
- Report security issues per `SECURITY.md`.
