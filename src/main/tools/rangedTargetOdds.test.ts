/**
 * Odds for a legal ranged target.
 *
 * Purpose: The tooltip's Kill, Hurt, and Loss match `executeEstimateCombat`, and a rejected defender
 * does not fail the shot or invent occupants.
 * When to use: After changing `previewRangedTargetOdds`.
 * Expected outcome: Rounded percents on a real shot, null when no defender can be counted, and
 * null when the estimator throws.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import { buildLatLngCoordinateMap } from '../mapData';
import { buildTacticalAiPlanState } from '../tacticalBattle/buildTacticalAiPlanState';
import { buildTacticalToolFixture } from '../tacticalBattle/testSupport/tacticalToolFixtures';
import { executeEstimateCombat } from './combatEstimation';
import { previewRangedTargetOdds, type PreviewRangedTargetOddsInput } from './rangedTargetOdds';

const ATTACKER_HEX = latLngToCell(0, 0, 1);

/**
 * A planning snapshot with two land hexes and the given units.
 *
 * Purpose: Strategic odds tests need a target the estimator can resolve.
 * When to use: Strategic cases in this file.
 * Expected outcome: Both hexes are plains. `playerPerspective` is omitted.
 * Exceptions: None.
 */
function strategicState(units: GameStateSnapshot['units'], targetHex: string): GameStateSnapshot {
  return {
    hexes: [
      { h3Index: ATTACKER_HEX, terrain: 'land', terrainKind: 'plains' },
      { h3Index: targetHex, terrain: 'land', terrainKind: 'plains' },
    ],
    units,
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
}

/**
 * Shared fields for a call that replaces the estimator.
 *
 * Purpose: Rejection tests only need a target coordinate and a snapshot the theater can read.
 * When to use: Cases that inject `estimate`.
 * Expected outcome: `targetH3` is present in the coordinate map.
 * Exceptions: None.
 */
function injectedCall(
  state: GameStateSnapshot,
  defenderIds: readonly string[],
  estimate: PreviewRangedTargetOddsInput['estimate'],
): PreviewRangedTargetOddsInput {
  const targetH3 = state.hexes[0]!.h3Index;
  return {
    attackerIds: ['armor-1'],
    defenderIds,
    targetH3,
    state,
    latLngByH3: new Map([[targetH3, [1, 2]]]),
    resolveToH3: () => targetH3,
    estimate,
  };
}

describe('previewRangedTargetOdds', () => {
  it('matches a direct strategic estimate and counts the infantry', () => {
    const targetHex = gridDisk(ATTACKER_HEX, 1).find((hex) => hex !== ATTACKER_HEX)!;
    const state = strategicState(
      [
        { id: 'armor-1', player: 'human', unitType: 'armor', h3Index: ATTACKER_HEX },
        { id: 'inf-1', player: 'opponent', unitType: 'infantry', h3Index: targetHex },
      ],
      targetHex,
    );
    assert.equal('playerPerspective' in state, false);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap([ATTACKER_HEX, targetHex]);
    const target = latLngByH3.get(targetHex)!;
    const direct = executeEstimateCombat(
      {
        engagementType: 'ranged',
        attackers: { units: ['armor-1'] },
        defenders: { units: ['inf-1'] },
        targetHex: [target[0], target[1]],
      },
      state,
      latLngByH3,
      resolveToH3,
    );
    const prediction = direct.prediction as {
      probabilityDefenderEliminated: number;
      probabilityAtLeastOneHit: number;
      probabilityAttackerLosesUnit: number;
    };
    const preview = previewRangedTargetOdds({
      attackerIds: ['armor-1'],
      defenderIds: ['inf-1'],
      targetH3: targetHex,
      state,
      latLngByH3,
      resolveToH3,
    });
    assert.equal(direct.status, 'ok');
    assert.ok(preview);
    assert.equal(preview.killPercent, Math.round(prediction.probabilityDefenderEliminated * 100));
    assert.equal(preview.hurtPercent, Math.round(prediction.probabilityAtLeastOneHit * 100));
    assert.equal(preview.lossPercent, Math.round(prediction.probabilityAttackerLosesUnit * 100));
    assert.deepEqual(preview.countedDefenderIds, ['inf-1']);
  });

  it('estimates a battle shot from the tactical plan state', () => {
    const fixture = buildTacticalToolFixture({
      battleId: 'ranged-odds',
      units: [
        { id: 'hum-arm', player: 'human', unitType: 'armor', cell: 'near' },
        { id: 'opp-inf', player: 'opponent', unitType: 'infantry', cell: 'far' },
      ],
    });
    const planState = buildTacticalAiPlanState(fixture.planState, fixture.battle);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(planState.hexes.map((hex) => hex.h3Index));
    const target = latLngByH3.get(fixture.cells.far)!;
    const direct = executeEstimateCombat(
      {
        engagementType: 'ranged',
        attackers: { units: ['hum-arm'] },
        defenders: { units: ['opp-inf'] },
        targetHex: [target[0], target[1]],
      },
      planState,
      latLngByH3,
      resolveToH3,
      fixture.battle,
    );
    const preview = previewRangedTargetOdds({
      attackerIds: ['hum-arm'],
      defenderIds: ['opp-inf'],
      targetH3: fixture.cells.far,
      state: planState,
      latLngByH3,
      resolveToH3,
      tacticalBattle: fixture.battle,
    });
    assert.equal(direct.status, 'ok');
    assert.ok(preview);
    assert.equal(typeof preview.killPercent, 'number');
    assert.equal(typeof preview.lossPercent, 'number');
    assert.deepEqual(preview.countedDefenderIds, ['opp-inf']);
  });

  it('does not estimate when no defender id remains', () => {
    let calls = 0;
    const state = strategicState([], ATTACKER_HEX);
    const preview = previewRangedTargetOdds(
      injectedCall(state, [], () => {
        calls += 1;
        return { status: 'ok', error: null };
      }),
    );
    assert.equal(preview, null);
    assert.equal(calls, 0);
  });

  it('drops embarked cargo and estimates only a real defender', () => {
    const water = 'water-hex';
    const land = 'land-hex';
    const cargo = {
      id: 'cargo',
      player: 'opponent',
      unitType: 'infantry' as const,
      h3Index: water,
      embarkedOnCarrierUnitId: 'ship',
    };
    const infantry = { id: 'inf-1', player: 'opponent', unitType: 'infantry' as const, h3Index: land };
    const base = {
      phase: 'planning' as const,
      turnNumber: 1,
      pendingOrders: [],
    };
    let cargoCalls = 0;
    const cargoOnly = previewRangedTargetOdds(
      injectedCall(
        { ...base, hexes: [{ h3Index: water, terrain: 'water', terrainKind: 'sea' }], units: [cargo] },
        ['cargo'],
        () => {
          cargoCalls += 1;
          return { status: 'ok', error: null };
        },
      ),
    );
    assert.equal(cargoOnly, null);
    assert.equal(cargoCalls, 0);

    let seenDefenders: readonly string[] | undefined;
    const paired = previewRangedTargetOdds({
      ...injectedCall(
        {
          ...base,
          hexes: [
            { h3Index: land, terrain: 'land', terrainKind: 'plains' },
            { h3Index: water, terrain: 'water', terrainKind: 'sea' },
          ],
          units: [cargo, infantry],
        },
        ['cargo', 'inf-1'],
        (args) => {
          seenDefenders = (args as { defenders?: { units?: string[] } }).defenders?.units;
          return {
            status: 'ok',
            error: null,
            prediction: {
              assessment: 'favorable',
              probabilityDefenderEliminated: 0.5,
              probabilityAtLeastOneHit: 0.8,
              probabilityAttackerLosesUnit: 0.25,
            },
          };
        },
      ),
      targetH3: land,
      latLngByH3: new Map([[land, [1, 2]]]),
      resolveToH3: () => land,
    });
    assert.deepEqual(seenDefenders, ['inf-1']);
    assert.deepEqual(paired, { killPercent: 50, hurtPercent: 80, lossPercent: 25, countedDefenderIds: ['inf-1'] });
  });

  it('clears all three percents when Hurt is not finite', () => {
    const state = strategicState(
      [{ id: 'inf-1', player: 'opponent', unitType: 'infantry', h3Index: ATTACKER_HEX }],
      ATTACKER_HEX,
    );
    const preview = previewRangedTargetOdds(
      injectedCall(state, ['inf-1'], () => ({
        status: 'ok',
        error: null,
        prediction: {
          assessment: 'even',
          probabilityDefenderEliminated: 0.5,
          probabilityAtLeastOneHit: Number.NaN,
          probabilityAttackerLosesUnit: 0.25,
        },
      })),
    );
    assert.deepEqual(preview, {
      killPercent: null,
      hurtPercent: null,
      lossPercent: null,
      countedDefenderIds: ['inf-1'],
    });
  });

  it('returns null when the estimate throws', () => {
    const state = strategicState(
      [{ id: 'inf-1', player: 'opponent', unitType: 'infantry', h3Index: ATTACKER_HEX }],
      ATTACKER_HEX,
    );
    const preview = previewRangedTargetOdds(
      injectedCall(state, ['inf-1'], () => {
        throw new Error('estimate failed');
      }),
    );
    assert.equal(preview, null);
  });
});
