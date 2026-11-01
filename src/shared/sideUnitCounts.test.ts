import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BuildUnitType } from './ipc/productionTypes';
import { countSideUnitsByType, formatSideUnitCountsText } from './sideUnitCounts';

/** Global-map prices, where air is cheaper than naval. */
const GLOBAL_COSTS: Readonly<Record<BuildUnitType, number>> = { infantry: 20, armor: 40, naval: 100, air: 60, missile: 200 };

/** One unit row for the side being counted, or for another owner. */
const unit = (unitType: string, player = 'opponent') => ({ player, unitType });

test('counts one side cheapest first, leaves out empty types and other owners, and totals the rows', () => {
  const units = [
    unit('naval'),
    unit('infantry'),
    unit('air'),
    unit('infantry'),
    unit('missile'),
    unit('infantry', 'human'),
    unit('armor', 'opponent2'),
  ];
  const counts = countSideUnitsByType(units, 'opponent', (unitType) => GLOBAL_COSTS[unitType]);
  assert.deepEqual(
    counts.rows.map((row) => `${row.count} ${row.label}`),
    ['2 Infantry', '1 Air', '1 Naval', '1 Missile']
  );
  assert.equal(counts.total, 5);
  assert.equal(formatSideUnitCountsText(counts), '2 Infantry, 1 Air, 1 Naval, 1 Missile, Total: 5');
});

test('a side with no units has no rows and a zero total', () => {
  const counts = countSideUnitsByType([unit('infantry', 'human')], 'opponent', (unitType) => GLOBAL_COSTS[unitType]);
  assert.deepEqual(counts.rows, []);
  assert.equal(formatSideUnitCountsText(counts), 'Total: 0');
});
