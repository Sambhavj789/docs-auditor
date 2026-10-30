'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { checkProject, checkLinks, loadConfig, parseFrontMatter, formatMarkdown, formatText, auditAll } = require('../audit');

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

function datedProject(root, updated) {
  write(root, 'docs/CURRENT_STATE.md', [
    '---',
    'title: Current State',
    'status: active',
    'updated: ' + updated,
    '---',
    '# Current State',
    '',
    'Current state detail. '.repeat(10)
  ].join('\n'));
  const fixture = project(root);
  // Default thresholds are lenient enough that a 12-day-old state is still green;
  // the CLI overrides only have to tighten them.
  fixture.warnDays = 20;
  fixture.failDays = 30;
  return fixture;
}

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

test('a 12-day-old state is ok under the project default thresholds', () => {
  const root = tempProject();
  cleanProject(root);
  const result = checkProject(datedProject(root, '2026-10-10'), { now: NOW });
  assert.equal(result.state.ageDays, 12);
  assert.equal(result.status, 'ok');
  assert.equal(result.counts.warn, 0);
  assert.equal(result.counts.fail, 0);
});

test('warnDays override turns a 12-day-old state into a state-age warning', () => {
  const root = tempProject();
  cleanProject(root);
  const result = checkProject(datedProject(root, '2026-10-10'), { now: NOW, warnDays: 5 });
  assert.equal(result.status, 'warn');
  assert.equal(result.counts.warn, 1);
  assert.ok(result.findings.some((f) => f.code === 'state-age'));
});

test('failDays override turns a 12-day-old state into a state-stale failure', () => {
  const root = tempProject();
  cleanProject(root);
  const result = checkProject(datedProject(root, '2026-10-10'), { now: NOW, failDays: 5 });
  assert.equal(result.status, 'fail');
  assert.equal(result.counts.fail, 1);
  assert.ok(result.findings.some((f) => f.code === 'state-stale'));
});

test('a project whose warn/fail values cross is flagged as threshold-order', () => {
  const root = tempProject();
  cleanProject(root);
  const fixture = datedProject(root, '2026-10-10');
  fixture.failDays = 20;
  const result = checkProject(fixture, { now: NOW, warnDays: 30 });
  assert.equal(result.status, 'warn');
  assert.equal(result.counts.warn, 1);
  const finding = result.findings.find((f) => f.code === 'threshold-order');
  assert.ok(finding);
  assert.equal(finding.level, 'warn');
  assert.ok(finding.message.startsWith('warn-days must be less than fail-days'));
});

test('a valid warn/fail pair keeps the report unchanged', () => {
  const root = tempProject();
  cleanProject(root);
  const result = checkProject(datedProject(root, '2026-10-10'), { now: NOW, warnDays: 5, failDays: 20 });
  assert.equal(result.status, 'warn');
  assert.equal(result.counts.warn, 1);
  assert.equal(result.counts.fail, 0);
  assert.ok(!result.findings.some((f) => f.code === 'threshold-order'));
  assert.ok(result.findings.some((f) => f.code === 'state-age' && f.message.includes('warn after 5')));
});

test('the CLI exits 2 when warn-days is not below fail-days', () => {
  const script = path.join(__dirname, '..', 'docs-auditor.js');
  const run = spawnSync(process.execPath, [script, '--warn-days', '10', '--fail-days', '5'], {
    encoding: 'utf8'
  });
  assert.equal(run.status, 2);
  assert.ok(run.stderr.includes('warn-days must be less than fail-days'));

  const equal = spawnSync(process.execPath, [script, '--warn-days', '10', '--fail-days', '10'], {
    encoding: 'utf8'
  });
  assert.equal(equal.status, 2);
  assert.ok(equal.stderr.includes('warn-days must be less than fail-days'));
});

function quietProject(name, status, findings) {
  return {
    name,
    status,
    state: { file: 'docs/CURRENT_STATE.md', updated: '2026-10-22', ageDays: 0 },
    counts: {
      fail: status === 'fail' ? 1 : 0,
      warn: status === 'warn' ? 1 : 0,
      info: 0
    },
    metrics: { docs: 4, docsPresent: 4, linksChecked: 2, brokenLinks: 0, sources: 0, unmapped: 0 },
    findings: findings || [],
    gate: null
  };
}

function quietReport() {
  return {
    generatedAt: '2026-10-22T12:00:00.000Z',
    config: '/tmp/projects.json',
    summary: { projects: 3, ok: 2, warn: 1, fail: 0 },
    projects: [
      quietProject('clean-app', 'ok'),
      quietProject('games', 'ok'),
      quietProject('legacy-app', 'warn', [
        {
          level: 'warn',
          code: 'state-age',
          message: 'docs/CURRENT_STATE.md updated 2026-10-01 (21 days old, warn after 7)'
        }
      ])
    ]
  };
}

test('default text output still lists every project', () => {
  const text = formatText(quietReport());
  assert.ok(text.includes('docs-auditor — 3 project(s)'));
  assert.ok(text.includes('clean-app'));
  assert.ok(text.includes('games'));
  assert.ok(text.includes('legacy-app'));
  assert.equal(text.split('\n').pop(), '3 projects — 2 ok, 1 warn, 0 fail');
});

test('quiet text output keeps only warn and fail projects plus the summary', () => {
  const text = formatText(quietReport(), { quiet: true });
  const lines = text.split('\n');
  assert.ok(lines.some((line) => line.startsWith('legacy-app')));
  assert.ok(lines.some((line) => line.includes('[state-age]')));
  assert.ok(!text.includes('clean-app'));
  assert.ok(!text.includes('games'));
  assert.ok(!text.includes('docs-auditor —'));
  assert.equal(lines[lines.length - 1], '3 projects — 2 ok, 1 warn, 0 fail');
  assert.equal(lines.filter((line) => /^\S+\s+(WARN|FAIL)/.test(line)).length, 1);
});

test('quiet text output collapses an all-green report to one line', () => {
  const report = {
    generatedAt: '2026-10-22T12:00:00.000Z',
    config: '/tmp/projects.json',
    summary: { projects: 3, ok: 3, warn: 0, fail: 0 },
    projects: [
      quietProject('one', 'ok'),
      quietProject('two', 'ok'),
      quietProject('three', 'ok')
    ]
  };
  assert.equal(formatText(report, { quiet: true }), 'all 3 projects ok');
});

test('quiet Markdown keeps only non-OK rows and ends with the summary', () => {
  const md = formatMarkdown(quietReport(), { quiet: true });
  const lines = md.split('\n');
  assert.ok(!md.includes('clean-app'));
  assert.ok(!md.includes('games'));
  assert.ok(lines.some((line) => line.startsWith('| legacy-app | WARN')));
  assert.ok(lines.some((line) => line.startsWith('- **legacy-app** WARN')));
  assert.equal(lines[lines.length - 1], '3 projects — 2 ok, 1 warn, 0 fail');
  assert.equal(lines.filter((line) => /^\| (?!project |---)/.test(line)).length, 1);
});

test('quiet Markdown collapses an all-green report to one line', () => {
  const report = {
    generatedAt: '2026-10-22T12:00:00.000Z',
    config: '/tmp/projects.json',
    summary: { projects: 3, ok: 3, warn: 0, fail: 0 },
    projects: [
      quietProject('one', 'ok'),
      quietProject('two', 'ok'),
      quietProject('three', 'ok')
    ]
  };
  assert.equal(formatMarkdown(report, { quiet: true }), 'all 3 projects ok');
});

test('the CLI --quiet hides OK projects while --json ignores it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-auditor-quiet-'));
  const goodRoot = tempProject();
  const badRoot = tempProject();
  cleanProject(goodRoot);
  cleanProject(badRoot);
  fs.unlinkSync(path.join(badRoot, 'docs/CODEMAP.md'));

  const configPath = path.join(dir, 'projects.json');
  fs.writeFileSync(configPath, JSON.stringify({
    projects: [
      {
        name: 'good-app',
        root: goodRoot,
        docs: {
          agents: 'AGENTS.md',
          readme: 'README.md',
          index: 'docs/00-index.md',
          state: 'docs/CURRENT_STATE.md',
          codemap: 'docs/CODEMAP.md'
        }
      },
      {
        name: 'bad-app',
        root: badRoot,
        docs: {
          agents: 'AGENTS.md',
          readme: 'README.md',
          index: 'docs/00-index.md',
          state: 'docs/CURRENT_STATE.md',
          codemap: 'docs/CODEMAP.md'
        }
      }
    ]
  }));

  const script = path.join(__dirname, '..', 'docs-auditor.js');
  const quiet = spawnSync(
    process.execPath,
    [script, '--config', configPath, '--quiet', '--warn-days', '15', '--fail-days', '30'],
    { encoding: 'utf8' }
  );
  assert.equal(quiet.status, 1, 'quiet keeps the failing exit code');
  assert.ok(quiet.stdout.includes('bad-app'));
  assert.ok(!quiet.stdout.includes('good-app'));
  assert.equal(quiet.stdout.trim().split('\n').pop(), '2 projects — 1 ok, 0 warn, 1 fail');

  const json = spawnSync(
    process.execPath,
    [script, '--config', configPath, '--json', '--quiet', '--warn-days', '15', '--fail-days', '30'],
    { encoding: 'utf8' }
  );
  assert.equal(json.status, 1);
  const parsed = JSON.parse(json.stdout);
  assert.deepEqual(parsed.projects.map((p) => p.name), ['good-app', 'bad-app']);
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

const DOCS = {
  agents: 'AGENTS.md',
  readme: 'README.md',
  index: 'docs/00-index.md',
  state: 'docs/CURRENT_STATE.md',
  codemap: 'docs/CODEMAP.md'
};

function onlyFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-auditor-only-'));
  const roots = {};
  const projects = ['alpha-app', 'beta-app', 'gamma-app'].map((name) => {
    const root = tempProject();
    cleanProject(root);
    roots[name] = root;
    return { name, root, docs: { ...DOCS } };
  });
  const configPath = path.join(dir, 'projects.json');
  fs.writeFileSync(configPath, JSON.stringify({ projects }));
  return { configPath, roots };
}

test('--only audits just the comma-separated aliases in --json output', () => {
  const { configPath } = onlyFixture();
  const script = path.join(__dirname, '..', 'docs-auditor.js');
  const run = spawnSync(
    process.execPath,
    [script, '--config', configPath, '--json', '--only', 'alpha-app, gamma-app',
      '--warn-days', '15', '--fail-days', '30'],
    { encoding: 'utf8' }
  );
  assert.equal(run.status, 0);
  const parsed = JSON.parse(run.stdout);
  assert.deepEqual(parsed.projects.map((p) => p.name), ['alpha-app', 'gamma-app']);
  assert.deepEqual(parsed.summary, { projects: 2, ok: 2, warn: 0, fail: 0 });
});

test('--only with an unknown alias exits 2 and names it', () => {
  const { configPath } = onlyFixture();
  const script = path.join(__dirname, '..', 'docs-auditor.js');
  const run = spawnSync(
    process.execPath,
    [script, '--config', configPath, '--only', 'alpha-app,nope-app'],
    { encoding: 'utf8' }
  );
  assert.equal(run.status, 2);
  assert.ok(run.stderr.includes('unknown project: nope-app'));
});

test('--only without a list exits 2', () => {
  const { configPath } = onlyFixture();
  const script = path.join(__dirname, '..', 'docs-auditor.js');
  const run = spawnSync(
    process.execPath,
    [script, '--config', configPath, '--only', ' , '],
    { encoding: 'utf8' }
  );
  assert.equal(run.status, 2);
  assert.ok(run.stderr.includes('--only needs a comma list of project names'));
});

test('--only works with --md and --quiet, leaving other projects out', () => {
  const { configPath, roots } = onlyFixture();
  fs.unlinkSync(path.join(roots['beta-app'], 'docs/CODEMAP.md'));
  const script = path.join(__dirname, '..', 'docs-auditor.js');
  const base = [script, '--config', configPath, '--only', 'alpha-app,beta-app',
    '--warn-days', '15', '--fail-days', '30'];

  const md = spawnSync(process.execPath, base.concat('--md'), { encoding: 'utf8' });
  assert.equal(md.status, 1);
  assert.ok(md.stdout.includes('| alpha-app | OK'));
  assert.ok(md.stdout.includes('| beta-app | FAIL'));
  assert.ok(!md.stdout.includes('gamma-app'));

  const quiet = spawnSync(process.execPath, base.concat('--quiet'), { encoding: 'utf8' });
  assert.equal(quiet.status, 1);
  assert.ok(quiet.stdout.includes('beta-app'));
  assert.ok(!quiet.stdout.includes('alpha-app'));
  assert.ok(!quiet.stdout.includes('gamma-app'));
  assert.equal(quiet.stdout.trim().split('\n').pop(), '2 projects — 1 ok, 0 warn, 1 fail');
});

test('auditAll rejects unknown --only aliases before auditing', () => {
  const { configPath } = onlyFixture();
  const config = loadConfig(configPath);
  assert.throws(() => auditAll(config, { only: ['alpha-app', 'ghost'], now: NOW }),
    /unknown project: ghost/);
  const report = auditAll(config, { only: ['beta-app'], now: NOW });
  assert.deepEqual(report.projects.map((p) => p.name), ['beta-app']);
});

