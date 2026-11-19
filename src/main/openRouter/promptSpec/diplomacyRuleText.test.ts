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
  DIPLOMACY_PURPOSE_BULLETS,
  SIDE_AGREEMENT_ORDERS_BULLETS,
  sideAgreementReplyShape,
  sideAgreementTalkBullets,
} from './diplomacyRuleText';

test('no bullet names a turn by number', () => {
  const all = [...DIPLOMACY_PURPOSE_BULLETS, ...sideAgreementTalkBullets(), ...SIDE_AGREEMENT_ORDERS_BULLETS];
  for (const bullet of all) assert.doesNotMatch(bullet, /turn \d/);
});

test('the talk bullets name every kind, and the reply shape lists every status and intent', () => {
  const talk = sideAgreementTalkBullets().join('\n');
  for (const kind of SIDE_AGREEMENT_KINDS) assert.ok(talk.includes(kind), kind);
  const shape = sideAgreementReplyShape();
  for (const word of [...SIDE_AGREEMENT_STATUSES, ...SIDE_AGREEMENT_INTENTS]) assert.ok(shape.includes(word), word);
});
