#!/usr/bin/env node
'use strict';

const path = require('path');
const { loadConfig, auditAll, formatText, formatMarkdown } = require('./audit');
const pkg = require('./package.json');

function usage() {
  return [
    'docs-auditor ' + pkg.version,
    '',
    'Usage: node docs-auditor.js [options]',
    '',
    'Options:',
    '  --config <path>   Config file (default: projects.json next to this script)',
    '  --project <name>  Audit one project',
    '  --json            Print machine-readable JSON',
    '  --md              Print a Markdown table instead of the text report',
    '  --strict          Exit 1 on warnings too',
    '  --run-gates       Run each configured verify gate',
    '  --warn-days <n>   Warn when state is older than n days (overrides projects.json)',
    '  --fail-days <n>   Fail when state is older than n days (overrides projects.json)',
    '  --verbose         Show info findings',
    '  --help            Show this help',
    '',
    'Exit: 0 green/warnings, 1 red (or warnings with --strict), 2 config error.'
  ].join('\n');
}

function positiveDays(flag, raw) {
  const text = raw === undefined || raw === null ? '' : String(raw).trim();
  const value = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(flag + ' needs a positive integer');
  }
  return value;
}

function parseArgs(argv) {
  const opts = {
    config: path.join(__dirname, 'projects.json'),
    json: false,
    md: false,
    strict: false,
    runGates: false,
    verbose: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--version' || arg === '-v') opts.version = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--md') opts.md = true;
    else if (arg === '--strict') opts.strict = true;
    else if (arg === '--run-gates') opts.runGates = true;
    else if (arg === '--warn-days') opts.warnDays = positiveDays('--warn-days', argv[++i]);
    else if (arg === '--fail-days') opts.failDays = positiveDays('--fail-days', argv[++i]);
    else if (arg === '--verbose') opts.verbose = true;
    else if (arg === '--config') {
      opts.config = argv[++i];
      if (!opts.config) throw new Error('--config needs a path');
    }
    else if (arg === '--project') {
      opts.project = argv[++i];
      if (!opts.project) throw new Error('--project needs a name');
    }
    else throw new Error('Unknown option: ' + arg);
  }
  if (opts.json && opts.md) throw new Error('Use either --json or --md, not both');
  return opts;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message + '\n\n' + usage());
    process.exit(2);
  }
  if (opts.help) {
    console.log(usage());
    return;
  }
  if (opts.version) {
    console.log(pkg.version);
    return;
  }
  if (!opts.config) {
    console.error('--config needs a path\n\n' + usage());
    process.exit(2);
  }

  let report;
  try {
    const config = loadConfig(opts.config);
    if (opts.project && !config.projects.some((p) => p.name === opts.project)) {
      throw new Error('Unknown project: ' + opts.project);
    }
    report = auditAll(config, opts);
  } catch (err) {
    console.error('docs-auditor: ' + err.message);
    process.exit(2);
  }

  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else if (opts.md) console.log(formatMarkdown(report, opts));
  else console.log(formatText(report, opts));

  const failed = report.summary.fail > 0 || (opts.strict && report.summary.warn > 0);
  process.exit(failed ? 1 : 0);
}

main();
