#!/usr/bin/env node
/**
 * Prints the current runtime import cycles under `src/`, or writes them to a file.
 *
 * Used to record a deliberately accepted cycle in the baseline that `check-circular-deps.cjs`
 * compares against. Both scripts read imports through `lib/importGraph.cjs` so the file this writes
 * is always in the form the checker expects.
 *
 * Usage:
 *   node scripts/dump-circular-deps.cjs                                    (print to stdout)
 *   node scripts/dump-circular-deps.cjs scripts/circular-deps-baseline.json (overwrite the baseline)
 *
 * Overwriting the baseline accepts every cycle currently present, so review the diff before keeping
 * it. An empty result is the healthy state and writes an empty array.
 */
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');

const { findRuntimeImportCycles } = require('./lib/importGraph.cjs');

/**
 * Emits the cycle list as formatted JSON to the path given on the command line, or to stdout.
 *
 * A relative destination resolves against the working directory so the documented invocation from
 * the repository root behaves as written.
 */
function main() {
  const root = process.cwd();
  const cycles = findRuntimeImportCycles(root);
  const serialised = `${JSON.stringify(cycles, null, 2)}\n`;
  const dest = process.argv[2];

  if (dest === undefined) {
    process.stdout.write(serialised);
    return;
  }

  const outPath = path.isAbsolute(dest) ? dest : path.join(root, dest);
  fs.writeFileSync(outPath, serialised, 'utf8');
  console.log(`dump-circular-deps: wrote ${cycles.length} cycle(s) to ${dest}`);
}

main();
