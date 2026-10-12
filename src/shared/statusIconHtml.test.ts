import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatEffectSymbolPrefixHtml, formatStatusIconHtml } from './statusIconHtml';

test('each status kind uses its icon file and alt text', () => {
  assert.equal(formatStatusIconHtml('up'), '<img class="status-icon" src="status/arrow_up.svg" alt="+" />');
  assert.equal(
    formatStatusIconHtml('doubleUp'),
    '<img class="status-icon" src="status/arrow_up_double.svg" alt="++" />'
  );
  assert.equal(formatStatusIconHtml('down'), '<img class="status-icon" src="status/arrow_down.svg" alt="-" />');
  assert.equal(
    formatStatusIconHtml('doubleDown'),
    '<img class="status-icon" src="status/arrow_down_double.svg" alt="--" />'
  );
  assert.equal(formatStatusIconHtml('blocked'), '<img class="status-icon" src="status/x_mark.svg" alt="x" />');
});

test('effect symbols become icons and other characters are dropped', () => {
  const blocked = formatStatusIconHtml('blocked');
  const down = formatStatusIconHtml('down');
  const up = formatStatusIconHtml('up');
  assert.equal(formatEffectSymbolPrefixHtml('x'), blocked);
  assert.equal(formatEffectSymbolPrefixHtml('x/-/+'), `${blocked}|${down}|${up}`);
  assert.equal(formatEffectSymbolPrefixHtml('<'), '');
  assert.equal(formatEffectSymbolPrefixHtml(''), '');
});
