# docs-auditor

Read-only health check for the docs of several projects at once: required files, front matter,
stale state, relative links, CODEMAP coverage, and verify gates. Zero dependencies, no network.
Built for a workspace where AI agents read project docs before they touch code, so stale or
missing docs are caught before an agent trusts them.

```powershell
copy projects.example.json projects.json   # then point the roots at your projects
```

```powershell
node docs-auditor.js
node docs-auditor.js --json
node docs-auditor.js --project web-app
node docs-auditor.js --strict --run-gates
```

Gate scripts (same commands, for CI or a cron):

```powershell
npm run audit:strict   # exit 1 on warnings too
npm run audit:gate     # strict + run each project's verify gate
```

Exit codes: `0` green or warnings, `1` red, `2` config error. `--strict` turns warnings into exit 1;
`--run-gates` actually runs each configured verify script (slower, not the default).

## What it checks

- Required docs exist (mapped per project in `projects.json`, existing names kept).
- Docs are non-trivial and, under `docs/`, have `title`, `status`, `updated` front matter.
- State file age: warn after 7 days, red after 30 (overridable per project).
- Every required doc is linked from the project's index.
- Relative Markdown links resolve (fenced/inline code is ignored).
- Files under configured source roots appear in the project's CODEMAP.
- The verify gate and its config exist; with `--run-gates`, it must exit 0.

## Example output

```
web-app   OK    state 2026-10-22 (0d)     docs 11/11  links 7  gate present
game      WARN  state 2026-10-18 (4d)     docs 5/5  links 0  no gate  1 warn
  WARN  [frontmatter-missing] no front matter: docs/STATUS.md
mobile    FAIL  state 2026-10-21 (1d)     docs 4/6  links 54  no gate  1 fail
  FAIL  [missing-doc] missing required: README.md, docs/00-index.md
```

Warnings are mostly missing front matter on legacy docs. Do not "fix" a finding by renaming an
existing file; add the missing entry point or map the existing one.

## Config

`projects.json` is the only project list. It is local (gitignored); start from
`projects.example.json`. `root` is relative to the config file. `docs` maps logical
names to actual paths, so a project can keep `STATUS.md` or `SYSTEM_MAP.md` instead of adopting new
filenames. `required` lists the logical names that must exist; `frontMatter` can be disabled for a
legacy project, but that is a temporary exception, not the standard.

## Develop

```powershell
node --test test/audit.test.js
node verify-docs.js
```

See [docs/00-index.md](docs/00-index.md) for the full docs map and
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the adding-a-project recipe.

## License

MIT, see [LICENSE](LICENSE).
