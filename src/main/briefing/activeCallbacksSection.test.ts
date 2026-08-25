/**
 * Contract tests for Active Callbacks Details cells.
 * Run: `npm run build:main` then `node dist/main/briefing/activeCallbacksSection.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CoordinateContext } from './map/coordinateContext';
import { ensureStrategicCoordinateRegistryInitialized, listStrategicRes1H3Indexes } from './map/hex-coordinates';
import { h3ToCode } from './map/hex-code-translator';
import { buildActiveCallbacksSection, formatCallbackLine } from './activeCallbacksSection';

const strategicCtx: CoordinateContext = { mode: 'strategic' };

test('infrastructure_destroyed without params describes an unfiltered watch', () => {
  const line = formatCallbackLine({ event: 'infrastructure_destroyed', params: {} }, strategicCtx);
  assert.notEqual(line, 'infrastructure_destroyed');
  assert.match(line, /any/i);
});

test('infrastructure_destroyed Details cell names targetType and cell code', () => {
  ensureStrategicCoordinateRegistryInitialized();
  const h3Index = listStrategicRes1H3Indexes()[0];
  assert.ok(h3Index, 'expected at least one strategic cell');
  const cell = h3ToCode(h3Index, strategicCtx);
  const line = formatCallbackLine(
    { event: 'infrastructure_destroyed', params: { targetType: 'airport', h3Index } },
    strategicCtx
  );
  assert.ok(line.includes('airport'), 'Details must name targetType');
  assert.ok(line.includes(cell), 'Details must name the cell code');
  assert.equal(line, `infrastructure_destroyed(airport, ${cell})`);
});

test('infrastructure_destroyed Details keeps a stored briefing code', () => {
  const line = formatCallbackLine(
    { event: 'infrastructure_destroyed', params: { targetType: 'seaport', h3Index: 'CI' } },
    strategicCtx
  );
  assert.equal(line, 'infrastructure_destroyed(seaport, CI)');
  assert.doesNotMatch(line, /specified territory/);
});

test('Active Callbacks table renders taught subscription parameters', () => {
  const table = buildActiveCallbacksSection(
    [
      { event: 'turns', params: { n: 3 }, subscribedTurn: 10 },
      { event: 'unit_engaged', params: { unitId: 'opponent-armor-1' } },
    ],
    strategicCtx
  );
  assert.ok(table.includes('| Event | Details |'));
  assert.ok(table.includes('turns(3) → fires turn 13'));
  assert.ok(table.includes('unit_engaged(opponent-armor-1)'));
});
