/**
 * The fixed diplomacy sentences.
 *
 * Purpose: System prompts are cached, so none of this text may name a turn.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/promptSpec/diplomacyRuleText.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIDE_AGREEMENT_INTENTS, SIDE_AGREEMENT_KINDS, SIDE_AGREEMENT_STATUSES } from '../../../shared/sideAgreements';
import {
  BATTLE_TRUCE_ORDERS_BULLETS,
  BATTLE_TRUCE_TALK_BULLETS,
  DIPLOMACY_PURPOSE_BULLETS,
  SIDE_AGREEMENT_ORDERS_BULLETS,
  sideAgreementReplyShape,
  sideAgreementTalkBullets,
  STANDINGS_TALK_BULLET,
} from './diplomacyRuleText';

test('no bullet names a turn by number', () => {
  const all = [...DIPLOMACY_PURPOSE_BULLETS, STANDINGS_TALK_BULLET, ...sideAgreementTalkBullets(), ...SIDE_AGREEMENT_ORDERS_BULLETS];
  for (const bullet of all) assert.doesNotMatch(bullet, /turn \d/);
});

test('the standings bullet is one line of its own, outside the purpose bullets both theaters share', () => {
  assert.equal(STANDINGS_TALK_BULLET.startsWith('-'), false);
  assert.equal(STANDINGS_TALK_BULLET.includes('\n'), false);
  assert.equal((DIPLOMACY_PURPOSE_BULLETS as readonly string[]).includes(STANDINGS_TALK_BULLET), false);
  assert.equal(
    STANDINGS_TALK_BULLET,
    'The Standings section ranks the sides still in the match by the city hexes each holds, counted by the game. When the match has a turn limit, that section says when the match ends and who would win if it ended now.'
  );
});

test('the talk bullets name every kind, and the reply shape lists every status and intent', () => {
  const talk = sideAgreementTalkBullets().join('\n');
  for (const kind of SIDE_AGREEMENT_KINDS) assert.ok(talk.includes(kind), kind);
  const shape = sideAgreementReplyShape();
  for (const word of [...SIDE_AGREEMENT_STATUSES, ...SIDE_AGREEMENT_INTENTS]) assert.ok(shape.includes(word), word);
});

test('the orders bullets say units in one hex fight whatever was agreed', () => {
  assert.equal(SIDE_AGREEMENT_ORDERS_BULLETS.length, 3);
  assert.ok(SIDE_AGREEMENT_ORDERS_BULLETS.some((bullet) => bullet.includes('whatever the two sides have agreed')));
});

test('the battle bullets say the shot count includes fire units took on their own', () => {
  assert.equal(BATTLE_TRUCE_ORDERS_BULLETS.length, 3);
  assert.equal(BATTLE_TRUCE_TALK_BULLETS.length, 2);
  for (const bullets of [BATTLE_TRUCE_ORDERS_BULLETS, BATTLE_TRUCE_TALK_BULLETS]) {
    const text = bullets.join('\n');
    assert.equal(text.includes('a side ordered'), false);
    assert.ok(text.includes('fired on their own'));
    assert.doesNotMatch(text, /\d/);
  }
  assert.ok(BATTLE_TRUCE_ORDERS_BULLETS.join('\n').includes(
    'holding fire while the other side keeps shooting loses your units. To hold fire yourself, give no attack order against that side and list it in "holdAutomaticFireAgainst".',
  ));
});
