# docs-auditor: Agent Guide

Read this before changing the tool. Read [docs/00-index.md](docs/00-index.md) first; it is the map.
The tool is a **read-only** health check for the docs trees of the projects listed in `projects.json`. It never edits
another project, never runs network calls, and never installs a dependency.

## Rules

- Zero runtime dependencies. Node built-ins only (`fs`, `path`, `child_process` for optional gates).
- Default run must stay under 5 seconds for ten projects.
- A failed check must be actionable: name the project, file, and fix.
- Do not auto-fix in v1. Report only.
- Exit codes are part of the contract: `0` green/warnings, `1` red, `2` config error.
- `--strict` makes warnings fail; do not change default behaviour for existing users.
- Paths in `projects.json` resolve relative to the config file, not the shell cwd.
- Root `README.md`/`AGENTS.md` need no front matter; docs under `docs/` do.
- Run `node verify-docs.js` and `node --test test/audit.test.js` before commit.

## Adding a project

1. Add one object to `projects.json` with `name`, `root`, `docs`, `required`.
2. Map existing filenames; do not rename a project's docs to satisfy this tool.
3. Add `sources` only where the project has a real CODEMAP.
4. Add `gate` only when a verify script exists.
5. Run `node docs-auditor.js --project <name>` and check the finding is real.

## Where things live

- `audit.js` — pure checks and report builder.
- `docs-auditor.js` — CLI, options, exit codes.
- `projects.json` — your project roots and doc mappings (local, gitignored).
- `projects.example.json` — committed starting point for `projects.json`.
- `test/audit.test.js` — node:test fixtures.
- `verify-docs.js` — this tool's own docs gate.
