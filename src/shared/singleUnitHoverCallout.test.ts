/**
 * Hover rule for the one-unit token tooltip.
 * Happy path and the stack, blocked, and leave cases. Run with: node dist/shared/singleUnitHoverCallout.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideSingleUnitHoverCallout, type SingleUnitHoverInput } from './singleUnitHoverCallout';

/**
 * Builds a pointer sample with the idle defaults overridden.
 *
 * Purpose: Keeps each case focused on the field it changes.
 * When to use: Only from this file.
 * Expected outcome: A complete input whose omitted fields are an empty, unblocked pointer.
 * Exceptions: None.
 */
function sample(overrides: Partial<SingleUnitHoverInput>): SingleUnitHoverInput {
  return {
    h3: null,
    stationaryUnitCount: 0,
    pendingH3: null,
    hoverOpenedH3: null,
    pointerOnToken: false,
    blocked: false,
    ...overrides,
  };
}

test('a one-unit token arms the hover once', () => {
  const armed = decideSingleUnitHoverCallout(sample({ h3: 'aa', stationaryUnitCount: 1, pointerOnToken: true }));
  assert.deepEqual(armed, {
    schedule: true,
    clearPending: false,
    dismissOpen: false,
    suppressHexTooltip: true,
  });
  const holding = decideSingleUnitHoverCallout(
    sample({ h3: 'aa', stationaryUnitCount: 1, pointerOnToken: true, pendingH3: 'aa' })
  );
  assert.equal(holding.schedule, false);
  assert.equal(holding.suppressHexTooltip, true);
});

test('a stack, the rest of the hex, or a blocked pointer does not arm, and leaving dismisses the tooltip', () => {
  const stack = decideSingleUnitHoverCallout(sample({ h3: 'aa', stationaryUnitCount: 2, pendingH3: 'bb' }));
  assert.equal(stack.schedule, false);
  assert.equal(stack.clearPending, true);
  assert.equal(stack.suppressHexTooltip, false);

  const offToken = decideSingleUnitHoverCallout(
    sample({ h3: 'aa', stationaryUnitCount: 1, pointerOnToken: false, pendingH3: 'aa' })
  );
  assert.equal(offToken.schedule, false);
  assert.equal(offToken.clearPending, true);
  assert.equal(offToken.suppressHexTooltip, false);

  const blocked = decideSingleUnitHoverCallout(
    sample({ h3: 'aa', stationaryUnitCount: 1, pointerOnToken: true, blocked: true, pendingH3: 'aa' })
  );
  assert.equal(blocked.schedule, false);
  assert.equal(blocked.clearPending, true);

  const left = decideSingleUnitHoverCallout(sample({ h3: 'bb', stationaryUnitCount: 0, hoverOpenedH3: 'aa' }));
  assert.equal(left.dismissOpen, true);
  const leftMap = decideSingleUnitHoverCallout(sample({ h3: null, hoverOpenedH3: 'aa' }));
  assert.equal(leftMap.dismissOpen, true);
});
