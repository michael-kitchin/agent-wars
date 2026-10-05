/**
 * Briefing Bonus-cell wording for the tech bonus.
 * Happy path and the case that must stay a dash. Run with: node dist/shared/techBonusRules.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBonusTableCellWithTech } from './techBonusRules';

const off = { countryBonusEnabled: false, terrainBonusEnabled: false };
const low = { ...off, techBonusEnabled: true as const, techBonusLevel: 'low' as const };
const high = { ...off, techBonusEnabled: true as const, techBonusLevel: 'high' as const };

test('an Advanced unit names attack only at Low and attack and defense at High', () => {
  assert.equal(
    formatBonusTableCellWithTech({ sources: [], amount: 0, techLevel: 'advanced', settings: low }),
    'tech +2 attack'
  );
  assert.equal(
    formatBonusTableCellWithTech({ sources: [], amount: 0, techLevel: 'advanced', settings: high }),
    'tech +2 attack and defense'
  );
  assert.equal(
    formatBonusTableCellWithTech({ sources: ['country'], amount: 2, techLevel: 'advanced', settings: low }),
    '+2 country; tech +2 attack'
  );
});

test('a Basic unit, and tech that is off, stay a dash when there is no origin bonus', () => {
  assert.equal(
    formatBonusTableCellWithTech({ sources: [], amount: 0, techLevel: 'basic', settings: high }),
    '—'
  );
  assert.equal(
    formatBonusTableCellWithTech({ sources: [], amount: 0, techLevel: 'advanced', settings: off }),
    '—'
  );
});
