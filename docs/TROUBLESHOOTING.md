---
title: docs-auditor Troubleshooting
status: active
updated: 2026-10-22
---

# Troubleshooting

## `docs-auditor: Cannot read config ...`

No `projects.json` yet? Copy `projects.example.json` to `projects.json` and edit the roots.

Run from anywhere with an explicit path:

```powershell
node path\to\docs-auditor\docs-auditor.js --config path\to\docs-auditor\projects.json
```

Project `root` values resolve relative to the config file, not the current directory. A wrong root
shows `root-missing` for that project.

## Exit code 1 but the table looks fine

Open the finding lines; at least one project has a `FAIL`. Use `--json` and filter `status == "fail"`.
`--strict` also returns 1 for warnings, so drop it when you only want reds.

## False `unindexed`

The check is a basename substring test against the index text. A doc linked through a different name
or an embed is not counted. Either add a normal Markdown link in the index or map the doc under the
name the project actually uses. The fix is an index link, not a duplicate page.

## False `broken-link`

Links inside fenced code and inline code are ignored. A placeholder like `relative/path` is only a
problem when written as a real Markdown link. Check the link relative to the file that contains it,
not the repo root; `../` matters.

## `state-undated`

The state file has no `updated` front-matter key and no `Last verified: YYYY-MM-DD` (or `Updated:`)
line. Add one date in the file; do not change the tool to guess from arbitrary prose.

## `--run-gates` is slow or fails

It runs `node <gate>` in the project root with a 20-second timeout. A gate that needs a database or
network is unsuitable for this flag. Use presence-only mode by omitting the flag, and run the gate
manually when its environment is ready.
