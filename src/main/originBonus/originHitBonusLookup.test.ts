import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OriginBonusSettings } from '../../shared/originBonusTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import {
  createStrategicOriginHitBonusLookup,
  createTacticalOriginHitBonusLookup,
  withOriginHitBonus,
} from './originHitBonusLookup';

/** A coastal-born French unit. */
const FRENCH_COASTAL: UnitOrigin = {
  birthH3Index: '81fb3ffffffffff',
  birthRes4H3Index: null,
  birthTerrainKind: 'coastal',
  birthCountryName: 'France',
  birthCountryCode: 'FR',
  birthIsUrban: false,
};

/** Country bonus on, terrain bonus off. */
const COUNTRY_ONLY: OriginBonusSettings = { countryBonusEnabled: true, terrainBonusEnabled: false };

/** Terrain bonus on, country bonus off. */
const TERRAIN_ONLY: OriginBonusSettings = { countryBonusEnabled: false, terrainBonusEnabled: true };

/**
 * Builds a one-unit battle on a coastal cell with no country data.
 *
 * Purpose: The tactical lookup only reads sub-unit origins and cell terrain.
 * When to use: In the tactical cases below.
 * Expected outcome: A battle whose cell `cell-a` is coastal.
 * Exceptions: None.
 */
function coastalBattle(): TacticalBattleSnapshot {
  return {
    battleId: 'origin-lookup-test',
    enclosingRes1H3Index: 'hex-a',
    res4ChildH3Indexes: ['cell-a'],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { 'cell-a': 'coastal' },
    subUnits: [
      {
        id: 'sub-1',
        parentUnitId: 'u1',
        player: 'human',
        unitType: 'naval',
        h3Index: 'cell-a',
        displayName: 'Sub 1',
        origin: FRENCH_COASTAL,
      },
    ],
  };
}

test('the strategic lookup gives 2 only at a hex of the birth country with the flag on', () => {
  const countryNameAt = (h3: string) => (h3 === 'hex-fr' ? 'France' : 'Spain');
  const units = [{ id: 'u1', origin: FRENCH_COASTAL }];
  const lookup = createStrategicOriginHitBonusLookup({ settings: COUNTRY_ONLY, units, countryNameAt });
  assert.equal(lookup('u1', 'hex-fr'), 2);
  assert.equal(lookup('u1', 'hex-es'), 0);
  assert.equal(lookup('unknown', 'hex-fr'), 0);
  const off = createStrategicOriginHitBonusLookup({ settings: TERRAIN_ONLY, units, countryNameAt });
  assert.equal(off('u1', 'hex-fr'), 0);
});

test('the tactical lookup applies the terrain test only with the terrain flag on', () => {
  assert.equal(createTacticalOriginHitBonusLookup({ settings: TERRAIN_ONLY, battle: coastalBattle() })('sub-1', 'cell-a'), 2);
  assert.equal(createTacticalOriginHitBonusLookup({ settings: COUNTRY_ONLY, battle: coastalBattle() })('sub-1', 'cell-a'), 0);
});

test('withOriginHitBonus adds the field only to qualifying units', () => {
  const units = [
    { id: 'a', player: 'human', unitType: 'infantry', h3Index: 'h' },
    { id: 'b', player: 'human', unitType: 'infantry', h3Index: 'h' },
  ];
  const out = withOriginHitBonus(units, (unitId) => (unitId === 'a' ? 2 : 0));
  assert.equal(out[0]!.originHitBonus, 2);
  assert.equal('originHitBonus' in out[1]!, false);
  assert.equal('originHitBonus' in units[0]!, false);
  const high = withOriginHitBonus(units, (unitId) => (unitId === 'a' ? 4 : 0));
  assert.equal(high[0]!.originHitBonus, 4);
});

test('the strategic lookup gives 4 with the country bonus at High', () => {
  const lookup = createStrategicOriginHitBonusLookup({
    settings: { ...COUNTRY_ONLY, countryBonusLevel: 'high' },
    units: [{ id: 'u1', origin: FRENCH_COASTAL }],
    countryNameAt: () => 'France',
  });
  assert.equal(lookup('u1', 'hex-fr'), 4);
});
