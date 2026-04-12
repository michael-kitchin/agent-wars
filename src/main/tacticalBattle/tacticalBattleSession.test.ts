/**
 * Tests for tactical main-process session helpers. Run with: node dist/main/tacticalBattle/tacticalBattleSession.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceActiveTacticalTurn, endTacticalBattleSession } from './tacticalBattleSession';
import { tacticalDbFixtureRegisterDefaultAfterEach } from './testSupport/tacticalDbFixture';

tacticalDbFixtureRegisterDefaultAfterEach();

test('advanceActiveTacticalTurn fails when no tactical session is active', () => {
  endTacticalBattleSession();
  const r = advanceActiveTacticalTurn();
  assert.equal(r.success, false);
  assert.ok(r.reason);
});
