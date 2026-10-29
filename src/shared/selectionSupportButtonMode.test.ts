import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INFANTRY_CANNOT_FIRE_REASON,
  selectionSupportAction,
  selectionSupportButtonMode,
  STRIKE_NEEDS_AIR_ONLY_REASON,
} from './selectionSupportButtonMode';
import { LAUNCH_NEEDS_MISSILES_ONLY_REASON, MISSILES_CANNOT_FIRE_IN_BATTLE_REASON } from './missileRules';

describe('selectionSupportButtonMode strategic', () => {
  it('hides the button when nothing is selected', () => {
    assert.equal(selectionSupportButtonMode([], false), 'hidden');
  });

  it('offers Ranged for one capable unit and for several capable units', () => {
    assert.equal(selectionSupportButtonMode(['armor'], false), 'ranged');
    assert.equal(selectionSupportButtonMode(['armor', 'naval'], false), 'ranged');
  });

  it('hides Ranged when any selected unit cannot fire one', () => {
    assert.equal(selectionSupportButtonMode(['armor', 'infantry'], false), 'hidden');
    assert.equal(selectionSupportButtonMode(['armor', 'air'], false), 'hidden');
  });

  it('offers Strike for one air unit and for several air units', () => {
    assert.equal(selectionSupportButtonMode(['air'], false), 'strike');
    assert.equal(selectionSupportButtonMode(['air', 'air'], false), 'strike');
  });

  it('offers Launch for missiles on the world map and hides it in a battle', () => {
    assert.equal(selectionSupportButtonMode(['missile'], false), 'launch');
    assert.equal(selectionSupportButtonMode(['missile', 'missile'], false), 'launch');
    assert.equal(selectionSupportButtonMode(['missile'], true), 'hidden');
  });
});

describe('selectionSupportButtonMode tactical', () => {
  it('offers Ranged for tactical infantry alone and with armor', () => {
    assert.equal(selectionSupportButtonMode(['infantry'], true), 'ranged');
    assert.equal(selectionSupportButtonMode(['infantry', 'armor'], true), 'ranged');
  });

  it('hides Ranged when air is mixed with a tactical ranged unit', () => {
    assert.equal(selectionSupportButtonMode(['infantry', 'air'], true), 'hidden');
  });
});

describe('selectionSupportAction', () => {
  it('enables Ranged or Strike when the selection can use it', () => {
    assert.deepEqual(selectionSupportAction(['armor'], false), { kind: 'ranged', enabled: true, reason: null });
    assert.deepEqual(selectionSupportAction(['air', 'air'], false), { kind: 'strike', enabled: true, reason: null });
    assert.deepEqual(selectionSupportAction(['infantry'], true), { kind: 'ranged', enabled: true, reason: null });
  });

  it('greys out Ranged with a reason when a world-map selection includes infantry', () => {
    assert.deepEqual(selectionSupportAction(['armor', 'infantry'], false), {
      kind: 'ranged',
      enabled: false,
      reason: INFANTRY_CANNOT_FIRE_REASON,
    });
  });

  it('greys out Strike with a reason when air is mixed with other types', () => {
    assert.deepEqual(selectionSupportAction(['infantry', 'air'], false), {
      kind: 'strike',
      enabled: false,
      reason: STRIKE_NEEDS_AIR_ONLY_REASON,
    });
    assert.deepEqual(selectionSupportAction(['armor', 'air'], true), {
      kind: 'strike',
      enabled: false,
      reason: STRIKE_NEEDS_AIR_ONLY_REASON,
    });
  });

  it('greys out Ranged without a reason for an empty selection', () => {
    assert.deepEqual(selectionSupportAction([], false), { kind: 'ranged', enabled: false, reason: null });
  });

  it('enables Launch for missiles on the world map', () => {
    assert.deepEqual(selectionSupportAction(['missile', 'missile'], false), { kind: 'launch', enabled: true, reason: null });
  });

  it('greys out Launch in a battle and when missiles are mixed with other types', () => {
    assert.deepEqual(selectionSupportAction(['missile'], true), {
      kind: 'launch',
      enabled: false,
      reason: MISSILES_CANNOT_FIRE_IN_BATTLE_REASON,
    });
    assert.deepEqual(selectionSupportAction(['missile', 'infantry'], false), {
      kind: 'launch',
      enabled: false,
      reason: LAUNCH_NEEDS_MISSILES_ONLY_REASON,
    });
  });
});
