---
title: docs-auditor Decisions
status: active
updated: 2026-10-22
---

# Decisions

## D-001 — Read-only v1

The tool reports; it never edits another project. Auto-fixing docs across six repos is too risky and
would hide the real gap (a missing entry point, not a formatting issue). Revisit only after the
read-only output has been stable and the false-positive rate is known.

## D-002 — Zero dependencies

Only Node built-ins. A docs checker should run from any checkout without `npm install`, and a
dependency tree would add supply-chain and offline risk for a tool that mostly reads files.

## D-003 — Config maps real filenames

Existing projects keep `STATUS.md`, `SYSTEM_MAP.md`, `status.md`, and so on. `projects.json` maps
logical names to real paths, so the auditor measures the docs standard without forcing a rename.
`00-index` is still the canonical entry point; projects without one are red.

## D-004 — Warnings versus reds

Missing required files, broken links, stale state over 30 days, and failed gates are red. Legacy front
matter and CODEMAP gaps are warnings, because they are migration debt, not broken navigation.
`--strict` is available for a fully migrated project or CI.

## D-005 — Body date fallback

Many existing state files put `Last verified: 2026-10-21` in the body instead of front matter. The
auditor reads front matter first, then a labelled body date, so staleness is measured now while front
matter is still reported as a separate warning.
