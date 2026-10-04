import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTerrainKindHtml, formatTerrainNameListHtml } from './terrainSwatchHtml';

test('a map-key terrain kind is named with a swatch, and an unknown kind is not', () => {
  assert.equal(
    formatTerrainKindHtml('plains'),
    '<span class="terrain-swatch" data-terrain-kind="plains" aria-hidden="true"></span>Plains'
  );
  assert.equal(formatTerrainKindHtml(null), 'Unknown');
  assert.equal(formatTerrainKindHtml('urban'), 'Urban');
});

test('a mixed terrain phrase swatches only the map-key names', () => {
  const html = formatTerrainNameListHtml('Plains (60%), Forest (40%), Other (10%)');
  assert.ok(html.includes('data-terrain-kind="plains"'));
  assert.ok(html.includes('data-terrain-kind="forest"'));
  assert.ok(html.includes('Plains (60%)'));
  assert.ok(html.includes('Other (10%)'));
  assert.ok(!html.includes('data-terrain-kind="other"'));
  assert.equal(formatTerrainNameListHtml('Forest, Urban, a<b'), [
    '<span class="terrain-swatch" data-terrain-kind="forest" aria-hidden="true"></span>Forest',
    'Urban',
    'a&lt;b',
  ].join(', '));
});
