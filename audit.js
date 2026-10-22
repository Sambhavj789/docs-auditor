'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SOURCE_EXT = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.sql', '.css', '.html', '.sh', '.ps1', '.c', '.cpp', '.h', '.cs', '.rb',
  '.php', '.ex', '.exs', '.dart', '.lua', '.gd'
]);

const SKIP_DIR = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt', '.expo',
  'vendor', 'out', '.cache', '__pycache__', '.venv', 'venv', 'target', 'bin', 'obj',
  '.godot'
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_WARN_DAYS = 7;
const DEFAULT_FAIL_DAYS = 30;
const MAX_LIST = 8;

function loadConfig(configPath) {
  const full = path.resolve(configPath || path.join(__dirname, 'projects.json'));
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    const hint = err.code === 'ENOENT' && path.basename(full) === 'projects.json'
      ? ' (copy projects.example.json to projects.json first)'
      : '';
    throw new Error('Cannot read config ' + full + ': ' + err.message + hint);
  }
  if (!raw || !Array.isArray(raw.projects) || raw.projects.length === 0) {
    throw new Error('Config must contain a non-empty "projects" array');
  }
  const base = path.dirname(full);
  const projects = raw.projects.map((item) => {
    if (!item || !item.name || !item.root) {
      throw new Error('Every project needs "name" and "root"');
    }
    const docs = item.docs || {};
    return {
      ...item,
      root: path.resolve(base, item.root),
      docs,
      required: Array.isArray(item.required) ? item.required : Object.keys(docs),
      frontMatter: item.frontMatter !== false,
      warnDays: Number.isFinite(item.warnDays) ? item.warnDays : DEFAULT_WARN_DAYS,
      failDays: Number.isFinite(item.failDays) ? item.failDays : DEFAULT_FAIL_DAYS,
      sources: Array.isArray(item.sources) ? item.sources : []
    };
  });
  return { ...raw, configPath: full, baseDir: base, projects };
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  } catch (_) {
    return null;
  }
}

function parseFrontMatter(text) {
  if (!text || !/^---\r?\n/.test(text)) return null;
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[m[1].toLowerCase()] = value;
  }
  return data;
}

function dayNumber(dateText) {
  if (!DATE_RE.test(dateText || '')) return null;
  const [year, month, day] = dateText.split('-').map(Number);
  const ms = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 86400000);
}

function todayNumber(now) {
  const d = now ? new Date(now) : new Date();
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
}

function findUpdatedDate(text, frontMatter) {
  if (frontMatter && dayNumber(frontMatter.updated)) return frontMatter.updated;
  const labelled = (text || '').match(
    /(?:last\s+verified|last\s+updated|updated|as\s+of)\s*:?\s*\**\s*(\d{4}-\d{2}-\d{2})/i
  );
  if (labelled && dayNumber(labelled[1])) return labelled[1];
  const first = (text || '').match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return first && dayNumber(first[1]) ? first[1] : null;
}

function walkSources(root, dirs) {
  const files = [];
  const seen = new Set();

  function walk(full) {
    let entries;
    try {
      entries = fs.readdirSync(full, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const child = path.join(full, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIR.has(entry.name)) walk(child);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
      const rel = path.relative(root, child).replace(/\\/g, '/');
      if (!seen.has(rel)) {
        seen.add(rel);
        files.push(rel);
      }
    }
  }

  for (const rel of dirs) {
    const full = path.resolve(root, rel);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch (_) {
      continue;
    }
    if (stat.isDirectory()) walk(full);
    else if (stat.isFile()) {
      const projectRel = path.relative(root, full).replace(/\\/g, '/');
      if (!seen.has(projectRel)) {
        seen.add(projectRel);
        files.push(projectRel);
      }
    }
  }
  return files.sort();
}

function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/`[^`\n]*`/g, '');
}

function checkLinks(root, files) {
  const broken = [];
  let checked = 0;
  const re = /\[[^\]]*\]\((<[^>\n]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g;

  for (const rel of files) {
    const text = readText(path.join(root, rel));
    if (!text) continue;
    const cleanText = stripCode(text);
    let match;
    while ((match = re.exec(cleanText))) {
      let href = match[1].trim();
      if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1);
      if (!href || /^(https?:|mailto:|tel:|data:|#|\/\/)/i.test(href)) continue;
      const target = href.split('#')[0].split('?')[0];
      if (!target) continue;
      checked++;
      let decoded = target;
      try {
        decoded = decodeURI(target);
      } catch (_) {
        // A stray % is a literal character, not a reason to abort the whole audit.
      }
      const abs = path.resolve(path.dirname(path.join(root, rel)), decoded);
      if (!fs.existsSync(abs)) broken.push(rel + ' -> ' + match[1]);
    }
  }
  return { checked, broken };
}

function addFinding(result, level, code, message) {
  result.findings.push({ level, code, message });
  result.counts[level]++;
}

function checkProject(project, options) {
  const root = project.root;
  const result = {
    name: project.name,
    root,
    status: 'ok',
    state: null,
    counts: { fail: 0, warn: 0, info: 0 },
    metrics: { docs: 0, docsPresent: 0, linksChecked: 0, brokenLinks: 0, sources: 0, unmapped: 0 },
    findings: []
  };

  let rootStat;
  try {
    rootStat = fs.statSync(root);
  } catch (_) {
    addFinding(result, 'fail', 'root-missing', 'project root does not exist: ' + root);
    result.status = 'fail';
    return result;
  }
  if (!rootStat.isDirectory()) {
    addFinding(result, 'fail', 'root-missing', 'project root is not a directory: ' + root);
    result.status = 'fail';
    return result;
  }

  const required = [];
  const seen = new Set();
  for (const key of project.required) {
    const rel = (project.docs[key] || key).replace(/\\/g, '/');
    if (seen.has(rel)) continue;
    seen.add(rel);
    required.push({ key, rel });
  }
  result.metrics.docs = required.length;

  const missing = [];
  const thin = [];
  const noFrontMatter = [];
  const badFrontMatter = [];
  const docsForLinks = new Set(['README.md', 'AGENTS.md']);

  for (const item of required) {
    const abs = path.resolve(root, item.rel);
    const text = readText(abs);
    if (text === null) {
      missing.push(item.rel);
      continue;
    }
    result.metrics.docsPresent++;
    if (item.rel.toLowerCase().endsWith('.md')) docsForLinks.add(item.rel);
    if (text.trim().length < 80) thin.push(item.rel);

    if (project.frontMatter && item.rel.toLowerCase().endsWith('.md') && item.rel.startsWith('docs/')) {
      const fm = parseFrontMatter(text);
      if (!fm) {
        noFrontMatter.push(item.rel);
      } else {
        const problems = [];
        if (!fm.title) problems.push('title');
        if (!fm.status || !['draft', 'active', 'superseded'].includes(fm.status)) problems.push('status');
        if (!dayNumber(fm.updated)) problems.push('updated');
        if (problems.length) badFrontMatter.push(item.rel + ' (' + problems.join(', ') + ')');
      }
    }
  }

  if (missing.length) {
    addFinding(result, 'fail', 'missing-doc', 'missing required: ' + missing.join(', '));
  }
  if (thin.length) {
    addFinding(result, 'warn', 'thin-doc', 'under 80 bytes: ' + thin.join(', '));
  }
  if (noFrontMatter.length) {
    addFinding(result, 'warn', 'frontmatter-missing',
      'no front matter: ' + noFrontMatter.slice(0, MAX_LIST).join(', ') +
      (noFrontMatter.length > MAX_LIST ? ' (+' + (noFrontMatter.length - MAX_LIST) + ' more)' : ''));
  }
  if (badFrontMatter.length) {
    addFinding(result, 'warn', 'frontmatter-invalid',
      'invalid front matter: ' + badFrontMatter.slice(0, MAX_LIST).join(', ') +
      (badFrontMatter.length > MAX_LIST ? ' (+' + (badFrontMatter.length - MAX_LIST) + ' more)' : ''));
  }

  const stateKey = project.stateKey || 'state';
  const stateRel = project.docs[stateKey] || project.docs.status || null;
  if (stateRel) {
    const stateText = readText(path.resolve(root, stateRel));
    if (stateText) {
      const fm = parseFrontMatter(stateText);
      const updated = findUpdatedDate(stateText, fm);
      const day = dayNumber(updated);
      result.state = { file: stateRel, updated: updated || null, ageDays: null };
      if (day !== null) {
        const age = todayNumber(options.now) - day;
        result.state.ageDays = age;
        if (age > project.failDays) {
          addFinding(result, 'fail', 'state-stale',
            stateRel + ' updated ' + updated + ' (' + age + ' days old, limit ' + project.failDays + ')');
        } else if (age > project.warnDays) {
          addFinding(result, 'warn', 'state-age',
            stateRel + ' updated ' + updated + ' (' + age + ' days old, warn after ' + project.warnDays + ')');
        }
      } else {
        addFinding(result, 'warn', 'state-undated', stateRel + ' has no valid updated date');
      }
    }
  }

  const indexRel = project.docs.index || null;
  const indexText = indexRel ? readText(path.resolve(root, indexRel)) : null;
  if (indexRel && indexText) {
    const unindexed = required
      .filter((item) => item.rel !== indexRel)
      .map((item) => item.rel)
      .filter((rel) => !indexText.includes(path.basename(rel)));
    if (unindexed.length) {
      addFinding(result, 'warn', 'unindexed',
        'not linked from ' + indexRel + ': ' + unindexed.slice(0, MAX_LIST).join(', ') +
        (unindexed.length > MAX_LIST ? ' (+' + (unindexed.length - MAX_LIST) + ' more)' : ''));
    }
  }

  const linkFiles = Array.from(docsForLinks).filter((rel) => fs.existsSync(path.resolve(root, rel)));
  const links = checkLinks(root, linkFiles);
  result.metrics.linksChecked = links.checked;
  result.metrics.brokenLinks = links.broken.length;
  if (links.broken.length) {
    addFinding(result, 'fail', 'broken-link',
      links.broken.slice(0, MAX_LIST).join('; ') +
      (links.broken.length > MAX_LIST ? ' (+' + (links.broken.length - MAX_LIST) + ' more)' : ''));
  }

  const codemapRel = project.docs.codemap || project.docs.map || null;
  if (codemapRel && project.sources.length) {
    const codemapText = readText(path.resolve(root, codemapRel));
    if (codemapText) {
      const files = walkSources(root, project.sources);
      const unmapped = files.filter((rel) => {
        return !codemapText.includes(rel) && !codemapText.includes(path.basename(rel));
      });
      result.metrics.sources = files.length;
      result.metrics.unmapped = unmapped.length;
      if (unmapped.length) {
        addFinding(result, 'warn', 'codemap-gap',
          unmapped.length + '/' + files.length + ' source files not in ' + codemapRel +
          ': ' + unmapped.slice(0, 6).join(', ') +
          (unmapped.length > 6 ? ' (+' + (unmapped.length - 6) + ' more)' : ''));
      }
    }
  }

  const gate = project.gate;
  if (gate) {
    const gateRel = typeof gate === 'string' ? gate : gate.script;
    const configRel = typeof gate === 'object' ? gate.config : null;
    const gateAbs = gateRel ? path.resolve(root, gateRel) : null;
    if (!gateAbs || !fs.existsSync(gateAbs)) {
      addFinding(result, 'warn', 'gate-missing', 'verify gate missing: ' + (gateRel || '(unset)'));
    } else {
      result.gate = { script: gateRel, status: 'present' };
      if (configRel && !fs.existsSync(path.resolve(root, configRel))) {
        addFinding(result, 'warn', 'gate-config-missing', 'gate config missing: ' + configRel);
      }
      if (options.runGates) {
        const run = spawnSync(process.execPath, [gateAbs], {
          cwd: root,
          encoding: 'utf8',
          timeout: options.gateTimeout || 20000
        });
        result.gate.status = run.status === 0 ? 'pass' : 'fail';
        if (run.status !== 0) {
          const detail = run.error
            ? run.error.code === 'ETIMEDOUT' ? 'timed out' : run.error.message
            : ((run.stderr || run.stdout || '') + '').trim().split(/\r?\n/).slice(-3).join(' | ');
          addFinding(result, 'fail', 'gate-failed', gateRel + ' failed' + (detail ? ': ' + detail : ''));
        }
      }
    }
  }

  result.status = result.counts.fail > 0 ? 'fail' : (result.counts.warn > 0 ? 'warn' : 'ok');
  return result;
}

function auditAll(config, options) {
  const opts = options || {};
  const results = config.projects
    .filter((project) => !opts.project || project.name === opts.project)
    .map((project) => checkProject(project, opts));
  const summary = {
    projects: results.length,
    ok: results.filter((r) => r.status === 'ok').length,
    warn: results.filter((r) => r.status === 'warn').length,
    fail: results.filter((r) => r.status === 'fail').length
  };
  return {
    generatedAt: new Date(opts.now || Date.now()).toISOString(),
    config: config.configPath,
    summary,
    projects: results
  };
}

function formatText(report, options) {
  const opts = options || {};
  const lines = [];
  lines.push('docs-auditor — ' + report.projects.length + ' project(s)');
  lines.push('config: ' + report.config);
  lines.push('');

  const nameWidth = Math.max(8, ...report.projects.map((p) => p.name.length));
  for (const project of report.projects) {
    const state = project.state
      ? project.state.updated
        ? project.state.updated + ' (' + project.state.ageDays + 'd)'
        : 'undated'
      : 'no state';
    const gate = project.gate ? 'gate ' + project.gate.status : 'no gate';
    const counts = [];
    if (project.counts.fail) counts.push(project.counts.fail + ' fail');
    if (project.counts.warn) counts.push(project.counts.warn + ' warn');
    lines.push(
      project.name.padEnd(nameWidth) + '  ' +
      project.status.toUpperCase().padEnd(4) + '  ' +
      'state ' + state.padEnd(18) + '  ' +
      'docs ' + project.metrics.docsPresent + '/' + project.metrics.docs + '  ' +
      'links ' + project.metrics.linksChecked + '  ' +
      gate + (counts.length ? '  ' + counts.join(', ') : '')
    );
    const findings = project.findings.filter((f) => opts.verbose || f.level !== 'info');
    for (const finding of findings) {
      lines.push('  ' + finding.level.toUpperCase().padEnd(4) + '  [' + finding.code + '] ' + finding.message);
    }
  }

  lines.push('');
  lines.push(
    report.summary.projects + ' projects — ' +
    report.summary.ok + ' ok, ' + report.summary.warn + ' warn, ' +
    report.summary.fail + ' fail'
  );
  return lines.join('\n');
}

module.exports = {
  loadConfig,
  checkProject,
  auditAll,
  formatText,
  parseFrontMatter,
  checkLinks,
  walkSources,
  dayNumber
};
