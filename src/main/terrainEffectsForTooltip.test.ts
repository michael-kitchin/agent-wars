import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeTerrainEffectsLine,
  computeTerrainEffectsLineHtml,
  joinHexEffectsLine,
  formatTerrainEffectEntries,
  formatTerrainEffectEntriesHtml,
  formatTerrainEffectSymbolPrefixHtml,
  formatTerrainEffectsLineHtml,
  type TerrainEffectsInput,
} from '../shared/terrainEffectsForTooltip';

/**
 * Builds a baseline {@link TerrainEffectsInput} with optional field overrides for concise tests.
 *
 * Purpose: Keeps matrix-style cases readable without repeating default plains/land flags.
 * When to use: Every test in this module that calls `computeTerrainEffectsLine`.
 * Expected outcome: Plain land hex with no overlays unless overridden.
 * Exceptions: None.
 */
function fx(overrides: Partial<TerrainEffectsInput> = {}): TerrainEffectsInput {
  return {
    terrainKind: 'plains',
    parentTerrain: 'land',
    parentTerrainKind: 'plains',
    isUrban: false,
    isRubble: false,
    isSeaport: false,
    hasRoad: false,
    hasRail: false,
    ...overrides,
  };
}

test('plains desert and water with no overlays return null', () => {
  assert.equal(computeTerrainEffectsLine(fx()), null);
  assert.equal(computeTerrainEffectsLine(fx({ terrainKind: 'desert' })), null);
  assert.equal(computeTerrainEffectsLine(fx({ terrainKind: 'water', parentTerrain: 'water' })), null);
});

test('plains with road or rail shows plus movement for all occupiable land units', () => {
  assert.equal(computeTerrainEffectsLine(fx({ hasRoad: true })), '(+) All Movement');
  assert.equal(computeTerrainEffectsLine(fx({ hasRail: true })), '(+) All Movement');
});

test('coastal slows armor only without transport', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'coastal', parentTerrain: 'coastal' })),
    '(-) Armored Movement'
  );
});

test('coastal with transport shows plus movement for all', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'coastal', parentTerrain: 'coastal', hasRoad: true })),
    '(+) All Movement'
  );
});

test('forest shows movement and range slowdown for all occupiable land units', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'forest' })),
    '(-) All Movement, (-) All Range'
  );
});

test('forest with transport keeps range cap and adds movement bonus', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'forest', hasRoad: true })),
    '(-) All Range, (+) All Movement'
  );
});

test('mountain blocks armor movement and armor and naval range', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'mountain' })),
    '(-) Infantry Movement, (x) Armored Movement, (x) Armored Range, (x) Naval Range'
  );
});

test('mountain with transport clears land movement penalties and adds bonus for all', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'mountain', hasRail: true })),
    '(+) All Movement, (x) Armored Range, (x) Naval Range'
  );
});

test('wetlands and arctic block armor movement', () => {
  assert.equal(computeTerrainEffectsLine(fx({ terrainKind: 'wetlands' })), '(x) Armored Movement');
  assert.equal(computeTerrainEffectsLine(fx({ terrainKind: 'arctic' })), '(x) Armored Movement');
});

test('wetlands with transport shows plus movement for all land units', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'wetlands', hasRoad: true })),
    '(+) All Movement'
  );
});

test('urban shows movement and range slowdown for all land units', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ isUrban: true })),
    '(-) All Movement, (-) All Range'
  );
});

test('urban on mountain mixes range symbols for armored', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'mountain', isUrban: true })),
    '(-) All Movement, (-) Infantry Range, (x) Naval Range, (x/-) Armored Range'
  );
});

test('rubble shows movement and range slowdown and suppresses transport bonus', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ isRubble: true })),
    '(-) All Movement, (-) All Range'
  );
  assert.equal(
    computeTerrainEffectsLine(fx({ isRubble: true, hasRoad: true, hasRail: true })),
    '(-) All Range'
  );
});

test('water with a road shows plus movement and water without a road stays blank', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'water', parentTerrain: 'water', hasRoad: true })),
    '(+) All Movement'
  );
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'water', parentTerrain: 'water' })),
    null
  );
});

test('rubble mountain with a road blocks armor and does not slow infantry', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'mountain', isRubble: true, hasRoad: true })),
    '(-) Infantry Range, (x) Armored Movement, (x) Naval Range, (x/-) Armored Range'
  );
});

test('rubble wetlands block armor movement', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'wetlands', isRubble: true })),
    '(-) All Range, (-) Infantry Movement, (x) Armored Movement'
  );
});

test('exception D hides naval block on land and land block on water', () => {
  assert.equal(computeTerrainEffectsLine(fx({ terrainKind: 'forest' }))!.includes('Naval'), false);
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'water', parentTerrain: 'water' })),
    null
  );
});

test('seaport on land is occupiable for naval without spurious movement symbols', () => {
  const line = computeTerrainEffectsLine(
    fx({ terrainKind: 'plains', isSeaport: true, parentTerrain: 'land' })
  );
  assert.equal(line, null);
});

test('formatTerrainEffectEntries sorts alphabetically and deduplicates', () => {
  const grouped = new Map<string, ReadonlySet<'x' | '-' | '+'>>();
  grouped.set('Range|Air', new Set(['x']));
  grouped.set('Movement|Infantry', new Set(['-']));
  grouped.set('Movement|Infantry', new Set(['-']));
  assert.deepEqual(formatTerrainEffectEntries(grouped), ['(-) Infantry Movement', '(x) Air Range']);
});

test('formatTerrainEffectEntriesHtml preserves x/-/+ symbol order', () => {
  const grouped = new Map<string, ReadonlySet<'x' | '-' | '+'>>();
  grouped.set('Range|Armored', new Set(['-', 'x']));
  assert.deepEqual(formatTerrainEffectEntriesHtml(grouped), ['(x/-) Armored Range']);
});

test('formatTerrainEffectSymbolPrefixHtml returns parenthesized symbol prefixes without markup', () => {
  assert.equal(formatTerrainEffectSymbolPrefixHtml('x'), '(x)');
  assert.equal(formatTerrainEffectSymbolPrefixHtml('-'), '(-)');
  assert.equal(formatTerrainEffectSymbolPrefixHtml('+'), '(+)');
  assert.equal(formatTerrainEffectSymbolPrefixHtml('x/-/+'), '(x/-/+)');
});

test('formatTerrainEffectsLineHtml preserves plain effect entry text', () => {
  assert.equal(
    formatTerrainEffectsLineHtml('(-) All Movement, (x/-) Armored Range, (+) All Movement'),
    '(-) All Movement, (x/-) Armored Range, (+) All Movement'
  );
});

test('computeTerrainEffectsLineHtml matches plain ordering and text', () => {
  const input = fx({ terrainKind: 'mountain', isUrban: true });
  assert.equal(computeTerrainEffectsLineHtml(input), computeTerrainEffectsLine(input));
});

test('the Effects line adds snow, rain, or heat after terrain effects and omits mild', () => {
  const snow = joinHexEffectsLine(null, 'snow');
  assert.ok(snow?.startsWith('<img class="weather-icon"'));
  assert.ok(snow?.includes('weather/snow.svg'));
  assert.ok(snow?.endsWith('Snow'));
  assert.equal(joinHexEffectsLine(null, 'mild'), null);
  assert.equal(joinHexEffectsLine(null, null), null);
  const withTerrain = joinHexEffectsLine('(-) All Movement', 'rain');
  assert.ok(withTerrain?.startsWith('(-) All Movement, '));
  assert.ok(withTerrain?.includes('Rain'));
  assert.equal(joinHexEffectsLine('(-) All Movement', 'mild'), '(-) All Movement');
});
