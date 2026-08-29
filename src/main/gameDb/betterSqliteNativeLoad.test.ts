/**
 * Contract tests for detecting better-sqlite3 native ABI/load failures so corrupt-database recovery is not used
 * for packaging mistakes.
 */

import * as assert from 'assert';
import {
  isBetterSqliteNativeLoadError,
  notifyBetterSqliteNativeLoadFailureAndExitIfApplicable,
} from './betterSqliteNativeLoad';

/**
 * Defines the `testIsBetterSqliteNativeLoadErrorPositive` function shape (function testIsBetterSqliteNativeLoadErrorPositive(): void).

 * Purpose: Locks in recognition of the Electron vs Node NODE_MODULE_VERSION mismatch message.
 * When to use: Run as part of the main-process unit test suite.
 * Expected outcome: Assertion passes for representative `ERR_DLOPEN_FAILED` payloads.
 * Exceptions: None.
 */
function testIsBetterSqliteNativeLoadErrorPositive(): void {
  const msg =
    "The module '...better_sqlite3.node' was compiled against a different Node.js version using " +
    'NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 143.';
  assert.strictEqual(
    isBetterSqliteNativeLoadError(Object.assign(new Error(msg), { code: 'ERR_DLOPEN_FAILED' })),
    true
  );
  assert.strictEqual(isBetterSqliteNativeLoadError(new Error(msg)), true);
}

/**
 * Defines the `testIsBetterSqliteNativeLoadErrorNegative` function shape (function testIsBetterSqliteNativeLoadErrorNegative(): void).

 * Purpose: Ensures unrelated SQLite errors are not classified as native load failures.
 * When to use: Run as part of the main-process unit test suite.
 * Expected outcome: Assertion passes for generic errors.
 * Exceptions: None.
 */
function testIsBetterSqliteNativeLoadErrorNegative(): void {
  assert.strictEqual(isBetterSqliteNativeLoadError(new Error('SQLITE_CORRUPT')), false);
  assert.strictEqual(isBetterSqliteNativeLoadError(null), false);
  assert.strictEqual(isBetterSqliteNativeLoadError(undefined), false);
}

/**
 * Defines the `testNotifyNoOpForUnrelatedErrors` function shape (function testNotifyNoOpForUnrelatedErrors(): void).

 * Purpose: Ensures the notifier returns false for non-native errors without throwing.
 * When to use: Run as part of the main-process unit test suite.
 * Expected outcome: `notifyBetterSqliteNativeLoadFailureAndExitIfApplicable` returns false.
 * Exceptions: None.
 */
function testNotifyNoOpForUnrelatedErrors(): void {
  assert.strictEqual(notifyBetterSqliteNativeLoadFailureAndExitIfApplicable(new Error('other')), false);
}

testIsBetterSqliteNativeLoadErrorPositive();
testIsBetterSqliteNativeLoadErrorNegative();
testNotifyNoOpForUnrelatedErrors();
console.log('betterSqliteNativeLoad.test.ts passed');
