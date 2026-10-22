---
title: docs-auditor Development
status: active
updated: 2026-10-22
---

# Development

## Setup

No install and no build. Node 18+ only:

```powershell
node docs-auditor.js --help
node docs-auditor.js
node docs-auditor.js --json > out.json
```

## Tests

```powershell
node --test test/audit.test.js
```

The suite uses temporary directories and fixed dates; it does not touch real projects. It covers a
clean project, a missing doc plus broken link, stale state warnings/failures, missing front matter,
quoted front-matter values, and config path resolution.

## Own docs gate

```powershell
node verify-docs.js
```

`verify-docs.js` is the standard zero-dependency docs gate copied from the HQ kit. It checks the 11
required docs, front matter, index links, relative links, every source file in `CODEMAP.md`, and then
runs the test suite. `doc-check.json` points it at `sources: ["."]`.

## Adding a project

Add an object to `projects.json`:

```json
{
  "name": "example",
  "root": "../../path/to/project",
  "docs": {
    "agents": "AGENTS.md",
    "readme": "README.md",
    "index": "docs/00-index.md",
    "state": "docs/CURRENT_STATE.md",
    "codemap": "docs/CODEMAP.md"
  },
  "required": ["agents", "readme", "index", "state", "codemap"]
}
```

Map the project's real filenames. Do not rename a project's docs to make this tool green. Add
`sources` only when the project has a real CODEMAP; add `gate` only when a verify script exists.
Run `node docs-auditor.js --project example` and inspect each finding before committing.

## Release

1. Update `docs/CURRENT_STATE.md` and `docs/CHANGELOG.md`.
2. Run `node --test test/audit.test.js`, `node verify-docs.js`, and `node docs-auditor.js`.
3. Bump `package.json` only when the CLI or report schema changes.
