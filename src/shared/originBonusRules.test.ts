import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ORIGIN_BONUS_OFF,
  formatOriginBonusTooltipLine,
  originBonusSources,
  originHitBonusFromSources,
} from './originBonusRules';
import type { OriginBonusSettings } from './originBonusTypes';
import type { UnitOrigin } from './unitOriginTypes';

/** Settings with both bonuses on. */
const BOTH_ON: OriginBonusSettings = { countryBonusEnabled: true, terrainBonusEnabled: true };

/** A plains-born French unit used by most cases. */
const FRENCH_PLAINS: UnitOrigin = {
  birthH3Index: '81fb3ffffffffff',
  birthRes4H3Index: null,
  birthTerrainKind: 'plains',
  birthCountryName: 'France',
  birthCountryCode: 'FR',
  birthIsUrban: false,
};

test('the country test matches the birth country by name and needs the flag', () => {
  const at = (countryName: string | null) => ({ countryName, terrainKind: null });
  assert.deepEqual(
    originBonusSources({ settings: BOTH_ON, theater: 'strategic', origin: FRENCH_PLAINS, place: at('France') }),
    ['country']
  );
  assert.deepEqual(
    originBonusSources({ settings: BOTH_ON, theater: 'strategic', origin: FRENCH_PLAINS, place: at('Spain') }),
    []
  );
  assert.deepEqual(
    originBonusSources({
      settings: BOTH_ON,
      theater: 'strategic',
      origin: { ...FRENCH_PLAINS, birthCountryName: null },
      place: at(null),
    }),
    []
  );
  assert.deepEqual(
    originBonusSources({ settings: ORIGIN_BONUS_OFF, theater: 'strategic', origin: FRENCH_PLAINS, place: at('France') }),
    []
  );
});

test('the terrain test applies only in battles and normalizes kinds', () => {
  const plainsCell = { countryName: null, terrainKind: 'plains' };
  assert.deepEqual(
    originBonusSources({ settings: BOTH_ON, theater: 'tactical', origin: FRENCH_PLAINS, place: plainsCell }),
    ['terrain']
  );
  assert.deepEqual(
    originBonusSources({ settings: BOTH_ON, theater: 'strategic', origin: FRENCH_PLAINS, place: plainsCell }),
    []
  );
  assert.deepEqual(
    originBonusSources({
      settings: BOTH_ON,
      theater: 'tactical',
      origin: { ...FRENCH_PLAINS, birthTerrainKind: 'forest' },
      place: { countryName: null, terrainKind: 'forests' },
    }),
    ['terrain']
  );
  assert.deepEqual(
    originBonusSources({
      settings: BOTH_ON,
      theater: 'tactical',
      origin: { ...FRENCH_PLAINS, birthIsUrban: true },
      place: plainsCell,
    }),
    ['terrain']
  );
});

test('both reasons are listed but the bonus stays +1', () => {
  const sources = originBonusSources({
    settings: BOTH_ON,
    theater: 'tactical',
    origin: FRENCH_PLAINS,
    place: { countryName: 'France', terrainKind: 'plains' },
  });
  assert.deepEqual(sources, ['country', 'terrain']);
  assert.equal(originHitBonusFromSources(sources), 1);
});

test('the tooltip line names the reasons, or is absent', () => {
  assert.equal(formatOriginBonusTooltipLine([]), null);
  assert.equal(formatOriginBonusTooltipLine(['country']), 'Bonus: +1 (country)');
  assert.equal(formatOriginBonusTooltipLine(['country', 'terrain']), 'Bonus: +1 (country, terrain)');
});
