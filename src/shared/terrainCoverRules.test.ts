import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatStatusIconHtml } from './statusIconHtml';
import {
  formatTerrainCoverTooltipHtml,
  joinHexTooltipEffectsHtml,
  strategicHexEffectsBodyHtml,
  terrainCoverFor,
  terrainCoverPairFor,
  terrainCoverShooterForUnitType,
  terrainCoverSourceLabel,
} from './terrainCoverRules';

test('each terrain kind gives its ground-and-naval and air cover', () => {
  assert.deepEqual(terrainCoverPairFor({ terrainKind: 'forest' }), { surface: 2, air: 1 });
  assert.deepEqual(terrainCoverPairFor({ terrainKind: 'mountain' }), { surface: 2, air: 0 });
  assert.deepEqual(terrainCoverPairFor({ terrainKind: 'wetlands' }), { surface: 1, air: 0 });
  assert.deepEqual(terrainCoverPairFor({ terrainKind: 'plains' }), { surface: 0, air: 0 });
});

test('an unknown or missing terrain kind gives no cover', () => {
  assert.equal(terrainCoverFor({ terrainKind: 'lava' }, 'surface'), 0);
  assert.equal(terrainCoverFor({}, 'surface'), 0);
  assert.equal(terrainCoverFor({ terrainKind: null }, 'air'), 0);
});

test('urban cover raises each column to the larger value', () => {
  assert.deepEqual(terrainCoverPairFor({ terrainKind: 'plains', isUrban: true }), { surface: 2, air: 1 });
  assert.deepEqual(terrainCoverPairFor({ terrainKind: 'mountain', isUrban: true }), { surface: 2, air: 1 });
  assert.deepEqual(terrainCoverPairFor({ terrainKind: 'plains', isRubble: true }), { surface: 2, air: 1 });
});

test('only air units read the air column', () => {
  assert.equal(terrainCoverShooterForUnitType('air'), 'air');
  for (const unitType of ['infantry', 'armor', 'naval']) {
    assert.equal(terrainCoverShooterForUnitType(unitType), 'surface', unitType);
  }
});

test('the tooltip text states each non-zero column', () => {
  const groundDouble = `${formatStatusIconHtml('doubleUp')}Ground &amp; Naval Cover`;
  const groundSingle = `${formatStatusIconHtml('up')}Ground &amp; Naval Cover`;
  const airSingle = `${formatStatusIconHtml('up')}Air Cover`;
  const forest = formatTerrainCoverTooltipHtml(terrainCoverPairFor({ terrainKind: 'forest' }));
  assert.equal(forest, `${groundDouble}, ${airSingle}`);
  assert.equal(forest!.includes('-2'), false);
  assert.equal(forest!.includes('ground and naval fire'), false);
  assert.equal(forest!.includes('air strikes'), false);
  assert.equal(formatTerrainCoverTooltipHtml(terrainCoverPairFor({ terrainKind: 'mountain' })), groundDouble);
  assert.equal(formatTerrainCoverTooltipHtml(terrainCoverPairFor({ terrainKind: 'wetlands' })), groundSingle);
  assert.equal(formatTerrainCoverTooltipHtml(terrainCoverPairFor({ terrainKind: 'plains' })), null);
  const movement = `${formatStatusIconHtml('down')}All Movement`;
  assert.equal(joinHexTooltipEffectsHtml(null, null), null);
  assert.equal(joinHexTooltipEffectsHtml('  ', null), null);
  assert.equal(joinHexTooltipEffectsHtml(movement, null), movement);
  assert.equal(joinHexTooltipEffectsHtml(movement, forest), `${movement}, ${forest}`);
});

test('the source label prefers rubble, then urban, then the terrain kind', () => {
  assert.equal(terrainCoverSourceLabel({ terrainKind: 'forest', isUrban: true, isRubble: true }), 'Rubble');
  assert.equal(terrainCoverSourceLabel({ terrainKind: 'forest', isUrban: true }), 'Urban');
  assert.equal(terrainCoverSourceLabel({ terrainKind: 'forest' }), 'Forest');
  assert.equal(terrainCoverSourceLabel({ terrainKind: 'plains' }), null);
});

test('a forest city covers 2/1 and a rugged wetlands hex covers 2/0', () => {
  assert.deepEqual(terrainCoverPairFor({ terrainKind: 'forest', city: true }), { surface: 2, air: 1 });
  assert.deepEqual(terrainCoverPairFor({ terrainKind: 'wetlands', rugged: true }), { surface: 2, air: 0 });
});

test('a strategic stop hex names armored movement and cover, and a battle cell does not', () => {
  const blocked = `${formatStatusIconHtml('doubleDown')}Armored Movement`;
  const ground = `${formatStatusIconHtml('doubleUp')}Ground &amp; Naval Cover`;
  const air = `${formatStatusIconHtml('up')}Air Cover`;
  const rugged = strategicHexEffectsBodyHtml(1, true, terrainCoverPairFor({ terrainKind: 'plains', rugged: true }), null);
  assert.equal(rugged, `${blocked}, ${ground}`);
  assert.equal(rugged!.includes(formatStatusIconHtml('down')), false);
  const city = strategicHexEffectsBodyHtml(1, true, terrainCoverPairFor({ terrainKind: 'plains', city: true }), null);
  assert.equal(city, `${blocked}, ${ground}, ${air}`);
  assert.equal(strategicHexEffectsBodyHtml(1, false, terrainCoverPairFor({ terrainKind: 'plains' }), null), null);
  assert.equal(strategicHexEffectsBodyHtml(4, true, terrainCoverPairFor({ terrainKind: 'plains' }), null), null);
});
