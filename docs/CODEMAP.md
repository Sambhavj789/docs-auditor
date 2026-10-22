---
title: docs-auditor Code Map
status: active
updated: 2026-10-22
---

# Code Map

| File | Role |
|---|---|
| `docs-auditor.js` | CLI: argument parsing, help/version, JSON/text output, exit code |
| `audit.js` | Config loader, front-matter parser, checks, report builder, text formatter |
| `projects.json` | Local project roots and their doc mappings (gitignored) |
| `projects.example.json` | Committed example config; copy to `projects.json` |
| `test/audit.test.js` | `node:test` fixtures for green, missing, stale, and config cases |
| `verify-docs.js` | This tool's docs gate; checks kit files, links, CODEMAP, then tests |
| `doc-check.json` | Required docs and source roots for `verify-docs.js` |
| `package.json` | Scripts and Node engine; no dependencies |
| `README.md` | Quick start and current output |
| `AGENTS.md` | Rules for agents changing the tool |

## Check functions

- `loadConfig` — resolves roots, defaults, and required keys.
- `parseFrontMatter` — small `---` block parser; no YAML dependency.
- `findUpdatedDate` — front matter first, then "Last verified/Updated" body labels.
- `walkSources` — directory walk with extension skip list and `.git`/`node_modules` ignores.
- `checkLinks` — relative Markdown links after removing fenced and inline code.
- `checkProject` — all per-project checks and findings.
- `auditAll` — batch and summary.
- `formatText` — terminal table and finding lines.

Every runtime file is listed above; `docs/` pages are documentation, not executable code.
