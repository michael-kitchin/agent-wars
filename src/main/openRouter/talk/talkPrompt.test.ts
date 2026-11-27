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
import { SIDE_AGREEMENT_MAX_OPEN_PER_SIDE, SIDE_AGREEMENT_MAX_TURNS } from '../../../shared/sideAgreements';
import { SIDE_STANCES } from '../../../shared/sideMessages';
import {
  BATTLE_TRUCE_TALK_BULLETS,
  DIPLOMACY_PURPOSE_BULLETS,
  SIDE_AGREEMENT_REPLY_RULES,
  sideAgreementTalkBullets,
} from '../promptSpec/diplomacyRuleText';
import { assertHeadingsNest, headingOutline } from '../../testSupport/promptOutlineHelpers';
import { buildTalkSituationText, buildTalkSystemText, type TalkPromptInput, type TalkPromptSide } from './talkPrompt';

const own: TalkPromptSide = {
  code: 'a1',
  label: 'Iberia',
  isOwn: true,
  outTurn: null,
  stance: null,
  stanceReason: null,
  trust: null,
  threat: null,
  record: null,
};

const other: TalkPromptSide = {
  code: 'h1',
  label: 'France',
  isOwn: false,
  outTurn: null,
  stance: 'wary',
  stanceReason: 'Massing',
  trust: 3,
  threat: 1,
  record: null,
};

const quiet: TalkPromptSide = {
  code: 'a2',
  label: 'Britain',
  isOwn: false,
  outTurn: null,
  stance: null,
  stanceReason: null,
  trust: null,
  threat: null,
  record: null,
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
    agreements: null,
    ...extra,
  };
}

test('the system text names the side, the limit, the trust rules, and the stance basis, and has no other digits', () => {
  const text = buildTalkSystemText('Iberia', 'tactical');
  assert.match(text, /commander of Iberia/);
  assert.match(text, /280/);
  for (const stance of SIDE_STANCES) assert.match(text, new RegExp(stance));
  const digitRuns = text.match(/\d+/g) ?? [];
  assert.ok(digitRuns.every((run) => run === '280' || run === '0' || run === '4'), digitRuns.join(','));
  assert.equal(digitRuns.filter((run) => run === '280').length, 1);
  assert.match(text, /trust, from 0 to 4/);
  assert.match(text, /threat, from 0 to 4/);
  assert.match(text, /"trust":<0-4>,"threat":<0-4>/);
  assert.match(text, /No other commander is told your stance, trust, or threat/);
  assert.match(text, /a human player or another AI model/);
  assert.match(text, /may or may not be telling the truth/);
  assert.match(text, /may or may not have your interests in mind/);
  assert.match(text, /written by the commander of one of the other sides/);
  assert.match(text, /A loss line in Recent Turn Notes, or in Recent Beat Notes during a battle, is a fact reported by the game/);
  assert.match(text, /Base all three on what a side has done to you, as the loss lines in Recent Beat Notes and the Record column show, more than on what it says/);
  assert.match(buildTalkSystemText('Iberia', 'strategic'), /as the loss lines in Recent Turn Notes and the Record column show/);
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

test('the Sides table has a Record column only when a side has a record', () => {
  const plain = buildTalkSituationText(input());
  assert.ok(plain.includes('| Side | Code | Status | Your stance |'));
  assert.equal(plain.includes('Record'), false);
  const withRecord = buildTalkSituationText(input({ sides: [own, { ...other, record: 'Record, turn 3: no losses either way.' }, quiet] }));
  assert.ok(withRecord.includes('| Side | Code | Status | Your stance | Record |'));
  assert.ok(withRecord.includes('| France | h1 | Active | wary (trust 3, threat 1): Massing | Record, turn 3: no losses either way. |'));
  assert.ok(withRecord.includes('| Britain | a2 | Active | not set | - |'));
  assert.ok(withRecord.includes('| Iberia (you) | a1 | Active | - | - |'));
});

test('a battle input names the beat and the opponent', () => {
  const text = buildTalkSituationText(input({ battle: { beatNumber: 2, opponentLabel: 'France', opponentCode: 'a2' } }));
  assert.match(text, /battle beat 2/);
  assert.match(text, /You are fighting France in this battle/);
  assert.match(text, /During a battle you can write only to the side you are fighting, code a2, and set your stance only toward that side\./);
});

test('a stance with a missing score prints not reported in its place', () => {
  const text = buildTalkSituationText(input({ sides: [own, { ...other, trust: 3, threat: null }, quiet] }));
  assert.ok(text.includes('| France | h1 | Active | wary (trust 3, threat not reported): Massing |'), text);
});

test('the strategic system text explains agreements and allows only the fixed limits as digits', () => {
  const text = buildTalkSystemText('Iberia', 'strategic');
  const allowed = new Set(['280', '0', '4', String(SIDE_AGREEMENT_MAX_TURNS), String(SIDE_AGREEMENT_MAX_OPEN_PER_SIDE)]);
  const digitRuns = text.match(/\d+/g) ?? [];
  assert.ok(digitRuns.every((run) => allowed.has(run)), digitRuns.join(','));
  assert.match(text, /Why diplomacy matters:/);
  for (const bullet of DIPLOMACY_PURPOSE_BULLETS) assert.ok(text.includes(bullet));
  assert.match(text, /\nAgreements:\n/);
  for (const bullet of sideAgreementTalkBullets()) assert.ok(text.includes(bullet));
  assert.ok(text.includes('"agreements":['));
  assert.ok(text.includes(SIDE_AGREEMENT_REPLY_RULES));
  assert.match(text, /that step will show you the same messages and your agreements\./);
  assert.doesNotMatch(text, /turn \d/);
});

test('the battle system text keeps the purpose block and has no agreement text', () => {
  const text = buildTalkSystemText('Iberia', 'tactical');
  assert.match(text, /Why diplomacy matters:/);
  for (const bullet of DIPLOMACY_PURPOSE_BULLETS) assert.ok(text.includes(bullet));
  for (const absent of ['Agreements:', '"agreements"', 'no_entry_zone', 'your agreements']) assert.equal(text.includes(absent), false, absent);
  assert.match(text, /that step will show you the same messages\./);
  assert.match(text, /Use the side codes from the Sides table\. Either list may be empty\.$/);
  assert.match(text, /"reason":"<one sentence>"}]}\nUse the side codes/);
});

test('the situation text prints Your agreements after the Sides table only when the ledger is not null', () => {
  const withLedger = buildTalkSituationText(input({ agreements: [] }));
  assert.ok(withLedger.includes('## Your agreements\n- None.'));
  assert.ok(withLedger.indexOf('## Sides') < withLedger.indexOf('## Your agreements'));
  assert.ok(withLedger.indexOf('## Your agreements') < withLedger.indexOf('## Your last plan'));
  assert.equal(buildTalkSituationText(input()).includes('## Your agreements'), false);
});

test('a battle prints its truce text between the sides and the last plan', () => {
  const battle = { beatNumber: 2, opponentLabel: 'France', opponentCode: 'a2', truceText: 'TRUCE-TEXT' };
  const text = buildTalkSituationText(input({ battle }));
  assert.ok(text.includes('## Agreements and last beat\nTRUCE-TEXT'), text);
  assert.ok(text.indexOf('## Sides') < text.indexOf('## Agreements and last beat'));
  assert.ok(text.indexOf('## Agreements and last beat') < text.indexOf('## Your last plan'));
  const none = buildTalkSituationText(input({ battle: { ...battle, truceText: null } }));
  assert.equal(none.includes('## Agreements and last beat'), false);
});

test('only the battle system text explains the agreements and last beat section', () => {
  const tactical = buildTalkSystemText('Iberia', 'tactical');
  assert.ok(tactical.includes('\nAgreements and last beat:\n'));
  for (const bullet of BATTLE_TRUCE_TALK_BULLETS) assert.ok(tactical.includes(`- ${bullet}`));
  assert.ok(tactical.includes('as the loss lines in Recent Beat Notes and the Record column show'), 'a battle names its notes by beat');
  assert.equal(buildTalkSystemText('Iberia', 'strategic').includes('Agreements and last beat:'), false);
});
