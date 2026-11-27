/**
 * Contracts for the quiet-beat rule of a battle between two AI seats.
 * Run with: node dist/shared/tacticalQuietBeat.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridRingUnsafe, latLngToCell } from 'h3-js';
import type { CombatDiceRoll, CombatDiceRollKind } from './ipc/combatDiceTypes';
import { AI_SEAT_IDS } from './seatIds';
import { anySubUnitMovedCloser, countAttackShots, isQuietBeat, type TacticalSubUnitPosition } from './tacticalQuietBeat';

const LEAD = AI_SEAT_IDS[0];
const OTHER = AI_SEAT_IDS[1];
const ORIGIN = latLngToCell(48.85, 2.35, 6);

/**
 * A cell the given number of steps from the origin, always along the same side of the ring.
 *
 * Purpose: Movement cases need cells at known distances from an enemy standing on the origin.
 * When to use: Placing a sub-unit one to four steps out.
 * Expected outcome: A real cell at that grid distance. Zero is the origin.
 * Exceptions: `gridRingUnsafe` throws next to a pentagon, which the origin is not.
 */
function stepsOut(steps: number): string {
  return steps === 0 ? ORIGIN : gridRingUnsafe(ORIGIN, steps)[0]!;
}

/**
 * One sub-unit position.
 *
 * Purpose: Keeps each case to the id, the owner, and the cell.
 * When to use: Building the before and after lists.
 * Expected outcome: A position row.
 * Exceptions: None.
 */
function at(id: string, player: TacticalSubUnitPosition['player'], steps: number): TacticalSubUnitPosition {
  return { id, player, h3Index: stepsOut(steps) };
}

/**
 * One die roll of a kind by a player.
 *
 * Purpose: The shot count reads only the kind and the player.
 * When to use: The shot count case.
 * Expected outcome: A roll anchored on the origin.
 * Exceptions: None.
 */
function roll(kind: CombatDiceRollKind, player: string | null): CombatDiceRoll {
  return { kind, player, unitType: 'armor', anchorH3Index: ORIGIN, face: 1, threshold: 1 };
}

/**
 * Whether any sub-unit moved closer between two position lists.
 *
 * Purpose: Every movement case uses the same two parties.
 * When to use: The movement cases.
 * Expected outcome: The answer from `anySubUnitMovedCloser`.
 * Exceptions: None.
 */
function movedCloser(before: readonly TacticalSubUnitPosition[], after: readonly TacticalSubUnitPosition[]): boolean {
  return anySubUnitMovedCloser({ before, after, leadPartyId: LEAD, opposingPartyId: OTHER });
}

test('attack shots are the ranged and air strike rolls of the named player', () => {
  const answers: CombatDiceRollKind[] = ['returnFire', 'antiAir', 'infrastructureCounterFire', 'meleeAttack', 'meleeDefense'];
  const rolls = [
    roll('ranged', LEAD),
    roll('airStrike', LEAD),
    roll('ranged', OTHER),
    ...answers.map((kind) => roll(kind, LEAD)),
    roll('infrastructureCounterFire', null),
  ];
  assert.equal(countAttackShots(rolls, LEAD), 2);
  assert.equal(countAttackShots(rolls, OTHER), 1);
});

test('nothing moved is not moving closer', () => {
  const units = [at('lead', LEAD, 3), at('other', OTHER, 0)];
  assert.equal(movedCloser(units, units), false);
});

test('one step toward the enemy is moving closer', () => {
  assert.equal(movedCloser([at('lead', LEAD, 3), at('other', OTHER, 0)], [at('lead', LEAD, 2), at('other', OTHER, 0)]), true);
});

test('a step away is not moving closer', () => {
  assert.equal(movedCloser([at('lead', LEAD, 2), at('other', OTHER, 0)], [at('lead', LEAD, 3), at('other', OTHER, 0)]), false);
});

test('a side that stands still does not count when the other side only withdraws', () => {
  assert.equal(movedCloser([at('lead', LEAD, 0), at('other', OTHER, 2)], [at('lead', LEAD, 0), at('other', OTHER, 4)]), false);
});

test('a rear sub-unit that advances counts while a nearer one holds still', () => {
  const screen = at('screen', LEAD, 1);
  assert.equal(
    movedCloser(
      [screen, at('rear', LEAD, 4), at('other', OTHER, 0)],
      [screen, at('rear', LEAD, 3), at('other', OTHER, 0)],
    ),
    true,
  );
});

test('a side with no sub-unit gives no distance to close', () => {
  assert.equal(movedCloser([at('lead', LEAD, 3)], [at('lead', LEAD, 2)]), false);
});

test('a sub-unit that is new after the beat is not tested', () => {
  assert.equal(movedCloser([at('other', OTHER, 0)], [at('new', LEAD, 1), at('other', OTHER, 0)]), false);
});

test('a beat is quiet only with no shot, no anti-air fire, no melee, and no sub-unit moving closer', () => {
  const still = { beatNumber: 1, leadShots: 0, opposingShots: 0, meleeFought: false };
  assert.equal(isQuietBeat({ activity: still, movedCloser: false, antiAirFired: false }), true);
  assert.equal(isQuietBeat({ activity: still, movedCloser: true, antiAirFired: false }), false);
  assert.equal(isQuietBeat({ activity: { ...still, leadShots: 1 }, movedCloser: false, antiAirFired: false }), false);
  assert.equal(isQuietBeat({ activity: { ...still, opposingShots: 1 }, movedCloser: false, antiAirFired: false }), false);
  assert.equal(isQuietBeat({ activity: { ...still, meleeFought: true }, movedCloser: false, antiAirFired: false }), false);
  assert.equal(isQuietBeat({ activity: still, movedCloser: false, antiAirFired: true }), false);
});
