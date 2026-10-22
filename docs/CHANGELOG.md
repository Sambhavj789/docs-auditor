---
title: docs-auditor Changelog
status: active
updated: 2026-10-22
---

# Changelog

## Unreleased — 2026-10-22

- Added `npm run audit:strict` and `npm run audit:gate` as the company-wide docs gate.
- Backfilled missing front matter in three legacy projects; all six now pass `--strict`.

## 0.1.1 — 2026-10-22

- Fix: a link with a stray `%` (e.g. `100%.md`) crashed the whole audit with exit 2; it is now
  checked as a literal path.
- Links in angle brackets with spaces (`[x](<my file.md>)`) are now checked.
- `--run-gates` reports `timed out` instead of an empty reason when a gate hits the timeout.
- `projects.json` is now local (gitignored); `projects.example.json` is the committed template, and a
  missing default config prints that hint.
- MIT licence.
- Eight tests.

## 0.1.0 — 2026-10-22

- First read-only release.
- Config-driven audit of several projects from one `projects.json`.
- Checks required docs, front matter, state age (7/30 days), index coverage, relative links,
  CODEMAP gaps, and verify-gate presence.
- Text and JSON output; `--project`, `--strict`, `--run-gates`, `--verbose`.
- Seven fixture tests; own docs gate (`verify-docs.js`) added.
