import assert from 'node:assert/strict';
import { gridDisk, latLngToCell } from 'h3-js';
import {
  buildTacticalFerryHoverPreview,
  buildTacticalMixedAirNonAirHoverEnvelope,
} from '../shared/tacticalFerryHoverPreview';
import type { TacticalBattleSnapshot } from '../shared/tacticalBattleTypes';

const origin = latLngToCell(40, -100, 4);
const ringCells = [...gridDisk(origin, 1)];
const destination = ringCells.find((h) => h !== origin);
assert.ok(destination);

const airOnlyBattle: TacticalBattleSnapshot = {
  battleId: 'test-battle',
  enclosingStrategicH3Index: origin,
  tacticalChildH3Indexes: [origin, destination],
  strategicTurnNumber: 1,
  tacticalTurnNumber: 1,
  subUnits: [
    {
      id: 'human-air-1',
      parentUnitId: 'human-air-1',
      player: 'human',
      unitType: 'air',
      h3Index: origin,
      displayName: 'Air A',
    },
  ],
};

const validFerry = buildTacticalFerryHoverPreview(airOnlyBattle, ['human-air-1'], destination, { success: true });
assert.equal(validFerry.validForAll, true);
assert.equal(validFerry.previews.length, 1);
assert.equal(validFerry.previews[0]?.preview.segments.length, 1);
assert.equal(validFerry.previews[0]?.preview.segments[0]?.hexes.length, 2);

const invalidFerry = buildTacticalFerryHoverPreview(airOnlyBattle, ['human-air-1'], destination, {
  success: false,
  reason: 'Outside tactical footprint',
});
assert.equal(invalidFerry.validForAll, false);
assert.equal(invalidFerry.showInvalidMarker, true);

const mixed = buildTacticalMixedAirNonAirHoverEnvelope(['human-air-1', 'human-infantry-1']);
assert.equal(mixed.validForAll, false);
assert.ok(mixed.invalidReason?.includes('mixed air and non-air'));

console.log('tacticalFerryHoverPreview.test.ts passed');
