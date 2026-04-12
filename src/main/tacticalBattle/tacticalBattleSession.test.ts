/**
 * Tests for tactical main-process session helpers. Run with: node dist/main/tacticalBattle/tacticalBattleSession.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { endTacticalBattleSession, isTacticalBattleActive } from './tacticalBattleSession';
import { tacticalDbFixtureRegisterDefaultAfterEach } from './testSupport/tacticalDbFixture';

tacticalDbFixtureRegisterDefaultAfterEach();

test('endTacticalBattleSession keeps tactical session inactive when none exists', () => {
  endTacticalBattleSession();
  assert.equal(isTacticalBattleActive(), false);
});
