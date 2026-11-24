/**
 * Contract tests for the main-process grid range check.
 *
 * Purpose: `isWithinGridRangeSafe` shares the pure check and its fallback disk memo, and adds an error log on disk failure.
 * When to use: After changing `gridRange.ts` or `checkGridRangePure`.
 * Expected outcome: Process exit 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { cellToChildren, getRes0Cells } from 'h3-js';
import { computeGridDistancePure, isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { isWithinGridRangeSafe } from './gridRange';

/**
 * A temporary working directory for this test process.
 *
 * Purpose: `logError` appends to `debug.log` in the working directory, and the failure test logs on purpose. Moving the
 *   process here keeps those lines out of the repository's `debug.log`.
 * When to use: Set once at load. The test runner starts each test file in its own process, so no other file is affected.
 * Expected outcome: Error lines from this file land in a `debug.log` under the system temp directory.
 * Exceptions: None.
 */
const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-grid-range-'));
process.chdir(logDirectory);

/**
 * Runs `body` while recording what `console.error` receives.
 *
 * Purpose: `logError` writes through `console.error`, so the test can see each error log without a logger hook.
 * When to use: Around calls that should or should not log an error.
 * Expected outcome: The first argument of each `console.error` call. The original `console.error` is restored.
 * Exceptions: Propagates what `body` throws, after restoring `console.error`.
 */
function captureErrorLogs(body: () => void): string[] {
  const seen: string[] = [];
  const original = console.error;
  console.error = (first?: unknown) => {
    seen.push(String(first));
  };
  try {
    body();
  } finally {
    console.error = original;
  }
  return seen;
}

test('the logging check answers the same as the pure check', () => {
  const cells = getRes0Cells().flatMap((parent) => cellToChildren(parent, 1));
  let unmeasurable = 0;
  const logs = captureErrorLogs(() => {
    for (let i = 0; i < cells.length; i += 37) {
      for (let j = 0; j < cells.length; j += 11) {
        const origin = cells[i]!;
        const destination = cells[j]!;
        if (computeGridDistancePure(origin, destination) === null) unmeasurable += 1;
        for (const range of [0, 3, 4]) {
          assert.equal(isWithinGridRangeSafe(origin, destination, range, 'gridRange.test'), isWithinGridRangePure(origin, destination, range));
        }
      }
    }
  });
  assert.ok(unmeasurable > 0, 'the sample must reach the disk fallback');
  assert.deepEqual(logs, []);
});

test('a failed disk is logged on every check and gives false', () => {
  const destination = '81283ffffffffff';
  const logs = captureErrorLogs(() => {
    // h3-js rejects this index in `gridDisk`; a non-hex string only gives an empty disk.
    assert.equal(isWithinGridRangeSafe('ffffffffffffffff', destination, 3, 'gridRange.test'), false);
    assert.equal(isWithinGridRangeSafe('ffffffffffffffff', destination, 3, 'gridRange.test'), false);
  });
  assert.equal(logs.filter((line) => line.includes('gridRange.test: gridDisk failed')).length, 2);
});
