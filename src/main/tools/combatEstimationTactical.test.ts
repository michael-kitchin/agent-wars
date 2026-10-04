import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng } from 'h3-js';
import {
  buildTacticalToolFixture,
  type TacticalToolFixture,
  type TacticalToolFixtureOptions,
} from '../tacticalBattle/testSupport/tacticalToolFixtures';
import { executeEstimateCombat } from './combatEstimation';

type EstimateResult = {
  status: string;
  error: string | null;
  defenderSummary?: { totalUnits: number; canReturnFire: boolean };
  prediction?: { probabilityDefenderEliminated: number; probabilityAttackerLosesUnit: number };
  warnings?: string[];
};

/** Tolerance for comparing exact dice fractions against floating-point predictions. */
const EPS = 1e-12;

/**
 * Runs `estimate_combat` against a fixture battle.
 *
 * Purpose: Keeps each test focused on units, terrain, and expectations.
 * When to use: Every test in this file; pass `inBattle: false` to apply strategic rules to the same snapshot.
 * Expected outcome: The raw estimator result.
 * Exceptions: None.
 */
function estimate(fx: TacticalToolFixture, args: Record<string, unknown>, inBattle = true): EstimateResult {
  return executeEstimateCombat(
    args,
    fx.planState,
    fx.latLngByH3,
    fx.resolveToH3,
    inBattle ? fx.battle : undefined
  ) as EstimateResult;
}

/**
 * Builds a fixture and the target hex argument for one of its cells.
 *
 * Purpose: Shared setup for the tests below.
 * When to use: Every test in this file.
 * Expected outcome: Fixture plus a lat/lng target helper.
 * Exceptions: None.
 */
function setup(options: TacticalToolFixtureOptions): { fx: TacticalToolFixture; at: (cell: 'near' | 'mid' | 'far') => number[] } {
  const fx = buildTacticalToolFixture(options);
  return { fx, at: (cell) => cellToLatLng(fx.cells[cell]) };
}

test('battle ranged: infantry fires two cells on plains and armor returns fire', () => {
  const { fx, at } = setup({
    battleId: 'estimate-ranged-plains',
    units: [
      { id: 'opp-inf', player: 'opponent', unitType: 'infantry', cell: 'near' },
      { id: 'hum-arm', player: 'human', unitType: 'armor', cell: 'far' },
    ],
  });
  const args = { engagementType: 'ranged', attackers: { units: ['opp-inf'] }, targetHex: at('far') };
  const result = estimate(fx, args);
  assert.equal(result.status, 'ok');
  assert.ok(Math.abs(result.prediction!.probabilityDefenderEliminated - 3 / 20) < EPS);
  assert.ok(Math.abs(result.prediction!.probabilityAttackerLosesUnit - 1 / 2) < EPS);
  assert.equal(result.defenderSummary!.canReturnFire, true);
  assert.equal(estimate(fx, args, false).status, 'error');
});

test('battle ranged: forest cover at the target lowers the shot to the floor and the forest caps armor return fire', () => {
  const { fx, at } = setup({
    battleId: 'estimate-ranged-cover',
    terrainByCell: { far: 'forest' },
    units: [
      { id: 'opp-inf', player: 'opponent', unitType: 'infantry', cell: 'near' },
      { id: 'hum-arm', player: 'human', unitType: 'armor', cell: 'far' },
    ],
  });
  const result = estimate(fx, { engagementType: 'ranged', attackers: { units: ['opp-inf'] }, targetHex: at('far') });
  assert.equal(result.status, 'ok');
  assert.ok(Math.abs(result.prediction!.probabilityDefenderEliminated - 1 / 10) < EPS);
  assert.equal(result.defenderSummary!.canReturnFire, false);
  assert.equal(result.prediction!.probabilityAttackerLosesUnit, 0);
});

test('battle ranged: infantry in forest is capped to range one', () => {
  const { fx, at } = setup({
    battleId: 'estimate-ranged-forest',
    terrainByCell: { near: 'forest' },
    units: [
      { id: 'opp-inf', player: 'opponent', unitType: 'infantry', cell: 'near' },
      { id: 'hum-arm', player: 'human', unitType: 'armor', cell: 'far' },
    ],
  });
  const result = estimate(fx, { engagementType: 'ranged', attackers: { units: ['opp-inf'] }, targetHex: at('far') });
  assert.equal(result.status, 'error');
  assert.match(result.error!, /battle range 1/);
});

test('battle: air attackers are rejected, real or assumed', () => {
  const { fx, at } = setup({
    battleId: 'estimate-air',
    units: [
      { id: 'opp-air', player: 'opponent', unitType: 'air', cell: 'near' },
      { id: 'hum-arm', player: 'human', unitType: 'armor', cell: 'far' },
    ],
  });
  const real = estimate(fx, { engagementType: 'ranged', attackers: { units: ['opp-air'] }, targetHex: at('far') });
  const assumed = estimate(fx, {
    engagementType: 'ranged',
    attackers: { assumed: [{ type: 'air', count: 1 }] },
    targetHex: at('far'),
  });
  assert.equal(real.status, 'error');
  assert.match(real.error!, /air strikes/);
  assert.equal(assumed.status, 'error');
});

test('battle melee: prediction averages both random role cases', () => {
  const { fx, at } = setup({
    battleId: 'estimate-melee',
    units: [
      { id: 'opp-arm', player: 'opponent', unitType: 'armor', cell: 'near' },
      { id: 'hum-inf', player: 'human', unitType: 'infantry', cell: 'far' },
    ],
  });
  const result = estimate(fx, { engagementType: 'melee', attackers: { units: ['opp-arm'] }, targetHex: at('far') });
  assert.equal(result.status, 'ok');
  assert.ok(Math.abs(result.prediction!.probabilityDefenderEliminated - 17 / 40) < EPS);
  assert.ok(Math.abs(result.prediction!.probabilityAttackerLosesUnit - 1 / 4) < EPS);
});

test('battle ranged: cargo embarked at sea is not a ranged defender', () => {
  const { fx, at } = setup({
    battleId: 'estimate-embarked',
    terrainByCell: { mid: 'water' },
    units: [
      { id: 'opp-arm', player: 'opponent', unitType: 'armor', cell: 'near' },
      { id: 'hum-nav', player: 'human', unitType: 'naval', cell: 'mid' },
      { id: 'hum-inf', player: 'human', unitType: 'infantry', cell: 'mid', embarkedOnSubUnitId: 'hum-nav' },
    ],
  });
  const result = estimate(fx, { engagementType: 'ranged', attackers: { units: ['opp-arm'] }, targetHex: at('mid') });
  assert.equal(result.status, 'ok');
  assert.equal(result.defenderSummary!.totalUnits, 1);
  assert.ok(result.warnings?.some((w) => w.includes('hum-inf')));
});

test('battle: a defender on its birth terrain shows the terrain bonus', () => {
  const { fx, at } = setup({
    battleId: 'estimate-terrain-bonus',
    terrainByCell: { far: 'forest' },
    originBonusSettings: { countryBonusEnabled: false, terrainBonusEnabled: true },
    units: [
      { id: 'opp-arm', player: 'opponent', unitType: 'armor', cell: 'near' },
      {
        id: 'hum-inf',
        player: 'human',
        unitType: 'infantry',
        cell: 'far',
        origin: {
          birthH3Index: 'unused',
          birthRes4H3Index: null,
          birthTerrainKind: 'forests',
          birthIsUrban: false,
          birthCountryName: null,
          birthCountryCode: null,
        },
      },
    ],
  });
  const result = estimate(fx, { engagementType: 'melee', attackers: { units: ['opp-arm'] }, targetHex: at('far') }) as EstimateResult & {
    defenderSummary?: { units: { unitId: string; defenseValue: number; originBonus?: number }[] };
  };
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.defenderSummary!.units, [{ unitId: 'hum-inf', type: 'infantry', defenseValue: 9, originBonus: 2 }]);
});
