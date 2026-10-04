import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAppliedWeatherEffectHtml } from './weatherIcons';

test('an Effects line names snow, rain, and heat with an icon, and omits mild', () => {
  const snow = formatAppliedWeatherEffectHtml('snow');
  assert.ok(snow?.includes('weather/snow.svg'));
  assert.ok(snow?.includes('Snow'));
  assert.ok(formatAppliedWeatherEffectHtml('rain')?.includes('Rain'));
  assert.ok(formatAppliedWeatherEffectHtml('heat')?.includes('Heat'));
  assert.equal(formatAppliedWeatherEffectHtml('mild'), null);
  assert.equal(formatAppliedWeatherEffectHtml(null), null);
});
