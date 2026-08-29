#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * Fails when renderer `tsc` reports errors that are not in the frozen baseline.
 *
 * Purpose: Keeps renderer TypeScript from silently gaining new errors now that `tsconfig.renderer.json` type-checks.
 * When to use: From `npm run check:renderer-types` after lint in `npm test` and `verify:modularization`.
 * Expected outcome: Exit 0 when `tsc` output is usable, every current error is in the baseline, and the current count is not larger than the baseline.
 * Exceptions: Exit 1 on new or extra errors. Refresh the baseline only with:
 *   node scripts/dump-renderer-typecheck-baseline.cjs scripts/renderer-typecheck-baseline.json
 *   Never refresh the baseline to hide a newly introduced error.
 */

const fs = require('fs');
const path = require('path');
const {
  computeDisallowedTypecheckEntries,
  isRendererTypecheckRunUsable,
  runRendererTypecheck,
} = require('./renderer-typecheck-report.cjs');

const repoRoot = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'renderer-typecheck-baseline.json');

function main() {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  if (!Array.isArray(baseline)) {
    console.error('check-renderer-typecheck: baseline is not a JSON array');
    process.exit(1);
  }
  const run = runRendererTypecheck();
  if (!isRendererTypecheckRunUsable(run)) {
    console.error('check-renderer-typecheck: renderer tsc did not produce usable file-error output');
    if (run.error) console.error(`check-renderer-typecheck: spawn error: ${run.error.message || run.error}`);
    console.error(`check-renderer-typecheck: tsc status=${run.status}`);
    if (run.raw) console.error(run.raw);
    process.exit(1);
  }
  const { entries } = run;
  const disallowed = computeDisallowedTypecheckEntries(entries, baseline);
  if (disallowed.length > 0) {
    console.error('check-renderer-typecheck: found renderer type errors not in the baseline');
    for (const entry of disallowed) {
      console.error(` - ${entry}`);
    }
    process.exit(1);
  }
  if (entries.length > baseline.length) {
    console.error(
      `check-renderer-typecheck: error count ${entries.length} exceeds baseline ${baseline.length}`
    );
    process.exit(1);
  }
  const resolved = baseline.filter((entry) => !entries.includes(entry));
  console.log('check-renderer-typecheck: ok');
  console.log(`check-renderer-typecheck: entries=${entries.length}`);
  if (resolved.length > 0) {
    console.log(`check-renderer-typecheck: resolved baseline entries=${resolved.length}`);
    for (const entry of resolved) {
      console.log(` - ${entry}`);
    }
  }
}

main();
