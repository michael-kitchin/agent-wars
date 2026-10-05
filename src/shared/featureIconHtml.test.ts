import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatFeatureLabelHtml, formatProducedUnitTechLineHtml, formatSelectedHexTechLineHtml } from './featureIconHtml';

/**
 * Checks when a hex's Tech line is present and which tier it names.
 *
 * Purpose: The hex tooltip and the build popup share this line, so the omit rules and the 20/21 cut stay in one place.
 * When to use: From this file's runner.
 * Expected outcome: Tech off, zero, a negative count, and a non-finite count omit the line. Twenty is Basic. Twenty-one is Advanced.
 * Exceptions: AssertionError when the markup drifts.
 */
test('a producing hex names Basic or Advanced, and a hex that produces nothing omits Tech', () => {
  assert.equal(formatProducedUnitTechLineHtml({ techBonusEnabled: false, baselineUrbanHexCount: 21 }), null);
  assert.equal(formatProducedUnitTechLineHtml({ techBonusEnabled: true, baselineUrbanHexCount: 0 }), null);
  assert.equal(formatProducedUnitTechLineHtml({ techBonusEnabled: true, baselineUrbanHexCount: -1 }), null);
  assert.equal(formatProducedUnitTechLineHtml({ techBonusEnabled: true, baselineUrbanHexCount: Number.NaN }), null);

  const basic = formatProducedUnitTechLineHtml({ techBonusEnabled: true, baselineUrbanHexCount: 20 });
  assert.ok(basic?.includes('<strong>Tech:</strong>'));
  assert.ok(basic?.includes('tech/tech_basic.svg'));
  assert.ok(basic?.includes('Basic'));
  assert.ok(!basic?.includes('tech/tech_advanced.svg'));

  const advanced = formatProducedUnitTechLineHtml({ techBonusEnabled: true, baselineUrbanHexCount: 21 });
  assert.ok(advanced?.includes('<strong>Tech:</strong>'));
  assert.ok(advanced?.includes('tech/tech_advanced.svg'));
  assert.ok(advanced?.includes('Advanced'));
  assert.ok(!advanced?.includes('tech/tech_basic.svg'));
});

/**
 * Checks the unique Basic-then-Advanced list for several selected hexes.
 *
 * Purpose: The multi-hex popup must not turn a non-producing hex into Basic, and must not repeat a tier.
 * When to use: From this file's runner.
 * Expected outcome: Tech off and an array with no positive count omit the line. Zero beside 21 is Advanced only. Twenty is Basic. Twenty-one is Advanced. Mixed counts list Basic, then Advanced, once each.
 * Exceptions: AssertionError when the markup drifts.
 */
test('selected hexes list each producing tier once, Basic then Advanced', () => {
  assert.equal(
    formatSelectedHexTechLineHtml({ techBonusEnabled: false, baselineUrbanHexCounts: [20, 21] }),
    null
  );
  assert.equal(
    formatSelectedHexTechLineHtml({ techBonusEnabled: true, baselineUrbanHexCounts: [0, -1, Number.NaN] }),
    null
  );

  const advancedOnly = formatSelectedHexTechLineHtml({ techBonusEnabled: true, baselineUrbanHexCounts: [0, 21] });
  assert.ok(advancedOnly?.includes('tech/tech_advanced.svg'));
  assert.ok(advancedOnly?.includes('Advanced'));
  assert.ok(!advancedOnly?.includes('tech/tech_basic.svg'));
  assert.ok(!advancedOnly?.includes('Basic'));

  const basic = formatSelectedHexTechLineHtml({ techBonusEnabled: true, baselineUrbanHexCounts: [20] });
  assert.ok(basic?.includes('tech/tech_basic.svg'));
  assert.ok(basic?.includes('Basic'));
  assert.ok(!basic?.includes('tech/tech_advanced.svg'));

  const advanced = formatSelectedHexTechLineHtml({ techBonusEnabled: true, baselineUrbanHexCounts: [21] });
  assert.ok(advanced?.includes('tech/tech_advanced.svg'));
  assert.ok(advanced?.includes('Advanced'));
  assert.ok(!advanced?.includes('tech/tech_basic.svg'));

  const both = formatSelectedHexTechLineHtml({ techBonusEnabled: true, baselineUrbanHexCounts: [21, 20, 21] });
  assert.ok(both?.includes('<strong>Tech:</strong>'));
  assert.ok(both != null && both.indexOf('tech/tech_basic.svg') < both.indexOf('tech/tech_advanced.svg'));
  assert.equal(both?.match(/tech\/tech_basic\.svg/g)?.length, 1);
  assert.equal(both?.match(/tech\/tech_advanced\.svg/g)?.length, 1);
});

/**
 * Checks which feature words lead with a chip or an icon.
 *
 * Purpose: A cell feature list mixes Rubble with airports and transport.
 * When to use: From this file's runner.
 * Expected outcome: Rubble leads with the rubble swatch. Airport stays plain. Road keeps its icon.
 * Exceptions: AssertionError when the markup drifts.
 */
test('Rubble leads with a swatch, and Airport and Road keep their own marks', () => {
  const rubble = formatFeatureLabelHtml('Rubble');
  assert.equal(
    rubble.startsWith('<span class="terrain-swatch" data-terrain-kind="rubble" aria-hidden="true"></span>'),
    true
  );
  assert.equal(rubble.endsWith('Rubble'), true);
  assert.equal(formatFeatureLabelHtml('Airport'), 'Airport');
  assert.equal(formatFeatureLabelHtml('Road').includes('transport/road.svg'), true);
});
