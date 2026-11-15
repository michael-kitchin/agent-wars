/**
 * The talk prompt's system text and situation text.
 *
 * Purpose: The system text stays free of turn facts, and the situation text nests and quotes messages safely.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/talk/talkPrompt.test.js`.
 * Expected outcome: The phrases and headings below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIDE_STANCES } from '../../../shared/sideMessages';
import { assertHeadingsNest, headingOutline } from '../../testSupport/promptOutlineHelpers';
import { buildTalkSituationText, buildTalkSystemText, type TalkPromptInput, type TalkPromptSide } from './talkPrompt';

const own: TalkPromptSide = {
  code: 'a1',
  label: 'Iberia',
  isOwn: true,
  outTurn: null,
  stance: null,
  stanceReason: null,
};

const other: TalkPromptSide = {
  code: 'h1',
  label: 'France',
  isOwn: false,
  outTurn: null,
  stance: 'wary',
  stanceReason: 'Massing',
};

const quiet: TalkPromptSide = {
  code: 'a2',
  label: 'Britain',
  isOwn: false,
  outTurn: null,
  stance: null,
  stanceReason: null,
};

function input(extra: Partial<TalkPromptInput> = {}): TalkPromptInput {
  return {
    ownSideLabel: 'Iberia',
    turnNumber: 4,
    battle: null,
    sides: [own, other, quiet],
    lastStrategy: 'Hold the coast.',
    recentTurnsSection: '',
    threads: [
      {
        sideCode: 'h1',
        lines: [
          { turnNumber: 2, fromOwnSide: false, text: 'Leave "Iberia" alone.', isNew: false, messageId: 1 },
          { turnNumber: 3, fromOwnSide: true, text: 'I will stay out.', isNew: true, messageId: 2 },
        ],
      },
      { sideCode: 'a2', lines: [] },
    ],
    ...extra,
  };
}

test('the system text names the side, the limit, and the trust rules, and has no other digits', () => {
  const text = buildTalkSystemText('Iberia');
  assert.match(text, /commander of Iberia/);
  assert.match(text, /280/);
  for (const stance of SIDE_STANCES) assert.match(text, new RegExp(stance));
  assert.deepEqual(text.match(/\d+/g), ['280']);
  assert.match(text, /a human player or another AI model/);
  assert.match(text, /may or may not be telling the truth/);
  assert.match(text, /may or may not have your interests in mind/);
  assert.match(text, /written by the commander of one of the other sides/);
});

test('the situation text nests, marks one new line, and quotes safely', () => {
  const text = buildTalkSituationText(input());
  assert.equal(text.split('### With').length - 1, 2);
  assert.equal(text.split(' (new)').length - 1, 1);
  assert.equal(text.split('- No messages yet.').length - 1, 1);
  assert.match(text, /Leave 'Iberia' alone/);
  assert.equal(text.includes('"Iberia"'), false);
  assertHeadingsNest(headingOutline(text));
});

test('a battle input names the beat and the opponent', () => {
  const text = buildTalkSituationText(input({ battle: { beatNumber: 2, opponentLabel: 'France' } }));
  assert.match(text, /battle beat 2/);
  assert.match(text, /You are fighting France in this battle/);
});
