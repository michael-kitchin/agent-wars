#!/usr/bin/env node
/**
 * Fails the build when a new runtime import cycle appears under `src/`.
 *
 * A cycle matters because it makes module initialisation order undefined, which shows up as a value
 * that is undefined at import time rather than as an error at the import. Only cycles that survive
 * compilation count: type-only imports are erased and cannot cause it. See `lib/importGraph.cjs`.
 *
 * The baseline exists so an intentional, understood cycle can be accepted deliberately instead of
 * blocking every later commit. It is not a place to put a finding you do not want to deal with -- a
 * new cycle should be fixed by changing an import direction. To record one on purpose, run
 * `node scripts/dump-circular-deps.cjs scripts/circular-deps-baseline.json` and review the diff.
 */
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');

const { findRuntimeImportCycles } = require('./lib/importGraph.cjs');

/** Where the deliberately accepted cycles are recorded. */
const BASELINE_PATH = path.join(__dirname, 'circular-deps-baseline.json');

/**
 * Reports runtime import cycles and exits non-zero when any is not in the baseline.
 *
 * Prints every offending cycle rather than only the first, because they are usually related and
 * fixing one import direction often clears several.
 */
function main() {
  const root = process.cwd();
  const allowed = new Set(JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')));
  const cycles = findRuntimeImportCycles(root);
  const disallowed = cycles.filter((cycle) => !allowed.has(cycle));

  if (disallowed.length === 0) {
    console.log('check-circular-deps: ok (no circular dependencies)');
    if (cycles.length > 0) {
      console.log(`check-circular-deps: baseline allowed cycles=${cycles.length}`);
    }
    return;
  }

  console.error('check-circular-deps: found circular dependencies');
  for (const cycle of disallowed) {
    console.error(` - ${cycle}`);
  }
  process.exit(1);
}

main();
