/**
 * The shared temporary-database test helper.
 *
 * Purpose: Many tests rely on `withTempGameDb` opening a reset match and always removing its directory.
 * When to use: After changing `withTempGameDb`.
 * Expected outcome: The cases below. Each uses a unique directory prefix so leftovers can be found.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { test } from 'node:test';
import { getGameState } from '../gameDb';
import { withTempGameDb } from './withTempGameDb';

/**
 * Builds a directory prefix no other case shares.
 *
 * Purpose: Lets a case look for its own leftover directory in the temp folder.
 * When to use: Each case below.
 * Expected outcome: A prefix that includes the process id, the clock, and the label.
 * Exceptions: None.
 */
function uniquePrefix(label: string): string {
  return `aw-wtgdb-${process.pid}-${Date.now()}-${label}-`;
}

/**
 * Counts temp-folder entries that start with a prefix.
 *
 * Purpose: A leftover directory shows up as a nonzero count.
 * When to use: After a helper call returns or throws.
 * Expected outcome: The number of matching directory names.
 * Exceptions: None.
 */
function leftovers(prefix: string): number {
  return fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(prefix)).length;
}

test('the case runs on an open, reset match and the directory is removed afterwards', () => {
  const prefix = uniquePrefix('ok');
  let turn = 0;
  withTempGameDb(prefix, () => {
    turn = getGameState().turnNumber;
    assert.equal(leftovers(prefix), 1);
  });
  assert.equal(turn, 1);
  assert.equal(leftovers(prefix), 0);
});

test('a throwing case rethrows and still removes the directory', () => {
  const prefix = uniquePrefix('throw');
  assert.throws(
    () =>
      withTempGameDb(prefix, () => {
        throw new Error('case failed');
      }),
    /case failed/
  );
  assert.equal(leftovers(prefix), 0);
});

test('reset false keeps the fresh database without a match', () => {
  let defaultUnits = 0;
  let freshUnits = -1;
  withTempGameDb(uniquePrefix('reset'), () => {
    defaultUnits = getGameState().units.length;
  });
  withTempGameDb(
    uniquePrefix('noreset'),
    () => {
      freshUnits = getGameState().units.length;
    },
    { reset: false }
  );
  assert.ok(defaultUnits > 0, 'a reset match has units');
  assert.equal(freshUnits, 0);
});

test('afterOpen runs before the case', () => {
  const order: string[] = [];
  withTempGameDb(uniquePrefix('after'), () => order.push('case'), { afterOpen: () => order.push('afterOpen') });
  assert.deepEqual(order, ['afterOpen', 'case']);
});
