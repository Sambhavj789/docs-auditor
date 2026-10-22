---
title: docs-auditor Spec
status: active
updated: 2026-10-22
---

# Spec

## CLI

```text
node docs-auditor.js [--config <path>] [--project <name>] [--json] [--strict]
                     [--run-gates] [--verbose] [--help] [--version]
```

- `--config` defaults to `projects.json` beside the script.
- `--project` filters by exact `name`; unknown names are a config error (exit 2).
- `--json` emits one JSON object, no banner text.
- `--strict` exits 1 when only warnings remain.
- `--run-gates` runs each `gate.script` with `node` in the project root, 20 s timeout.
- `--verbose` includes info findings (currently gate/config presence notes).

## Findings

| Code | Level | Meaning |
|---|---|---|
| `root-missing` | fail | project root does not exist or is not a directory |
| `missing-doc` | fail | a `required` logical doc is absent |
| `thin-doc` | warn | required doc is under 80 bytes |
| `frontmatter-missing` | warn | a `docs/` file has no `---` block |
| `frontmatter-invalid` | warn | title/status/updated missing or invalid |
| `state-age` | warn | state older than `warnDays` (default 7) |
| `state-stale` | fail | state older than `failDays` (default 30) |
| `state-undated` | warn | state file has no parseable date |
| `unindexed` | warn | required doc basename absent from the index |
| `broken-link` | fail | relative Markdown target does not exist |
| `codemap-gap` | warn | source file not mentioned in the CODEMAP |
| `gate-missing` | warn | configured verify script absent |
| `gate-config-missing` | warn | gate exists but its config is absent |
| `gate-failed` | fail | `--run-gates` child exited non-zero |

## Acceptance

- Six projects audit in under 5 seconds on this laptop without `--run-gates`.
- Zero network calls and zero writes to project trees.
- A missing file yields a finding, not a stack trace.
- `--json` is valid JSON and includes `generatedAt`, `summary`, and per-project `findings`.
- Exit code is deterministic: any fail → 1; config/CLI error → 2; otherwise 0.
