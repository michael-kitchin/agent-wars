/**
 * The posture fit rules and the Fit line wording.
 * Run with: node dist/main/openRouter/postureFit.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postureFitLine, postureFitsFor, postureShipsLine } from './postureFit';

test('a land-reachable home fits overland, and blitz only while lightly held', () => {
  assert.deepEqual(postureFitsFor({ landReachable: true, seaReachable: false, garrison: 3, maritimeCapacity: 0 }), ['overland', 'blitz']);
  assert.deepEqual(postureFitsFor({ landReachable: true, seaReachable: false, garrison: 4, maritimeCapacity: 0 }), ['overland']);
});

test('a home reached only by sea fits maritime when a landing can beat its garrison', () => {
  assert.deepEqual(postureFitsFor({ landReachable: false, seaReachable: true, garrison: 5, maritimeCapacity: 8 }), ['maritime']);
  assert.deepEqual(postureFitsFor({ landReachable: false, seaReachable: true, garrison: 12, maritimeCapacity: 8 }), ['strangle', 'maritime']);
});

test('a home that cannot be reached fits strangle', () => {
  assert.deepEqual(postureFitsFor({ landReachable: false, seaReachable: false, garrison: 0, maritimeCapacity: 8 }), ['strangle']);
});

test('each case has its Fit line', () => {
  const base = { name: 'Eastern Asia', pactPartner: false, maritimeCapacity: 8 };
  assert.equal(
    postureFitLine({ ...base, landReachable: true, seaReachable: false, garrison: 2 }),
    '- Fit, Eastern Asia: home reachable by land, 2 ground units at home. Fits: overland, or blitz while its home is this lightly held.',
  );
  assert.equal(
    postureFitLine({ ...base, landReachable: true, seaReachable: false, garrison: 9 }),
    '- Fit, Eastern Asia: home reachable by land, 9 ground units at home. Fits: overland.',
  );
  assert.equal(
    postureFitLine({ ...base, landReachable: false, seaReachable: true, garrison: 4 }),
    '- Fit, Eastern Asia: home reachable only by sea, 4 ground units at home. Fits: maritime.',
  );
  assert.equal(
    postureFitLine({ ...base, landReachable: false, seaReachable: true, garrison: 20 }),
    '- Fit, Eastern Asia: home reachable only by sea, 20 ground units at home, so a landing needs 30, more than the 8 maritime could land. Fits: strangle, then maritime.',
  );
  assert.equal(
    postureFitLine({ ...base, landReachable: false, seaReachable: false, garrison: 0 }),
    '- Fit, Eastern Asia: home not reachable by land or sea. Fits: strangle.',
  );
});

test('a sea-only home too strong to land on names the landing it needs', () => {
  const base = { name: 'Eastern Asia', pactPartner: false, landReachable: false, seaReachable: true };
  assert.equal(
    postureFitLine({ ...base, garrison: 6, maritimeCapacity: 8 }),
    '- Fit, Eastern Asia: home reachable only by sea, 6 ground units at home, so a landing needs 9, more than the 8 maritime could land. Fits: strangle, then maritime.',
  );
});

test('an empty sea-only home that maritime cannot land the minimum on says so', () => {
  const line = postureFitLine({ name: 'Eastern Asia', pactPartner: false, landReachable: false, seaReachable: true, garrison: 0, maritimeCapacity: 1 });
  assert.equal(
    line,
    '- Fit, Eastern Asia: home reachable only by sea, 0 ground units at home, but maritime could land only 1, fewer than the 2 any landing needs. Fits: strangle, then maritime.',
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
    postureFitLine({ name: 'Western Europe', pactPartner: true, landReachable: true, seaReachable: false, garrison: 1, maritimeCapacity: 0 }),
    '- Fit, Western Europe (active pact): home reachable by land, 1 ground unit at home. Fits: overland, or blitz while its home is this lightly held.',
  );
});
