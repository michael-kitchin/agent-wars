/**
 * The agreement lines of a prompt.
 *
 * Purpose: The wording is quoted in the prompt documents, so it is checked exactly.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/talk/sideAgreementPromptLines.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SideAgreementView } from '../../sideAgreements/sideAgreementLedger';
import type { SideAgreementStanding } from '../../../shared/sideAgreements';
import { formatSideAgreementLines } from './sideAgreementPromptLines';

/**
 * Builds a view for the cases.
 *
 * Purpose: Each case overrides only what it checks.
 * When to use: Every case.
 * Expected outcome: An active non-aggression view with the Southern France label and evidence.
 * Exceptions: None.
 */
function view(overrides: Partial<SideAgreementView> = {}): SideAgreementView {
  return {
    agreementId: 7,
    counterpartSeatId: 'opponent4',
    counterpartCode: 'a4',
    counterpartLabel: 'Southern France',
    kind: 'non_aggression',
    terms: 'No strikes or crossings on the Alpine frontier.',
    zoneCodes: [],
    againstCode: null,
    againstLabel: null,
    startTurn: 3,
    endTurn: 8,
    standing: 'active',
    intent: 'opportunistic',
    decision: { turnNumber: 5, decision: 'keep', reason: 'Still useful.' },
    evidence: 'Record, turns 3 to 5: no losses either way.',
    ...overrides,
  };
}

test('no views print None', () => {
  assert.equal(formatSideAgreementLines([]), '- None.');
});

test('an active agreement prints exactly as the prompt documents show it', () => {
  assert.equal(
    formatSideAgreementLines([view()]),
    [
      '- Agreement 7 with Southern France (a4): non_aggression, turns 3 to 8, active. Your intent: opportunistic. Terms: "No strikes or crossings on the Alpine frontier." Your decision on turn 5: keep, "Still useful."',
      '  Record, turns 3 to 5: no losses either way.',
    ].join('\n')
  );
});

test('each standing prints its text', () => {
  const expected: Array<[SideAgreementStanding, string]> = [
    ['proposed', 'turns 3 to 8, proposed.'],
    ['expired', 'turns 3 to 8, expired after turn 8.'],
    ['lapsed', 'turns 3 to 8, lapsed because a4 is out of the match.'],
    ['ended', 'turns 3 to 8, ended.'],
    ['broken_by_them', 'turns 3 to 8, broken by a4.'],
    ['broken_by_me', 'turns 3 to 8, broken by you.'],
  ];
  for (const [standing, text] of expected) {
    assert.ok(formatSideAgreementLines([view({ standing, evidence: null })]).includes(text), standing);
  }
});

test('zone and against print in order, quotes are softened, and a missing reason ends the decision', () => {
  const line = formatSideAgreementLines([
    view({
      terms: 'Keep "out" of D4.',
      zoneCodes: ['D4', 'DO'],
      againstCode: 'a2',
      againstLabel: 'Northern France',
      decision: { turnNumber: 6, decision: 'break', reason: '' },
      evidence: null,
    }),
  ]);
  assert.ok(line.includes(`Terms: "Keep 'out' of D4." Zone: D4, DO. Against: Northern France (a2). Your decision on turn 6: break.`));
  assert.equal(line.includes('\n'), false);
});
