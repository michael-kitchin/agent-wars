'use strict';

/**
 * Decides what to do after one prebuild-install attempt for better-sqlite3.
 *
 * Purpose: Keeps a locked native binary on the prebuild path so a transient file lock is not treated as a missing binary.
 * When to use: From `rebuild-native.cjs` after prebuild-install exits, and from its contract test.
 * Expected outcome: `ready`, `retry-prebuild`, or `compile`.
 * Exceptions: None.
 */

/**
 * Classifies one prebuild-install result.
 *
 * Purpose: A Windows lock (EBUSY or EPERM) means the existing binary could not be replaced. Any other failure is a candidate for a source compile.
 * When to use: Immediately after prebuild-install returns.
 * Expected outcome: `ready` when the exit code is 0, `retry-prebuild` when the output reports a file lock, otherwise `compile`.
 * Exceptions: None. Non-string output is treated as empty.
 *
 * @param {number} prebuildCode
 * @param {string} output
 * @returns {'ready' | 'retry-prebuild' | 'compile'}
 */
function nativeBuildStepAfterPrebuild(prebuildCode, output) {
  if (prebuildCode === 0) return 'ready';
  const text = typeof output === 'string' ? output : '';
  if (/(?:EBUSY|EPERM|resource busy or locked|operation not permitted)/i.test(text)) {
    return 'retry-prebuild';
  }
  return 'compile';
}

module.exports = {
  nativeBuildStepAfterPrebuild,
};
