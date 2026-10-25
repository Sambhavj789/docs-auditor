---
title: docs-auditor Current State
status: active
updated: 2026-10-22
---

# Current State

## Works

- Audits every project in one local `projects.json` (example: `projects.example.json`).
- Checks required docs, front matter, state age, index coverage, relative links, CODEMAP gaps, and
  gate presence.
- Text table and `--json`; `--project`, `--strict`, `--run-gates`, `--verbose`.
- Gate scripts: `npm run audit:strict` (warnings fail) and `npm run audit:gate` (strict +
  each project's verify gate). All six projects are OK under `--strict` (2026-10-22).
- 8/8 tests pass; own docs gate passes.

## Does not exist

- No auto-fix and no write mode.
- No historical trend (last-run result is not persisted).
- No Markdown AST; links inside unusual syntax may be missed.
- No CI job yet; run the command locally.
- CODEMAP coverage is opt-in per project (`sources`).

## Next

Done 2026-10-24 (don't re-queue): `--md` Markdown report (N-20261022-2), front-matter-first state date
(T-02), `--warn-days` / `--fail-days` flags (T-06).

1. **T-07:** `--warn-days` must be `>=` `--fail-days` — a smaller warn threshold can never fire, so reject it
   with exit 2 and a clear message (worker-ready).
2. Consider a `--write` mode only after the read-only report has been stable for a while (not started, on purpose).
