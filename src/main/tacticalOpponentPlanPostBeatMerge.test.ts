/**
 * Regression tests for deferred tactical post-beat `tacticalOpponentPlan` merge rules.
 *
 * Purpose: An attach push with null or all-empty plan must not behave like a valid opponent plan (that would commit
 * zero opponent movement while leaving Ready enabled). Non-empty plans must pass through unchanged.
 * When to use: `npm test` / `npm run build:main` after changing `tacticalOpponentPlanMerge` or the push listener.
 * Expected outcome: `tacticalOpponentPlanPayloadHasAnyOrders` and `nextTacticalOpponentDraftAfterDeferredPush` match
 * the contracts exercised by `registerPostResolutionConsultPushListener`.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TacticalOpponentPlanPayload } from '../shared/ipc/readyTypes';
import {
  nextTacticalOpponentDraftAfterDeferredPush,
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

test('nextTacticalOpponentDraftAfterDeferredPush keeps non-empty plans and requests prefetch otherwise', () => {
  assert.deepEqual(nextTacticalOpponentDraftAfterDeferredPush(sampleMarchPlan), {
    draft: sampleMarchPlan,
    startBackgroundPrefetch: false,
  });
  assert.deepEqual(nextTacticalOpponentDraftAfterDeferredPush(null), {
    draft: null,
    startBackgroundPrefetch: true,
  });
  assert.deepEqual(nextTacticalOpponentDraftAfterDeferredPush(undefined), {
    draft: null,
    startBackgroundPrefetch: true,
  });
  assert.deepEqual(nextTacticalOpponentDraftAfterDeferredPush(emptyPlan), {
    draft: null,
    startBackgroundPrefetch: true,
  });
});
