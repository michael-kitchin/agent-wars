/**
 * Idle-hex selection and the Production attention bullet.
 *
 * Purpose: The flag must name hexes that can build and are not building, and stay out of the five-bullet unit cap.
 * When to use: `node dist/main/openRouter/productionAttention.test.js` after `npm run build:main`.
 * Expected outcome: Empty, blocked, fully capped, and already-building queues classify as specified, and the bullet lists six of seven.
 * Exceptions: Assertion failures.
 */

import * as assert from 'assert';
import type { ControlledHexQueueSnapshot } from './productionQueueSnapshotTypes';
import {
  appendProductionAttentionBullet,
  findIdleProductionHexes,
  formatProductionAttentionBullet,
} from './productionAttention';

/**
 * One controlled hex with the fields the idle check reads.
 *
 * Purpose: Keeps each case to the queue shape that matters.
 * When to use: The cases in this file.
 * Expected outcome: A snapshot whose label is `hexText`.
 * Exceptions: None.
 */
function hexRow(
  hexText: string,
  availableUnitTypes: readonly string[],
  entries: readonly { unitType: string; queueIndex: number }[]
): ControlledHexQueueSnapshot {
  return {
    hex: [hexText.length, 0],
    availableUnitTypes: [...availableUnitTypes],
    entries: entries.map((entry) => ({ ...entry })),
  };
}

const label = (ll: [number, number]): string => `H${ll[0]}`;

const empty = findIdleProductionHexes([hexRow('aa', ['infantry', 'armor'], [])], new Set(), label);
assert.strictEqual(empty.length, 1);
assert.strictEqual(empty[0]?.reason, 'empty');
assert.deepStrictEqual(empty[0]?.buildableTypes, ['infantry', 'armor']);
const emptyBullet = formatProductionAttentionBullet(empty);
assert.ok(emptyBullet?.includes('H2 (empty queue; can build infantry, armor)'), emptyBullet ?? '');

const blocked = findIdleProductionHexes(
  [hexRow('bb', ['infantry', 'armor'], [{ unitType: 'armor', queueIndex: 0 }, { unitType: 'infantry', queueIndex: 1 }])],
  new Set(['armor']),
  label
);
assert.strictEqual(blocked.length, 1);
assert.strictEqual(blocked[0]?.reason, 'blocked');
assert.deepStrictEqual(blocked[0]?.buildableTypes, ['infantry']);
assert.ok(!blocked[0]?.buildableTypes.includes('armor'));

const allCapped = findIdleProductionHexes(
  [hexRow('cc', ['infantry', 'armor'], [])],
  new Set(['infantry', 'armor']),
  label
);
assert.deepStrictEqual(allCapped, []);

const building = findIdleProductionHexes(
  [hexRow('dd', ['infantry', 'armor'], [{ unitType: 'infantry', queueIndex: 0 }])],
  new Set(['armor']),
  label
);
assert.deepStrictEqual(building, []);

const seven = findIdleProductionHexes(
  Array.from({ length: 7 }, (_, index) => hexRow(`h${index}`, ['infantry'], [])),
  new Set(),
  label
);
const sevenBullet = formatProductionAttentionBullet(seven);
assert.ok(sevenBullet?.startsWith('Production: 7 controlled hexes can build but are not building — '), sevenBullet ?? '');
assert.ok(sevenBullet?.includes('and 1 more (query_production lists every hex)'), sevenBullet ?? '');
assert.strictEqual((sevenBullet?.match(/empty queue/g) ?? []).length, 6);

assert.strictEqual(
  appendProductionAttentionBullet('None.', 'Production: 1 controlled hex can build but is not building — H1 (empty queue; can build infantry). Add a set_build_queue row to productionOrders for each.'),
  '- Production: 1 controlled hex can build but is not building — H1 (empty queue; can build infantry). Add a set_build_queue row to productionOrders for each.'
);
assert.strictEqual(
  appendProductionAttentionBullet('- a1 faces a moderate threat.', 'Production: listed.'),
  '- a1 faces a moderate threat.\n- Production: listed.'
);
assert.strictEqual(appendProductionAttentionBullet('- a1 faces a moderate threat.', null), '- a1 faces a moderate threat.');
console.log('productionAttention.test.ts: ok');
