/**
 * Fallback neighbour lines for cargo that cannot leave its carrier.
 *
 * Purpose: The no-tools list assumes embarked cargo has already debarked, which offers a step a ship cannot unload.
 * When to use: After changes to `buildAdjacentCellsFallbackBlock`.
 * Expected outcome: Naval cargo on inland land lists no neighbour. The same cargo on a coastal hex, and infantry aboard an air unit, still list a step.
 * Exceptions: Throws if no geodesic land chain exists.
 */

import * as assert from 'assert';
import { cellToLatLng } from 'h3-js';
import { getValidDestinationsUnoccupied } from '../oneStepMoveDestinations';
import { buildLandChainState, findGeodesicLandMassChain } from '../testSupport/strategicLandChainFixtures';
import { buildAdjacentCellsFallbackBlock } from './promptText';
import type { GameStateSnapshot } from '../gameDb';

/**
 * Renders the fallback block for one infantry unit and its carrier.
 *
 * Purpose: Keeps the three terrain and carrier cases on one coordinate map.
 * When to use: Each assertion in this file.
 * Expected outcome: The block text for that pair.
 * Exceptions: None.
 */
function fallbackFor(state: GameStateSnapshot, unitId: string): string {
  const latLngByH3 = new Map(state.hexes.map((hex) => [hex.h3Index, cellToLatLng(hex.h3Index) as [number, number]]));
  const unit = state.units.find((row) => row.id === unitId);
  assert.ok(unit, 'expected the infantry unit');
  return buildAdjacentCellsFallbackBlock(
    state,
    [{ id: unit.id, h3Index: unit.h3Index, unitType: unit.unitType }],
    { latLngByH3, format: (h3) => h3 },
    getValidDestinationsUnoccupied
  );
}

/**
 * Runs the naval and air cases.
 *
 * Purpose: Direct node invocation of this file.
 * When to use: `node dist/main/openRouter/promptTextEmbarked.test.js`.
 * Expected outcome: Process exit 0 when the neighbour lines match the debark rule.
 * Exceptions: None beyond the assertions.
 */
function run(): void {
  const chain = findGeodesicLandMassChain(2);
  const origin = chain[0]!;
  const infantryId = 'opponent-inf-idle';
  const base = buildLandChainState({
    chain,
    units: [
      {
        id: infantryId,
        player: 'opponent',
        unitType: 'infantry',
        h3Index: origin,
        embarkedOnCarrierUnitId: 'carrier-1',
      },
      { id: 'carrier-1', player: 'opponent', unitType: 'naval', h3Index: origin },
    ],
  });
  assert.equal(fallbackFor(base, infantryId).includes('move to:'), false, 'naval cargo on inland land must not list a step');

  const coastal: GameStateSnapshot = {
    ...base,
    hexes: base.hexes.map((hex) => (hex.h3Index === origin ? { ...hex, terrain: 'coastal', terrainKind: 'coastal' } : hex)),
  };
  assert.equal(fallbackFor(coastal, infantryId).includes('move to:'), true, 'naval cargo on a coastal hex may list a step');

  const airborne: GameStateSnapshot = {
    ...base,
    units: base.units.map((unit) => (unit.id === 'carrier-1' ? { ...unit, unitType: 'air' } : unit)),
  };
  assert.equal(fallbackFor(airborne, infantryId).includes('move to:'), true, 'infantry aboard an air unit may list a step');
  console.log('promptText embarked tests passed');
}

run();
