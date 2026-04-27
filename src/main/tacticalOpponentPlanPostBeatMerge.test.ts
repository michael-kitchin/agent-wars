/**
 * Regression tests for tactical post-beat `tacticalOpponentPlan` merge rules on the commit IPC return.
 *
 * Purpose: An attach payload with null or all-empty plan must not behave like a valid opponent plan (that would commit
 * zero opponent movement while leaving Ready enabled). Non-empty plans must pass through unchanged.
 * When to use: `npm test` / `npm run build:main` after changing `tacticalOpponentPlanMerge` or renderer post-beat handling.
 * Expected outcome: `tacticalOpponentPlanPayloadHasAnyOrders` and `nextTacticalOpponentDraftAfterPostBeatPlan` match
 * the contracts exercised by `applyTacticalPostBeatConsultSideEffects`.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TacticalOpponentPlanPayload } from '../shared/ipc/readyTypes';
import {
  nextTacticalOpponentDraftAfterPostBeatPlan,
  tacticalOpponentPlanPayloadHasAnyOrders,
} from '../shared/ipc/tacticalOpponentPlanMerge';

const emptyPlan: TacticalOpponentPlanPayload = {
  movementOrders: [],
  rangedAttacks: [],
  airStrikes: [],
  ferryOrders: [],
  embarkOrders: [],
};

const sampleMarchPlan: TacticalOpponentPlanPayload = {
  movementOrders: [{ unitId: 'opponent-infantry-1:01', toH3Index: '8496ab5ffffffff' }],
  rangedAttacks: [],
  airStrikes: [],
  ferryOrders: [],
  embarkOrders: [],
};

test('tacticalOpponentPlanPayloadHasAnyOrders is false for null, undefined, and all-empty payloads', () => {
  assert.equal(tacticalOpponentPlanPayloadHasAnyOrders(null), false);
  assert.equal(tacticalOpponentPlanPayloadHasAnyOrders(undefined), false);
  assert.equal(tacticalOpponentPlanPayloadHasAnyOrders(emptyPlan), false);
});

test('tacticalOpponentPlanPayloadHasAnyOrders is true when any list is non-empty', () => {
  assert.equal(tacticalOpponentPlanPayloadHasAnyOrders(sampleMarchPlan), true);
  assert.equal(
    tacticalOpponentPlanPayloadHasAnyOrders({
      ...emptyPlan,
      rangedAttacks: [{ unitId: 'opponent-infantry-1:01', targetH3Index: '8496ab5ffffffff' }],
    }),
    true
  );
});

test('nextTacticalOpponentDraftAfterPostBeatPlan keeps non-empty plans and requests prefetch otherwise', () => {
  assert.deepEqual(nextTacticalOpponentDraftAfterPostBeatPlan(sampleMarchPlan), {
    draft: sampleMarchPlan,
    startBackgroundPrefetch: false,
  });
  assert.deepEqual(nextTacticalOpponentDraftAfterPostBeatPlan(null), {
    draft: null,
    startBackgroundPrefetch: true,
  });
  assert.deepEqual(nextTacticalOpponentDraftAfterPostBeatPlan(undefined), {
    draft: null,
    startBackgroundPrefetch: true,
  });
  assert.deepEqual(nextTacticalOpponentDraftAfterPostBeatPlan(emptyPlan), {
    draft: null,
    startBackgroundPrefetch: true,
  });
});
