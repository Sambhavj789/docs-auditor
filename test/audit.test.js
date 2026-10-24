'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { checkProject, checkLinks, loadConfig, parseFrontMatter, formatMarkdown } = require('../audit');

function tempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-auditor-'));
  fs.mkdirSync(path.join(root, 'docs'));
  return root;
}

function write(root, rel, text) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

function cleanProject(root) {
  write(root, 'AGENTS.md', '# Agents\n\nRules for this project. '.repeat(5));
  write(root, 'README.md', '# Project\n\n[Start](docs/00-index.md)\n\n' + 'Useful text. '.repeat(10));
  write(root, 'docs/00-index.md', [
    '---',
    'title: Index',
    'status: active',
    'updated: 2026-10-22',
    '---',
    '# Start',
    '',
    '[State](CURRENT_STATE.md)',
    '[Map](CODEMAP.md)',
    '[Agents](../AGENTS.md)',
    '[Readme](../README.md)',
    '',
    'Orientation text. '.repeat(10)
  ].join('\n'));
  write(root, 'docs/CURRENT_STATE.md', [
    '---',
    'title: Current State',
    'status: active',
    'updated: 2026-10-22',
    '---',
    '# Current State',
    '',
    'Current state detail. '.repeat(10)
  ].join('\n'));
  write(root, 'docs/CODEMAP.md', [
    '---',
    'title: Code Map',
    'status: active',
    'updated: 2026-10-22',
    '---',
    '# Code Map',
    '',
    '`app.js` is the entry point. ' + 'Map detail. '.repeat(10)
  ].join('\n'));
  write(root, 'app.js', "'use strict';\n");
}

function project(root) {
  return {
    name: 'fixture',
    root,
    docs: {
      agents: 'AGENTS.md',
      readme: 'README.md',
      index: 'docs/00-index.md',
      state: 'docs/CURRENT_STATE.md',
      codemap: 'docs/CODEMAP.md'
    },
    required: ['agents', 'readme', 'index', 'state', 'codemap'],
    frontMatter: true,
    warnDays: 7,
    failDays: 30,
    sources: [],
    gate: null
  };
}

const NOW = '2026-10-22T12:00:00Z';

test('clean project is green', () => {
  const root = tempProject();
  cleanProject(root);
  const result = checkProject(project(root), { now: NOW });
  assert.equal(result.status, 'ok');
  assert.equal(result.counts.fail, 0);
  assert.equal(result.counts.warn, 0);
  assert.equal(result.state.ageDays, 0);
  assert.equal(result.metrics.docsPresent, 5);
  assert.equal(result.metrics.brokenLinks, 0);
});

test('missing doc and broken link are red', () => {
  const root = tempProject();
  cleanProject(root);
  fs.unlinkSync(path.join(root, 'docs/CODEMAP.md'));
  write(root, 'README.md', '# Project\n\n[Missing](docs/NOPE.md)\n\n' + 'Text. '.repeat(20));
  const result = checkProject(project(root), { now: NOW });
  assert.equal(result.status, 'fail');
  assert.ok(result.findings.some((f) => f.code === 'missing-doc'));
  assert.ok(result.findings.some((f) => f.code === 'broken-link'));
});

test('stale state warns then fails', () => {
  const root = tempProject();
  cleanProject(root);
  write(root, 'docs/CURRENT_STATE.md', [
    '---',
    'title: Current State',
    'status: active',
    'updated: 2026-10-01',
    '---',
    '# Current State',
    '',
    'Old but not fatal. '.repeat(10)
  ].join('\n'));
  const warn = checkProject(project(root), { now: NOW });
  assert.equal(warn.status, 'warn');
  assert.ok(warn.findings.some((f) => f.code === 'state-age'));

  write(root, 'docs/CURRENT_STATE.md', [
    '---',
    'title: Current State',
    'status: active',
    'updated: 2026-08-01',
    '---',
    '# Current State',
    '',
    'Too old. '.repeat(10)
  ].join('\n'));
  const fail = checkProject(project(root), { now: NOW });
  assert.equal(fail.status, 'fail');
  assert.ok(fail.findings.some((f) => f.code === 'state-stale'));
});

test('state date falls back to a body label', () => {
  const root = tempProject();
  cleanProject(root);
  write(root, 'docs/CURRENT_STATE.md', [
    '# Current State',
    '',
    '> Last verified: **2026-10-21**. Keep this short.',
    '',
    'Body detail. '.repeat(10)
  ].join('\n'));
  const result = checkProject(project(root), { now: NOW });
  assert.equal(result.state.updated, '2026-10-21');
  assert.equal(result.state.ageDays, 1);
  assert.ok(result.findings.some((f) => f.code === 'frontmatter-missing'));
});

test('a labelled updated date beats an older body date', () => {
  const root = tempProject();
  cleanProject(root);
  write(root, 'docs/CURRENT_STATE.md', [
    '# Current State',
    '',
    'History: the kickoff was 2025-01-01, long before this rewrite.',
    '',
    '> Updated 2026-10-20',
    '',
    'Body detail. '.repeat(10)
  ].join('\n'));
  const result = checkProject(project(root), { now: NOW });
  assert.equal(result.state.updated, '2026-10-20');
  assert.equal(result.state.ageDays, 2);
});

test('two unlabelled dates in the first 15 lines resolve to the newest', () => {
  const root = tempProject();
  cleanProject(root);
  write(root, 'docs/CURRENT_STATE.md', [
    '# Current State',
    '',
    'History: the kickoff was 2025-03-04.',
    '',
    'Snapshot taken 2026-10-19.',
    '',
    'Body detail. '.repeat(10)
  ].join('\n'));
  const result = checkProject(project(root), { now: NOW });
  assert.equal(result.state.updated, '2026-10-19');
  assert.equal(result.state.ageDays, 3);
});

test('missing front matter is a warning, not a crash', () => {
  const root = tempProject();
  cleanProject(root);
  write(root, 'docs/CODEMAP.md', '# Code Map\n\nNo front matter here. ' + 'Text. '.repeat(10));
  const result = checkProject(project(root), { now: NOW });
  assert.equal(result.status, 'warn');
  assert.ok(result.findings.some((f) => f.code === 'frontmatter-missing'));
});

test('front matter parser handles quoted values', () => {
  const fm = parseFrontMatter('---\ntitle: "Hello: world"\nstatus: active\nupdated: 2026-10-22\n---\nbody');
  assert.equal(fm.title, 'Hello: world');
  assert.equal(fm.status, 'active');
});

test('config resolves project roots relative to itself', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-auditor-config-'));
  const configPath = path.join(dir, 'projects.json');
  fs.writeFileSync(configPath, JSON.stringify({
    projects: [{ name: 'x', root: '../x', docs: { state: 'docs/CURRENT_STATE.md' } }]
  }));
  const config = loadConfig(configPath);
  assert.equal(config.projects[0].root, path.resolve(dir, '../x'));
  assert.deepEqual(config.projects[0].required, ['state']);
});

test('a stray % or an angle-bracket path does not crash the link check', () => {
  const root = tempProject();
  write(root, 'my file.md', 'hi');
  write(root, 'a.md', '[odd](100%.md) [spaced](<my file.md>) [gone](<no such.md>)');
  const links = checkLinks(root, ['a.md']);
  assert.equal(links.checked, 3);
  assert.deepEqual(links.broken, ['a.md -> 100%.md', 'a.md -> <no such.md>']);
});

test('formatMarkdown renders a table header and FAIL findings as bullets', () => {
  const report = {
    generatedAt: '2026-10-22T12:00:00.000Z',
    config: '/tmp/projects.json',
    summary: { projects: 2, ok: 1, warn: 0, fail: 1 },
    projects: [
      {
        name: 'clean-app',
        status: 'ok',
        state: { file: 'docs/CURRENT_STATE.md', updated: '2026-10-22', ageDays: 0 },
        counts: { fail: 0, warn: 0, info: 0 },
        metrics: { docs: 4, docsPresent: 4, linksChecked: 3, brokenLinks: 0, sources: 0, unmapped: 0 },
        findings: [],
        gate: { script: 'verify-docs.js', status: 'pass' }
      },
      {
        name: 'pipe|app',
        status: 'fail',
        state: null,
        counts: { fail: 1, warn: 0, info: 0 },
        metrics: { docs: 2, docsPresent: 1, linksChecked: 7, brokenLinks: 1, sources: 0, unmapped: 0 },
        findings: [{ level: 'fail', code: 'missing-doc', message: 'missing required: README.md' }],
        gate: null
      }
    ]
  };

  const lines = formatMarkdown(report).split('\n');
  assert.equal(lines[0], 'generated: 2026-10-22T12:00:00.000Z');
  assert.ok(lines.includes('| project | status | state | docs | links | gate |'));
  assert.ok(lines.includes('| --- | --- | --- | --- | --- | --- |'));
  assert.ok(lines.includes('| pipe\\|app | FAIL | no state | 1/2 | 7 | none |'));
  assert.ok(
    lines.some((line) => line.startsWith('- ') && line.includes('FAIL') && line.includes('[missing-doc]')),
    'FAIL finding appears as a bullet'
  );
  assert.equal(lines.filter((line) => line.startsWith('- ')).length, 1);
});
