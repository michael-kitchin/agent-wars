import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeTerrainEffectsLine,
  computeTerrainEffectsLineHtml,
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

const bold = (symbols: string): string => formatTerrainEffectSymbolPrefixHtml(symbols);

test('plains desert and water with no overlays return null', () => {
  assert.equal(computeTerrainEffectsLine(fx()), null);
  assert.equal(computeTerrainEffectsLine(fx({ terrainKind: 'desert' })), null);
  assert.equal(computeTerrainEffectsLine(fx({ terrainKind: 'water', parentTerrain: 'water' })), null);
});

test('plains with road or rail shows plus movement for all occupiable land units', () => {
  assert.equal(computeTerrainEffectsLine(fx({ hasRoad: true })), '+ Movement (All)');
  assert.equal(computeTerrainEffectsLine(fx({ hasRail: true })), '+ Movement (All)');
});

test('coastal slows armor only without transport', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'coastal', parentTerrain: 'coastal' })),
    '- Movement (Armored)'
  );
});

test('coastal with transport shows plus movement for all', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'coastal', parentTerrain: 'coastal', hasRoad: true })),
    '+ Movement (All)'
  );
});

test('forest shows movement and range slowdown for all occupiable land units', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'forest' })),
    '- Movement (All), - Range (All)'
  );
});

test('forest with transport keeps range cap and adds movement bonus', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'forest', hasRoad: true })),
    '- Range (All), + Movement (All)'
  );
});

test('mountain blocks armor movement and air armor naval range', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'mountain' })),
    '- Movement (Infantry), x Movement (Armored), x Range (Air), x Range (Armored), x Range (Naval)'
  );
});

test('mountain with transport clears land movement penalties and adds bonus for all', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'mountain', hasRail: true })),
    '+ Movement (All), x Range (Air), x Range (Armored), x Range (Naval)'
  );
});

test('wetlands and arctic block armor movement', () => {
  assert.equal(computeTerrainEffectsLine(fx({ terrainKind: 'wetlands' })), 'x Movement (Armored)');
  assert.equal(computeTerrainEffectsLine(fx({ terrainKind: 'arctic' })), 'x Movement (Armored)');
});

test('wetlands with transport shows plus movement for all land units', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'wetlands', hasRoad: true })),
    '+ Movement (All)'
  );
});

test('urban shows movement and range slowdown for all land units', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ isUrban: true })),
    '- Movement (All), - Range (All)'
  );
});

test('urban on mountain mixes range symbols for armored', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ terrainKind: 'mountain', isUrban: true })),
    '- Movement (All), - Range (Infantry), x Range (Air), x Range (Naval), x/- Range (Armored)'
  );
});

test('rubble shows movement and range slowdown and suppresses transport bonus', () => {
  assert.equal(
    computeTerrainEffectsLine(fx({ isRubble: true })),
    '- Movement (All), - Range (All)'
  );
  assert.equal(
    computeTerrainEffectsLine(fx({ isRubble: true, hasRoad: true, hasRail: true })),
    '- Movement (All), - Range (All)'
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
  assert.deepEqual(formatTerrainEffectEntries(grouped), ['- Movement (Infantry)', 'x Range (Air)']);
});

test('formatTerrainEffectEntriesHtml preserves x/-/+ symbol order', () => {
  const grouped = new Map<string, ReadonlySet<'x' | '-' | '+'>>();
  grouped.set('Range|Armored', new Set(['-', 'x']));
  assert.deepEqual(formatTerrainEffectEntriesHtml(grouped), [`${bold('x/-')} Range (Armored)`]);
});

test('formatTerrainEffectSymbolPrefixHtml bolds each polarity glyph', () => {
  assert.equal(bold('x'), '<strong class="terrain-effect-symbol">x</strong>');
  assert.equal(bold('-'), '<strong class="terrain-effect-symbol">-</strong>');
  assert.equal(bold('+'), '<strong class="terrain-effect-symbol">+</strong>');
  assert.equal(
    bold('x/-/+'),
    '<strong class="terrain-effect-symbol">x</strong><strong class="terrain-effect-symbol">/</strong><strong class="terrain-effect-symbol">-</strong><strong class="terrain-effect-symbol">/</strong><strong class="terrain-effect-symbol">+</strong>'
  );
});

test('formatTerrainEffectsLineHtml styles symbol prefixes only', () => {
  assert.equal(
    formatTerrainEffectsLineHtml('- Movement (All), x/- Range (Armored), + Movement (All)'),
    `${bold('-')} Movement (All), ${bold('x/-')} Range (Armored), ${bold('+')} Movement (All)`
  );
});

test('computeTerrainEffectsLineHtml matches plain ordering with styled prefixes', () => {
  const input = fx({ terrainKind: 'mountain', isUrban: true });
  assert.equal(
    computeTerrainEffectsLineHtml(input),
    computeTerrainEffectsLine(input)!
      .split(', ')
      .map((entry) => formatTerrainEffectsLineHtml(entry))
      .join(', ')
  );
});
