/**
 * The posture fit rules and the Fit line wording.
 * Run with: node dist/main/openRouter/postureFit.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  forceLandSteps,
  postureAttentionBullet,
  postureFitLine,
  postureFitsFor,
  postureFitsText,
  postureShipsLine,
} from './postureFit';
import type { PostureFitFacts, PostureFitReport, PostureFitRow } from './postureFitTypes';
import type { Posture } from '../../shared/postureTypes';

/**
 * Builds one fit row from facts, deciding the fits the way the engine does.
 *
 * Purpose: The line cases vary only the facts and the name.
 * When to use: The `postureFitLine` cases.
 * Expected outcome: A row whose fits come from `postureFitsFor`.
 * Exceptions: None.
 */
function row(facts: PostureFitFacts, extra: { readonly name?: string; readonly pactPartner?: boolean } = {}): PostureFitRow {
  return { seatId: 'opponent', name: extra.name ?? 'Eastern Asia', pactPartner: extra.pactPartner ?? false, facts, fits: postureFitsFor(facts) };
}

const SIX: Pick<PostureFitFacts, 'landForce'> = { landForce: 6 };

test('forceLandSteps takes the distance of the force-th nearest unit', () => {
  const distances = [5, 1, 9, 3];
  assert.equal(forceLandSteps({ distances, force: 2 }), 3);
  assert.equal(forceLandSteps({ distances, force: 4 }), 9);
  assert.equal(forceLandSteps({ distances, force: 5 }), null);
  assert.equal(forceLandSteps({ distances, force: 0 }), null);
  assert.equal(forceLandSteps({ distances: [], force: 1 }), null);
  assert.deepEqual(distances, [5, 1, 9, 3]);
});

test('a home near by land fits overland, and blitz only while lightly held', () => {
  const base = { ...SIX, seaReachable: false, maritimeCapacity: 0 };
  assert.deepEqual(postureFitsFor({ ...base, landSteps: 4, garrison: 8 }), ['overland']);
  assert.deepEqual(postureFitsFor({ ...base, landSteps: 4, garrison: 3 }), ['overland', 'blitz']);
  assert.deepEqual(postureFitsFor({ ...base, landSteps: 12, garrison: 8 }), ['overland']);
});

test('a home beyond the march fits maritime by sea, overland without a sea route', () => {
  assert.deepEqual(postureFitsFor({ ...SIX, landSteps: 13, seaReachable: true, garrison: 0, maritimeCapacity: 16 }), ['maritime']);
  assert.deepEqual(postureFitsFor({ ...SIX, landSteps: 13, seaReachable: false, garrison: 0, maritimeCapacity: 16 }), ['overland']);
});

test('a home out of every reach fits strangle, or strangle then maritime when a landing is too small', () => {
  assert.deepEqual(postureFitsFor({ ...SIX, landSteps: null, seaReachable: true, garrison: 45, maritimeCapacity: 16 }), ['strangle', 'maritime']);
  assert.deepEqual(postureFitsFor({ ...SIX, landSteps: null, seaReachable: false, garrison: 0, maritimeCapacity: 16 }), ['strangle']);
});

test('postureFitsText words each list of fits', () => {
  const cases: ReadonlyArray<readonly [readonly Posture[], string]> = [
    [['overland'], 'overland'],
    [['overland', 'blitz'], 'overland, or blitz while its home is this lightly held'],
    [['maritime'], 'maritime'],
    [['strangle', 'maritime'], 'strangle, then maritime'],
    [['strangle'], 'strangle'],
  ];
  for (const [fits, text] of cases) assert.equal(postureFitsText(fits), text);
});

test('the Fit line gives the step count and the garrison', () => {
  assert.equal(
    postureFitLine(row({ ...SIX, landSteps: 4, seaReachable: false, garrison: 8, maritimeCapacity: 16 })),
    '- Fit, Eastern Asia: 6 of your ground units are 4 land steps from its home. Its home holds 8 ground units. Fits: overland.',
  );
  assert.equal(
    postureFitLine(row({ ...SIX, landSteps: 19, seaReachable: true, garrison: 45, maritimeCapacity: 16 }, { name: 'Northern America' })),
    '- Fit, Northern America: 6 of your ground units are 19 land steps from its home, too far to march, but it can be reached by sea. Its home holds 45 ground units, so a landing needs 68, more than the 16 maritime could land. Fits: strangle, then maritime.',
  );
});

test('each reach has its wording', () => {
  assert.equal(
    postureFitLine(row({ ...SIX, landSteps: 0, seaReachable: false, garrison: 2, maritimeCapacity: 0 })),
    '- Fit, Eastern Asia: 6 of your ground units are in its home. Its home holds 2 ground units. Fits: overland, or blitz while its home is this lightly held.',
  );
  assert.equal(
    postureFitLine(row({ ...SIX, landSteps: 1, seaReachable: false, garrison: 9, maritimeCapacity: 0 })),
    '- Fit, Eastern Asia: 6 of your ground units are 1 land step from its home. Its home holds 9 ground units. Fits: overland.',
  );
  assert.equal(
    postureFitLine(row({ ...SIX, landSteps: 20, seaReachable: true, garrison: 4, maritimeCapacity: 8 })),
    '- Fit, Eastern Asia: 6 of your ground units are 20 land steps from its home, too far to march, but it can be reached by sea. Its home holds 4 ground units. Fits: maritime.',
  );
  assert.equal(
    postureFitLine(row({ ...SIX, landSteps: 20, seaReachable: false, garrison: 4, maritimeCapacity: 8 })),
    '- Fit, Eastern Asia: 6 of your ground units are 20 land steps from its home, too far to march, and it cannot be reached by sea. Its home holds 4 ground units. Fits: overland.',
  );
  assert.equal(
    postureFitLine(row({ landForce: 6, landSteps: null, seaReachable: true, garrison: 4, maritimeCapacity: 8 })),
    '- Fit, Eastern Asia: it can be reached only by sea. Its home holds 4 ground units. Fits: maritime.',
  );
  assert.equal(
    postureFitLine(row({ landForce: 0, landSteps: null, seaReachable: false, garrison: 0, maritimeCapacity: 0 })),
    '- Fit, Eastern Asia: it cannot be reached by land or sea. Its home holds 0 ground units. Fits: strangle.',
  );
});

test('a sea-only home too strong to land on names the landing it needs', () => {
  assert.equal(
    postureFitLine(row({ landForce: 6, landSteps: null, seaReachable: true, garrison: 6, maritimeCapacity: 8 })),
    '- Fit, Eastern Asia: it can be reached only by sea. Its home holds 6 ground units, so a landing needs 9, more than the 8 maritime could land. Fits: strangle, then maritime.',
  );
});

test('an empty sea-only home that maritime cannot land the minimum on says so', () => {
  assert.equal(
    postureFitLine(row({ landForce: 6, landSteps: null, seaReachable: true, garrison: 0, maritimeCapacity: 1 })),
    '- Fit, Eastern Asia: it can be reached only by sea. Its home holds 0 ground units, but maritime could land only 1, fewer than the 2 any landing needs. Fits: strangle, then maritime.',
  );
});

test('the Ships line counts one ground unit in the singular', () => {
  assert.equal(
    postureShipsLine({ naval: 1, navalCap: 8, maritimeCapacity: 1 }),
    '- Ships: 1 of your naval cap of 8. On maritime a campaign lift could carry up to 1 ground unit.',
  );
  assert.equal(
    postureShipsLine({ naval: 2, navalCap: 8, maritimeCapacity: 4 }),
    '- Ships: 2 of your naval cap of 8. On maritime a campaign lift could carry up to 4 ground units.',
  );
});

test('a pact partner and a single unit use their own wording', () => {
  assert.equal(
    postureFitLine(row({ landForce: 1, landSteps: 3, seaReachable: false, garrison: 1, maritimeCapacity: 0 }, { name: 'Western Europe', pactPartner: true })),
    '- Fit, Western Europe (active pact): 1 of your ground units is 3 land steps from its home. Its home holds 1 ground unit. Fits: overland, or blitz while its home is this lightly held.',
  );
});

const MARITIME_FACTS: PostureFitFacts = { landForce: 6, landSteps: 19, seaReachable: true, garrison: 4, maritimeCapacity: 16 };
const STRONG_FACTS: PostureFitFacts = { landForce: 6, landSteps: 19, seaReachable: true, garrison: 45, maritimeCapacity: 16 };

/**
 * A report with a maritime row for a1 and a strangle-then-maritime row for a3.
 *
 * Purpose: The attention cases pick a holder from known rows.
 * When to use: The `postureAttentionBullet` cases.
 * Expected outcome: Two rows.
 * Exceptions: None.
 */
const REPORT: PostureFitReport = {
  shipsLine: '- Ships: 0 of your naval cap of 8. On maritime a campaign lift could carry up to 16 ground units.',
  rows: [
    { ...row(MARITIME_FACTS, { name: 'Eastern Asia' }), seatId: 'a1' },
    { ...row(STRONG_FACTS, { name: 'Northern America' }), seatId: 'a3' },
  ],
};

test('the attention bullet needs a report, a holder with a row, and a posture that does not fit', () => {
  const base = { report: REPORT, targetHolderSeatId: 'a1', current: 'overland', declared: false, holdUntilTurn: null } as const;
  assert.equal(postureAttentionBullet({ ...base, report: null }), null);
  assert.equal(postureAttentionBullet({ ...base, targetHolderSeatId: null }), null);
  assert.equal(postureAttentionBullet({ ...base, targetHolderSeatId: 'a9' }), null);
  assert.equal(postureAttentionBullet({ ...base, current: 'maritime' }), null);
});

test('the attention bullet says how to change a default posture, or when a held one can change', () => {
  assert.equal(
    postureAttentionBullet({ report: REPORT, targetHolderSeatId: 'a1', current: 'overland', declared: false, holdUntilTurn: null }),
    'Posture: your campaign target is held by Eastern Asia, and maritime fits it. You are on overland by default. Set "posture" in your reply to change it.',
  );
  assert.equal(
    postureAttentionBullet({ report: REPORT, targetHolderSeatId: 'a3', current: 'overland', declared: true, holdUntilTurn: 16 }),
    'Posture: your campaign target is held by Northern America, and strangle, then maritime fits it. You are on overland until turn 16.',
  );
});
