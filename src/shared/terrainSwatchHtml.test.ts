import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTerrainKindHtml, formatTerrainNameListHtml, rubbleSwatchBackgroundImage } from './terrainSwatchHtml';

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
    '<span class="terrain-swatch" data-terrain-kind="urban" aria-hidden="true"></span>Urban',
    'a&lt;b',
  ].join(', '));
});

/**
 * Checks that Rubble is chipped the same way Urban is, including a count suffix.
 *
 * Purpose: World-hex feature summaries and order tooltips name Rubble in a comma-separated phrase.
 * When to use: From this file's runner.
 * Expected outcome: Forest, Urban, and Rubble each have a swatch. `Rubble (2)` keeps the suffix. Other and unsafe text stay plain.
 * Exceptions: AssertionError when the markup drifts.
 */
test('Rubble is named with a swatch, and Other stays plain', () => {
  const rubbleMark = '<span class="terrain-swatch" data-terrain-kind="rubble" aria-hidden="true"></span>Rubble';
  assert.equal(formatTerrainNameListHtml('Forest, Urban, Rubble'), [
    '<span class="terrain-swatch" data-terrain-kind="forest" aria-hidden="true"></span>Forest',
    '<span class="terrain-swatch" data-terrain-kind="urban" aria-hidden="true"></span>Urban',
    rubbleMark,
  ].join(', '));
  assert.equal(formatTerrainNameListHtml('Rubble (2)'), `${rubbleMark} (2)`);
  assert.equal(formatTerrainNameListHtml('Rubble (1,234)'), `${rubbleMark} (1,234)`);
  const plain = formatTerrainNameListHtml('Other (10%), a<b');
  assert.equal(plain.includes('data-terrain-kind="rubble"'), false);
  assert.equal(plain, 'Other (10%), a&lt;b');
});

/**
 * Checks the Rubble chip hatch is both diagonals in the map hatch red.
 *
 * Purpose: The legend and the tooltips share this string, so a flat color would match Urban.
 * When to use: From this file's runner.
 * Expected outcome: The image names both 45 degree gradients and the opaque dark red.
 * Exceptions: AssertionError when the hatch string drifts.
 */
test('the rubble hatch is a dark-red crosshatch', () => {
  const image = rubbleSwatchBackgroundImage();
  assert.equal(image.includes('45deg'), true);
  assert.equal(image.includes('-45deg'), true);
  assert.equal(image.includes('rgba(110, 22, 18, 0.95)'), true);
});
