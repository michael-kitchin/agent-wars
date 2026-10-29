import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX,
  MAP_DOUBLE_CLICK_SELECTION_FREEZE_MS,
  mapSelectionComposition,
  resolveMapDoubleClickAction,
  resolveMapGesturePress,
} from './mapPlanningGesture';

describe('mapSelectionComposition', () => {
  it('classifies empty, air, non-air, and mixed selections', () => {
    assert.equal(mapSelectionComposition([]), 'empty');
    assert.equal(mapSelectionComposition(['air', 'air']), 'airOnly');
    assert.equal(mapSelectionComposition(['infantry', 'naval']), 'nonAirOnly');
    assert.equal(mapSelectionComposition(['air', 'armor']), 'mixed');
    assert.equal(mapSelectionComposition(['missile']), 'missileOnly');
    assert.equal(mapSelectionComposition(['missile', 'infantry']), 'mixedMissile');
  });
});

describe('resolveMapDoubleClickAction', () => {
  const airAway = {
    targetingModeActive: false,
    pointerHasHit: true,
    hasDestination: true,
    composition: 'airOnly' as const,
    allSelectedUnitsAlreadyAtDestination: false,
    iconHit: false,
    ferryEligible: null as boolean | null,
  };

  it('plans a ferry on an eligible hex whether or not the click hit an icon', () => {
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, ferryEligible: true }), { kind: 'planFerry' });
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, iconHit: true, ferryEligible: true }),
      { kind: 'planFerry' }
    );
  });

  it('asks the caller to validate before it can choose a ferry outcome', () => {
    assert.deepEqual(resolveMapDoubleClickAction(airAway), { kind: 'needFerryValidation' });
  });

  it('clears an air selection on an empty ineligible click and toasts on an icon one', () => {
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, ferryEligible: false }), { kind: 'deselect' });
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, iconHit: true, ferryEligible: false }),
      { kind: 'rejectFerry' }
    );
  });

  it('clears on an empty own-hex click and ignores an own-hex icon click, whatever the composition', () => {
    for (const composition of ['airOnly', 'nonAirOnly', 'mixed'] as const) {
      assert.deepEqual(
        resolveMapDoubleClickAction({ ...airAway, composition, allSelectedUnitsAlreadyAtDestination: true }),
        { kind: 'deselect' },
        `empty own-hex click should clear a ${composition} selection`
      );
      assert.deepEqual(
        resolveMapDoubleClickAction({
          ...airAway,
          composition,
          allSelectedUnitsAlreadyAtDestination: true,
          iconHit: true,
        }),
        { kind: 'ignore' },
        `own-hex icon click should do nothing for a ${composition} selection`
      );
    }
  });

  it('rejects a mixed selection on any other hex', () => {
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, composition: 'mixed' }), { kind: 'rejectMixed' });
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, composition: 'mixed', iconHit: true }),
      { kind: 'rejectMixed' }
    );
  });

  it('clears a missile selection on an empty click, ignores an icon click, and rejects a mix', () => {
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, composition: 'missileOnly' }), { kind: 'deselect' });
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, composition: 'missileOnly', iconHit: true }),
      { kind: 'ignore' }
    );
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, composition: 'mixedMissile' }),
      { kind: 'rejectMissileMixed' }
    );
  });

  it('still plans a support target while aiming, including a missile selection', () => {
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, composition: 'missileOnly', targetingModeActive: true }),
      { kind: 'planSupportTarget' }
    );
  });

  it('plans a march for non-air selections on icon hits and on empty clicks', () => {
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, composition: 'nonAirOnly', iconHit: true }),
      { kind: 'planMarch' }
    );
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, composition: 'nonAirOnly' }),
      { kind: 'planMarch' }
    );
  });

  it('plans a support target while targeting is on, including own hex and icon hits', () => {
    for (const composition of ['airOnly', 'nonAirOnly', 'mixed'] as const) {
      assert.deepEqual(
        resolveMapDoubleClickAction({
          ...airAway,
          composition,
          targetingModeActive: true,
          allSelectedUnitsAlreadyAtDestination: true,
          iconHit: true,
        }),
        { kind: 'planSupportTarget' },
        `targeting should plan a support target for a ${composition} selection`
      );
    }
  });

  it('ignores a targeting double-click with no pointer hex or an empty selection, and ignores a move with no destination', () => {
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, targetingModeActive: true, pointerHasHit: false, hasDestination: true }),
      { kind: 'ignore' }
    );
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, targetingModeActive: true, composition: 'empty' }),
      { kind: 'ignore' }
    );
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, hasDestination: false }), { kind: 'ignore' });
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, composition: 'empty' }), { kind: 'ignore' });
  });
});

describe('resolveMapGesturePress', () => {
  const secondPressInPlace = {
    snapshotAtMs: 1_000,
    snapshotAnchorClientX: 400,
    snapshotAnchorClientY: 300,
    snapshotUnitCount: 2,
    liveSelectionDiffersFromSnapshot: false,
    shiftKey: false,
    clientX: 400,
    clientY: 300,
    nowMs: 1_200,
  };

  it('freezes the snapshot and suppresses retarget for a second press in place', () => {
    assert.deepEqual(resolveMapGesturePress(secondPressInPlace), {
      refreshSnapshot: false,
      restoreSnapshotSelection: false,
      suppressIconRetarget: true,
    });
  });

  it('restores the snapshot when a deferred select already changed the live selection', () => {
    assert.deepEqual(
      resolveMapGesturePress({ ...secondPressInPlace, liveSelectionDiffersFromSnapshot: true, nowMs: 1_400 }),
      { refreshSnapshot: false, restoreSnapshotSelection: true, suppressIconRetarget: true }
    );
  });

  it('takes a fresh snapshot for a first press, a late press, or a press somewhere else', () => {
    const fresh = { refreshSnapshot: true, restoreSnapshotSelection: false, suppressIconRetarget: false };
    assert.deepEqual(resolveMapGesturePress({ ...secondPressInPlace, snapshotAtMs: 0 }), fresh);
    assert.deepEqual(
      resolveMapGesturePress({
        ...secondPressInPlace,
        nowMs: 1_000 + MAP_DOUBLE_CLICK_SELECTION_FREEZE_MS + 1,
      }),
      fresh
    );
    assert.deepEqual(
      resolveMapGesturePress({
        ...secondPressInPlace,
        clientX: 400 + MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX + 1,
        liveSelectionDiffersFromSnapshot: true,
      }),
      fresh
    );
  });

  it('takes a fresh snapshot for shift presses and when nothing was selected', () => {
    const fresh = { refreshSnapshot: true, restoreSnapshotSelection: false, suppressIconRetarget: false };
    assert.deepEqual(resolveMapGesturePress({ ...secondPressInPlace, shiftKey: true }), fresh);
    assert.deepEqual(
      resolveMapGesturePress({
        ...secondPressInPlace,
        snapshotUnitCount: 0,
        liveSelectionDiffersFromSnapshot: true,
      }),
      fresh
    );
  });
});
