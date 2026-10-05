import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatProducedUnitTechLineHtml } from './featureIconHtml';

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
