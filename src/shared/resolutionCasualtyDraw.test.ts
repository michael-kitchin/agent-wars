/**
 * Contracts for which removed units stay on screen during resolution playback.
 * Run: `node dist/shared/resolutionCasualtyDraw.test.js` after `npm run build:main`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  marchPlayedForUnit,
  resolutionCasualtyTiming,
  unitIconVisibleAtCasualtyTiming,
  unitsDrawnAtCasualtyTiming,
  type ResolutionCasualtyDrawInput,
  type ResolutionCasualtyTiming,
} from './resolutionCasualtyDraw';

const emptyInput: ResolutionCasualtyDrawInput = {
  airRemovedUnits: [],
  rangedRemovedUnits: [],
  meleeRemovedUnits: [],
};

/**
 * Builds removal lists with one optional row in each stage.
 *
 * Purpose: Visibility and march tests name ids instead of repeating snapshot fields.
 * When to use: Inside this file.
 * Expected outcome: Each listed id is an infantry row on `hex`, or the list is empty.
 * Exceptions: None.
 */
function inputWith(rows: {
  air?: string;
  ranged?: string;
  melee?: string;
  hex?: string;
}): ResolutionCasualtyDrawInput {
  const hex = rows.hex ?? 'hex-a';
  const row = (id: string | undefined) =>
    id === undefined ? [] : [{ id, player: 'human', unitType: 'infantry', h3Index: hex }];
  return {
    airRemovedUnits: row(rows.air),
    rangedRemovedUnits: row(rows.ranged),
    meleeRemovedUnits: row(rows.melee),
  };
}

const timings: ResolutionCasualtyTiming[] = [
  'throughAirCasualties',
  'airReturn',
  'throughRangedCasualties',
  'movement',
  'throughMeleeCasualties',
  'afterCasualties',
];

describe('resolutionCasualtyTiming', () => {
  it('maps each playback flag in timeline order and treats a quiet clock as finished', () => {
    const flags = {
      inAirStrikeOutbound: false,
      inAirStrikeLightning: false,
      inAirStrikeCasualty: false,
      inAirStrikeReturn: false,
      inRangedLightning: false,
      inRangedCasualty: false,
      inMovement: false,
      inMeleeLightning: false,
      inMeleeCasualty: false,
    };
    assert.equal(resolutionCasualtyTiming(flags), 'afterCasualties');
    assert.equal(resolutionCasualtyTiming({ ...flags, inAirStrikeOutbound: true, inMovement: true }), 'throughAirCasualties');
    assert.equal(resolutionCasualtyTiming({ ...flags, inAirStrikeLightning: true }), 'throughAirCasualties');
    assert.equal(resolutionCasualtyTiming({ ...flags, inAirStrikeCasualty: true }), 'throughAirCasualties');
    assert.equal(resolutionCasualtyTiming({ ...flags, inAirStrikeReturn: true }), 'airReturn');
    assert.equal(resolutionCasualtyTiming({ ...flags, inRangedLightning: true }), 'throughRangedCasualties');
    assert.equal(resolutionCasualtyTiming({ ...flags, inRangedCasualty: true }), 'throughRangedCasualties');
    assert.equal(resolutionCasualtyTiming({ ...flags, inMovement: true }), 'movement');
    assert.equal(resolutionCasualtyTiming({ ...flags, inMeleeLightning: true }), 'throughMeleeCasualties');
    assert.equal(resolutionCasualtyTiming({ ...flags, inMeleeCasualty: true }), 'throughMeleeCasualties');
  });
});

describe('unitIconVisibleAtCasualtyTiming', () => {
  it('hides an air-strike victim after the air casualty mark, even when the ranged list repeats that id', () => {
    const input = inputWith({ air: 'air-victim', ranged: 'air-victim' });
    const visible = timings.filter((timing) => unitIconVisibleAtCasualtyTiming('air-victim', timing, input));
    assert.deepEqual(visible, ['throughAirCasualties']);
  });

  it('keeps a ranged victim through the ranged casualty mark and hides it from movement on', () => {
    const input = inputWith({ ranged: 'ranged-victim' });
    const visible = timings.filter((timing) => unitIconVisibleAtCasualtyTiming('ranged-victim', timing, input));
    assert.deepEqual(visible, ['throughAirCasualties', 'airReturn', 'throughRangedCasualties']);
  });

  it('keeps a melee-only victim until the melee casualty mark ends', () => {
    const input = inputWith({ melee: 'melee-victim' });
    const visible = timings.filter((timing) => unitIconVisibleAtCasualtyTiming('melee-victim', timing, input));
    assert.deepEqual(
      visible,
      ['throughAirCasualties', 'airReturn', 'throughRangedCasualties', 'movement', 'throughMeleeCasualties']
    );
  });

  it('keeps a survivor after every casualty mark', () => {
    assert.equal(unitIconVisibleAtCasualtyTiming('survivor', 'afterCasualties', emptyInput), true);
  });
});

describe('marchPlayedForUnit', () => {
  const move = { unitId: 'unit', fromH3Index: 'origin', toH3Index: 'destination' };

  it('plays a survivor march and a melee march that ends on the removal hex', () => {
    assert.equal(marchPlayedForUnit(move, emptyInput), true);
    assert.equal(
      marchPlayedForUnit(move, {
        ...emptyInput,
        meleeRemovedUnits: [{ id: 'unit', player: 'human', unitType: 'armor', h3Index: 'destination' }],
      }),
      true
    );
  });

  it('does not play a march for an earlier removal, a source-hex melee death, or a removal hex off the march', () => {
    assert.equal(marchPlayedForUnit(move, inputWith({ air: 'unit' })), false);
    assert.equal(marchPlayedForUnit(move, inputWith({ ranged: 'unit' })), false);
    assert.equal(
      marchPlayedForUnit(move, {
        airRemovedUnits: [],
        rangedRemovedUnits: [],
        meleeRemovedUnits: [{ id: 'unit', player: 'opponent', unitType: 'naval', h3Index: 'origin' }],
      }),
      false
    );
    assert.equal(
      marchPlayedForUnit(move, {
        airRemovedUnits: [{ id: 'unit', player: 'human', unitType: 'air', h3Index: 'origin' }],
        rangedRemovedUnits: [],
        meleeRemovedUnits: [{ id: 'unit', player: 'human', unitType: 'air', h3Index: 'destination' }],
      }),
      false
    );
    assert.equal(
      marchPlayedForUnit(move, {
        ...emptyInput,
        meleeRemovedUnits: [{ id: 'unit', player: 'human', unitType: 'infantry', h3Index: 'elsewhere' }],
      }),
      false
    );
  });
});

describe('unitsDrawnAtCasualtyTiming', () => {
  it('adds a ranged victim during the air stages and drops that victim once movement starts', () => {
    const input = inputWith({ ranged: 'ranged-victim', hex: 'ranged-hex' });
    const duringAir = unitsDrawnAtCasualtyTiming({
      units: [],
      timing: 'throughAirCasualties',
      input,
      moves: [],
      hiddenHexes: [],
    });
    assert.deepEqual(duringAir, [{ id: 'ranged-victim', player: 'human', unitType: 'infantry', h3Index: 'ranged-hex' }]);
    const duringMovement = unitsDrawnAtCasualtyTiming({
      units: [],
      timing: 'movement',
      input,
      moves: [],
      hiddenHexes: [],
    });
    assert.deepEqual(duringMovement, []);
  });

  it('draws an id listed as both an air and a ranged removal only through the air casualty mark', () => {
    const input: ResolutionCasualtyDrawInput = {
      airRemovedUnits: [{ id: 'both', player: 'opponent', unitType: 'air', h3Index: 'air-hex' }],
      rangedRemovedUnits: [{ id: 'both', player: 'human', unitType: 'infantry', h3Index: 'ranged-hex' }],
      meleeRemovedUnits: [],
    };
    const duringAir = unitsDrawnAtCasualtyTiming({
      units: [],
      timing: 'throughAirCasualties',
      input,
      moves: [],
      hiddenHexes: [],
    });
    assert.deepEqual(duringAir, [{ id: 'both', player: 'opponent', unitType: 'air', h3Index: 'air-hex' }]);
    const duringRanged = unitsDrawnAtCasualtyTiming({
      units: [{ id: 'both', player: 'human', unitType: 'infantry', h3Index: 'stale' }],
      timing: 'throughRangedCasualties',
      input,
      moves: [],
      hiddenHexes: [],
    });
    assert.deepEqual(duringRanged, []);
  });

  it('keeps a melee arrival at its origin until melee casualties, then draws it once on the removal hex', () => {
    const input: ResolutionCasualtyDrawInput = {
      airRemovedUnits: [],
      rangedRemovedUnits: [],
      meleeRemovedUnits: [{ id: 'arrival', player: 'opponent', unitType: 'armor', h3Index: 'destination' }],
    };
    const moves = [{ unitId: 'arrival', fromH3Index: 'origin', toH3Index: 'destination' }];
    const units = [
      { id: 'survivor', player: 'human', unitType: 'infantry', h3Index: 'home' },
      { id: 'arrival', player: 'human', unitType: 'infantry', h3Index: 'origin' },
      { id: 'arrival', player: 'human', unitType: 'infantry', h3Index: 'destination' },
    ];
    const duringMovement = unitsDrawnAtCasualtyTiming({
      units,
      timing: 'movement',
      input,
      moves,
      hiddenHexes: [],
    });
    assert.deepEqual(duringMovement, [
      { id: 'survivor', player: 'human', unitType: 'infantry', h3Index: 'home' },
      { id: 'arrival', player: 'opponent', unitType: 'armor', h3Index: 'origin' },
    ]);
    const duringMelee = unitsDrawnAtCasualtyTiming({
      units,
      timing: 'throughMeleeCasualties',
      input,
      moves,
      hiddenHexes: [],
    });
    assert.deepEqual(duringMelee, [
      { id: 'survivor', player: 'human', unitType: 'infantry', h3Index: 'home' },
      { id: 'arrival', player: 'opponent', unitType: 'armor', h3Index: 'destination' },
    ]);
  });

  it('leaves a melee source death on its snapshot hex during movement', () => {
    const drawn = unitsDrawnAtCasualtyTiming({
      units: [{ id: 'stayed', player: 'human', unitType: 'naval', h3Index: 'origin' }],
      timing: 'movement',
      input: {
        airRemovedUnits: [],
        rangedRemovedUnits: [],
        meleeRemovedUnits: [{ id: 'stayed', player: 'human', unitType: 'naval', h3Index: 'origin' }],
      },
      moves: [{ unitId: 'stayed', fromH3Index: 'origin', toH3Index: 'destination' }],
      hiddenHexes: [],
    });
    assert.deepEqual(drawn, [{ id: 'stayed', player: 'human', unitType: 'naval', h3Index: 'origin' }]);
  });

  it('omits a removed icon on a hidden hex and keeps a survivor there', () => {
    const drawn = unitsDrawnAtCasualtyTiming({
      units: [
        { id: 'survivor', player: 'human', unitType: 'infantry', h3Index: 'hidden-hex' },
        { id: 'hidden-victim', player: 'opponent', unitType: 'armor', h3Index: 'hidden-hex' },
      ],
      timing: 'throughRangedCasualties',
      input: inputWith({ ranged: 'hidden-victim', hex: 'hidden-hex' }),
      moves: [],
      hiddenHexes: ['hidden-hex'],
    });
    assert.deepEqual(drawn, [{ id: 'survivor', player: 'human', unitType: 'infantry', h3Index: 'hidden-hex' }]);
  });
});
