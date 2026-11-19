/**
 * The agreement gate for orders consults.
 *
 * Purpose: A battle never uses agreements, and a run with talk off uses none on the world map either.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/sideAgreementGate.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None. The environment variable is restored.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sideAgreementsEnabled } from './sideAgreementGate';

test('tactical is always off, and strategic follows the talk switch', () => {
  const previous = process.env.AGENT_WARS_DISABLE_TALK;
  try {
    delete process.env.AGENT_WARS_DISABLE_TALK;
    assert.equal(sideAgreementsEnabled('strategic'), true);
    assert.equal(sideAgreementsEnabled('tactical'), false);
    process.env.AGENT_WARS_DISABLE_TALK = '1';
    assert.equal(sideAgreementsEnabled('strategic'), false);
    assert.equal(sideAgreementsEnabled('tactical'), false);
  } finally {
    if (previous === undefined) delete process.env.AGENT_WARS_DISABLE_TALK;
    else process.env.AGENT_WARS_DISABLE_TALK = previous;
  }
});
