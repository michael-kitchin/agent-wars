/**
 * Developer environment flags.
 *
 * Purpose: On/off flags share one parser, including quoted values a shell may leave in place.
 * When to use: `npm run build:main`, then `node dist/main/envFlag.test.js`.
 * Expected outcome: 1, true, yes, and on are enabled. An unset flag is not.
 * Exceptions: None. The flag is removed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isEnvFlagEnabled } from './envFlag';

const FLAG = 'AGENT_WARS_ENV_FLAG_TEST';

test('an environment flag accepts the usual on values', () => {
  const previous = process.env[FLAG];
  try {
    for (const value of ['1', 'true', 'YES', 'on', '"On"', " 'yes' "]) {
      process.env[FLAG] = value;
      assert.equal(isEnvFlagEnabled(FLAG), true, value);
    }
    delete process.env[FLAG];
    assert.equal(isEnvFlagEnabled(FLAG), false);
    process.env[FLAG] = 'no';
    assert.equal(isEnvFlagEnabled(FLAG), false);
  } finally {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
  }
});
