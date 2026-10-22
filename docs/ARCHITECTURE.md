---
title: docs-auditor Architecture
status: active
updated: 2026-10-22
---

# Architecture

The tool has three layers. `audit.js` holds pure checks and a report builder; `docs-auditor.js` is a
thin CLI over it; `projects.json` is the only project-specific input. `verify-docs.js` and
`test/audit.test.js` are development gates, not part of the runtime path.

## Data flow

1. `loadConfig(path)` reads JSON, resolves every `root` relative to the config file, and normalises
   defaults (`frontMatter`, stale thresholds, `sources`, `required`).
2. `checkProject(project, options)` checks one project and returns findings plus metrics. It never
   throws for a missing file; missing paths become findings.
3. `auditAll(config, options)` maps projects, optionally filters `--project`, and builds a summary.
4. `formatText` prints the table; `--json` prints the same report object.

## Check order

Required docs → size/front matter → state age → index coverage → links → CODEMAP → gate. Each check
adds a finding with a stable `code` (`missing-doc`, `state-stale`, `broken-link`, `codemap-gap`,
`gate-failed`, and so on). A project is `fail` if it has any fail finding, else `warn` if it has any
warning, else `ok`.

## Contracts

- Node 18+, CommonJS, no dependency beyond built-ins.
- Paths are Windows-friendly but use `path`/`path.resolve`; no string concatenation for roots.
- The default run is read-only; `--run-gates` is the only child process.
- Exit codes: `0` no red, `1` red or `--strict` warnings, `2` config/CLI error.

## Non-goals

No auto-fix, no Git operations, no network, no AST parsing, no Markdown renderer. Link checking is
deliberately a regex over non-code Markdown; it catches broken paths without pulling a parser.
