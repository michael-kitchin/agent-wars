/**
 * The truce text of a battle between two AI commanders.
 *
 * Purpose: Both battle prompts print this text, and the prompt documents quote it, so it is checked exactly.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/talk/battleTruceText.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS } from '../../../shared/seatIds';
import type { TacticalBeatActivity } from '../../../shared/tacticalBattleTypes';
import type { SideAgreementView } from '../../sideAgreements/sideAgreementLedger';
import { BATTLE_TRUCE_ORDERS_BULLETS, BATTLE_TRUCE_TALK_BULLETS } from '../promptSpec/diplomacyRuleText';
import { buildBattleTruceText } from './battleTruceText';
import { formatSideAgreementLines } from './sideAgreementPromptLines';

/**
 * One active agreement with the opponent.
 *
 * Purpose: The agreement part prints the shared agreement line, so one view is enough.
 * When to use: The agreement cases.
 * Expected outcome: An active ceasefire with the second AI seat.
 * Exceptions: None.
 */
const view: SideAgreementView = {
  agreementId: 3,
  counterpartSeatId: AI_SEAT_IDS[1],
  counterpartCode: 'a2',
  counterpartLabel: 'Iberia',
  kind: 'ceasefire_in_place',
  terms: 'Hold fire through turn six.',
  zoneCodes: [],
  againstCode: null,
  againstLabel: null,
  startTurn: 4,
  endTurn: 6,
  standing: 'active',
  closedTurn: null,
  intent: 'keep',
  decision: null,
  evidence: null,
};

/**
 * A beat where the lead side fired twice and the other side once.
 *
 * Purpose: Different counts show which one is printed as the commander's own.
 * When to use: The last-beat cases.
 * Expected outcome: A beat record without melee.
 * Exceptions: None.
 */
const activity: TacticalBeatActivity = { beatNumber: 2, leadShots: 2, opposingShots: 1, meleeFought: false };

/**
 * The truce text with the shared opponent.
 *
 * Purpose: Each case overrides only what it checks.
 * When to use: Every case.
 * Expected outcome: The built text, or null.
 * Exceptions: None.
 */
function truce(overrides: Partial<Parameters<typeof buildBattleTruceText>[0]> = {}): string | null {
  return buildBattleTruceText({
    opponentLabel: 'Iberia',
    opponentCode: 'a2',
    agreementViews: null,
    activity: null,
    ownIsLead: true,
    ...overrides,
  });
}

test('nothing to show gives no text', () => {
  assert.equal(truce(), null);
});

test('no agreement with the opponent says so', () => {
  assert.equal(truce({ agreementViews: [] }), 'You have no agreement on record with Iberia (a2).');
});

test('an agreement prints between the heading and the closing sentence', () => {
  assert.equal(
    truce({ agreementViews: [view] }),
    [
      'Your agreements with Iberia (a2), shown for reference:',
      formatSideAgreementLines([view]),
      'These are your own records. You cannot make or change an agreement during a battle, and hex codes inside an agreement are world-map codes, not codes of this battle.',
    ].join('\n')
  );
});

test('the last-beat line reads the counts from the side the commander is on', () => {
  assert.equal(truce({ activity }), 'Last beat, counted by the game: a2 fired 1 attack shot, and you fired 2 attack shots. There was no melee.');
  assert.equal(
    truce({ activity, ownIsLead: false }),
    'Last beat, counted by the game: a2 fired 2 attack shots, and you fired 1 attack shot. There was no melee.'
  );
});

test('no shots is plural, and a melee is reported', () => {
  const text = truce({ activity: { beatNumber: 3, leadShots: 0, opposingShots: 0, meleeFought: true } });
  assert.equal(text, 'Last beat, counted by the game: a2 fired 0 attack shots, and you fired 0 attack shots. Units of both sides fought in melee.');
});

test('agreements come first, one blank line before the last-beat line', () => {
  assert.equal(
    truce({ agreementViews: [], activity }),
    'You have no agreement on record with Iberia (a2).\n\nLast beat, counted by the game: a2 fired 1 attack shot, and you fired 2 attack shots. There was no melee.'
  );
});

test('both battle prompts say the count leaves out return fire and anti-air', () => {
  for (const bullet of [BATTLE_TRUCE_ORDERS_BULLETS[1], BATTLE_TRUCE_TALK_BULLETS[1]]) {
    assert.ok(bullet.includes('count of the attack shots each side fired last beat'), bullet);
    assert.ok(bullet.includes('Return fire and anti-air are not attack shots and are not counted'), bullet);
  }
});
