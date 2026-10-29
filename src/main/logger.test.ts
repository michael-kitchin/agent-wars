/**
 * Contracts for log argument text.
 *
 * Purpose: An `Error` logged through `JSON.stringify` used to become `{}` because `message` and `stack` are not enumerable.
 * When to use: After changing `formatLogArgument`.
 * Expected outcome: The formatter includes the exception message for a top-level `Error` and for an `Error` nested in an object, on one line.
 * Exceptions: None. This file does not call `logError` and does not append `debug.log`.
 */

import * as assert from 'assert';
import { formatLogArgument } from './logger';

/**
 * Shows an exception message instead of an empty object.
 *
 * Purpose: `listModels` and other `logError` calls pass the caught value directly or inside `{ err }`.
 * When to use: After changing `formatLogArgument`.
 * Expected outcome: Both forms contain the message, and the top-level form has no raw newline.
 * Exceptions: None.
 */
function testErrorMessageIsVisible(): void {
  const top = formatLogArgument(new Error('listModels failed'));
  assert.ok(top.includes('listModels failed'), top);
  assert.ok(!top.includes('\n'), 'stack stays on one line');
  const broken = formatLogArgument(new Error('line one\nline two'));
  assert.ok(broken.includes('line one') && broken.includes('line two'), broken);
  assert.ok(!broken.includes('\n'), 'a message with a newline stays on one line');
  const nested = formatLogArgument({ err: new Error('disk failed') });
  assert.ok(nested.includes('disk failed'), nested);
  assert.ok(!nested.includes('{}'), nested);
  assert.ok(!nested.includes('\n'), 'a nested stack stays on one line');
}

/**
 * Runs the log-argument contracts and exits non-zero on failure.
 *
 * Purpose: Same harness style as the other main-process tests.
 * When to use: Direct node invocation of this file.
 * Expected outcome: An `OK` line, or process exit 1.
 * Exceptions: None.
 */
function run(): void {
  try {
    testErrorMessageIsVisible();
    console.log('OK formatLogArgument includes Error message');
  } catch (err) {
    console.error('FAIL formatLogArgument includes Error message', err);
    process.exit(1);
  }
}

run();
