#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * Writes the current renderer `tsc` error set as a JSON baseline array.
 *
 * Purpose: Captures today's known renderer type errors so `check-renderer-typecheck.cjs` can fail only on new ones.
 * When to use: After an intentional, reviewed reduction of renderer type errors (never to hide a newly introduced error).
 * Expected outcome: Sorted JSON array written to the given path (default `scripts/renderer-typecheck-baseline.json`).
 * Exceptions: Exits non-zero if `tsc` cannot be spawned or produces no usable per-file error output.
 */

const fs = require('fs');
const path = require('path');
const { isRendererTypecheckRunUsable, runRendererTypecheck } = require('./renderer-typecheck-report.cjs');

const repoRoot = path.resolve(__dirname, '..');
const destArg = process.argv[2] || 'scripts/renderer-typecheck-baseline.json';
const outPath = path.isAbsolute(destArg) ? destArg : path.join(repoRoot, destArg);

const run = runRendererTypecheck();
if (!isRendererTypecheckRunUsable(run)) {
  console.error('dump-renderer-typecheck-baseline: renderer tsc did not produce usable file-error output');
  if (run.error) console.error(`dump-renderer-typecheck-baseline: spawn error: ${run.error.message || run.error}`);
  console.error(`dump-renderer-typecheck-baseline: tsc status=${run.status}`);
  if (run.raw) console.error(run.raw);
  process.exit(1);
}
const { entries } = run;
const sorted = [...entries].sort((a, b) => a.localeCompare(b));
fs.writeFileSync(outPath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
console.log(`dump-renderer-typecheck-baseline: wrote ${sorted.length} entries to ${path.relative(repoRoot, outPath)}`);
