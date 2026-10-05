/**
 * Contracts for the resolution-playback dice chip model.
 * Run: `node dist/shared/combatDiceChips.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMBAT_DICE_FADE_IN_MS,
  COMBAT_DICE_FADE_OUT_MS,
  buildCombatDiceChips,
  combatDiceChipOpacity,
  pickPlaybackDiceRolls,
} from './combatDiceChips';
import type { CombatDiceRoll } from './ipc/combatDiceTypes';

const HEX_A = '891f1d48b9fffff';
const HEX_B = '891f1d48b8fffff';

/**
 * Builds a recorded roll with sensible defaults.
 *
 * Purpose: Keeps each case focused on the fields it varies.
 * When to use: Inside this file's tests.
 * Expected outcome: A human armor `ranged` roll at `HEX_A` against 10 unless overridden.
 * Exceptions: None.
 */
function roll(overrides: Partial<CombatDiceRoll> = {}): CombatDiceRoll {
  return {
    kind: 'ranged',
    player: 'human',
    unitType: 'armor',
    anchorH3Index: HEX_A,
    face: 5,
    threshold: 10,
    ...overrides,
  };
}

describe('buildCombatDiceChips', () => {
  it('shows a single roll as one row with its face', () => {
    const [chip] = buildCombatDiceChips([roll({ face: 12 })]);
    assert.equal(chip?.anchorH3Index, HEX_A);
    assert.deepEqual(chip?.rows.map((r) => [r.tag, r.faces, r.hitCount, r.rollCount]), [['ATK', [12], 0, 1]]);
  });

  it('turns more than three same-group rolls into a tally row', () => {
    const faces = [1, 15, 3, 20, 9];
    const [chip] = buildCombatDiceChips(faces.map((face) => roll({ face })));
    assert.equal(chip?.rows.length, 1);
    assert.deepEqual(chip?.rows[0]?.faces, []);
    assert.equal(chip?.rows[0]?.rollCount, 5);
    assert.equal(chip?.rows[0]?.hitCount, 3);
  });

  it('splits rows by side and hit number and puts attack rows before defense rows', () => {
    const chips = buildCombatDiceChips([
      roll({ kind: 'meleeDefense', player: 'opponent', threshold: 7 }),
      roll({ kind: 'meleeAttack', threshold: 10 }),
      roll({ kind: 'meleeAttack', threshold: 12 }),
    ]);
    assert.equal(chips.length, 1);
    assert.deepEqual(
      chips[0]?.rows.map((r) => [r.tag, r.player, r.threshold]),
      [
        ['ATK', 'human', 12],
        ['ATK', 'human', 10],
        ['DEF', 'opponent', 7],
      ]
    );
  });

  it('makes one chip per anchor in first-roll order', () => {
    const chips = buildCombatDiceChips([roll({ anchorH3Index: HEX_B }), roll({ anchorH3Index: HEX_A })]);
    assert.deepEqual(
      chips.map((c) => c.anchorH3Index),
      [HEX_B, HEX_A]
    );
  });

  it('keeps three rows and counts the rest when a chip has too many rows', () => {
    const rolls = [2, 4, 6, 8, 10, 12].map((threshold) => roll({ threshold }));
    const [chip] = buildCombatDiceChips(rolls);
    assert.equal(chip?.rows.length, 3);
    assert.equal(chip?.hiddenRowCount, 3);
  });
});

describe('combatDiceChipOpacity', () => {
  it('is hidden outside the window, opaque mid-window, and ramps at both edges', () => {
    const start = 1000;
    const end = 3000;
    assert.equal(combatDiceChipOpacity(start - 1, start, end), 0);
    assert.equal(combatDiceChipOpacity(end, start, end), 0);
    assert.equal(combatDiceChipOpacity(2000, start, end), 1);
    assert.equal(combatDiceChipOpacity(start + COMBAT_DICE_FADE_IN_MS / 2, start, end), 0.5);
    assert.equal(combatDiceChipOpacity(end - COMBAT_DICE_FADE_OUT_MS / 2, start, end), 0.5);
    assert.equal(combatDiceChipOpacity(start, start, start), 0, 'an empty window shows nothing');
  });
});

describe('pickPlaybackDiceRolls', () => {
  it('drops rolls on hidden or unknown hexes and omits phases left empty', () => {
    const visible = roll({ anchorH3Index: HEX_A });
    const out = pickPlaybackDiceRolls(
      {
        rangedDiceRolls: [visible, roll({ anchorH3Index: HEX_B })],
        meleeDiceRolls: [roll({ kind: 'meleeAttack', anchorH3Index: HEX_A })],
      },
      { visibleHexesBeforeTurn: new Set(), visibleHexesAfterTurn: new Set([HEX_A, HEX_B]), unknownHexes: new Set([HEX_B]) }
    );
    assert.deepEqual(out.rangedDiceRolls, [visible]);
    assert.equal(out.meleeDiceRolls?.length, 1);
    assert.ok(!('airStrikeDiceRolls' in out));

    const hidden = pickPlaybackDiceRolls(
      { rangedDiceRolls: [roll({ anchorH3Index: HEX_B })] },
      { visibleHexesBeforeTurn: new Set([HEX_A]), visibleHexesAfterTurn: new Set([HEX_A]), unknownHexes: new Set() }
    );
    assert.deepEqual(hidden, {});
  });

  it('keeps rolls on a hex that was visible before the turn but left vision after it', () => {
    const lostDefense = roll({ kind: 'antiAir', anchorH3Index: HEX_B });
    const out = pickPlaybackDiceRolls(
      { airStrikeDiceRolls: [lostDefense] },
      { visibleHexesBeforeTurn: new Set([HEX_B]), visibleHexesAfterTurn: new Set([HEX_A]), unknownHexes: new Set() }
    );
    assert.deepEqual(out.airStrikeDiceRolls, [lostDefense]);
  });
});
