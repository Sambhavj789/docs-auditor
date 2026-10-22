---
title: docs-auditor Index
status: active
updated: 2026-10-22
---

# docs-auditor — start here

Read-only CLI that audits the docs trees of the projects listed in `projects.json`. It reports missing required
files, missing or invalid front matter, stale `CURRENT_STATE`/`STATUS` files, broken relative links,
CODEMAP source gaps, and verify-gate presence. It does not edit another project, call the network, or
install anything.

## Read in this order

1. [README.md](../README.md) — install-free quick start and current output
2. [AGENTS.md](../AGENTS.md) — rules for changing the tool
3. [ARCHITECTURE.md](ARCHITECTURE.md) — modules, data flow, exit codes
4. [SPEC.md](SPEC.md) — exact checks and output contract
5. [DEVELOPMENT.md](DEVELOPMENT.md) — tests, verify gate, adding a project
6. [CURRENT_STATE.md](CURRENT_STATE.md) — what works and what is next
7. [CODEMAP.md](CODEMAP.md) — every source file
8. [DECISIONS.md](DECISIONS.md) — why read-only, config-driven, zero-dep
9. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — false positives and config errors
10. [CHANGELOG.md](CHANGELOG.md) — version history

## Verify

```powershell
node docs-auditor.js
node --test test/audit.test.js
node verify-docs.js
```

Default config is `projects.json` next to `docs-auditor.js`. Exit `0` green/warnings, `1` red,
`2` config error. `--strict` makes warnings fail; `--run-gates` runs each project's verify script.
