/**
 * Idle-hex selection and the Production attention bullet.
 *
 * Purpose: The flag must name hexes that can build and are not building, and stay out of the five-bullet unit cap.
 * When to use: `node dist/main/openRouter/productionAttention.test.js` after `npm run build:main`.
 * Expected outcome: Empty, blocked, fully capped, and already-building queues classify as specified. The bullet groups hexes by queue state and buildable types, and lists at most `PRODUCTION_ATTENTION_LISTED_HEXES` hexes.
 * Exceptions: Assertion failures.
 */

import * as assert from 'assert';
import type { ControlledHexQueueSnapshot } from './productionQueueSnapshotTypes';
import {
  PRODUCTION_ATTENTION_LISTED_HEXES,
  appendProductionAttentionBullet,
  findIdleProductionHexes,
  formatProductionAttentionBullet,
} from './productionAttention';

/**
 * One controlled hex with the fields the idle check reads.
 *
 * Purpose: Keeps each case to the queue shape that matters.
 * When to use: The cases in this file.
 * Expected outcome: A snapshot whose label is `H{id}`.
 * Exceptions: None.
 */
function hexRow(
  id: number,
  availableUnitTypes: readonly string[],
  entries: readonly { unitType: string; queueIndex: number }[]
): ControlledHexQueueSnapshot {
  return {
    hex: [id, 0],
    availableUnitTypes: [...availableUnitTypes],
    entries: entries.map((entry) => ({ ...entry })),
  };
}

const label = (ll: [number, number]): string => `H${ll[0]}`;

const empty = findIdleProductionHexes([hexRow(1, ['infantry', 'armor'], [])], new Set(), label);
assert.strictEqual(empty.length, 1);
assert.strictEqual(empty[0]?.reason, 'empty');
assert.deepStrictEqual(empty[0]?.buildableTypes, ['infantry', 'armor']);
assert.strictEqual(
  formatProductionAttentionBullet(empty),
  'Production: 1 controlled hex can build but is not building — empty queue, can build infantry, armor: H1. Add a set_build_queue row to productionOrders for each.'
);

const blocked = findIdleProductionHexes(
  [hexRow(2, ['infantry', 'armor'], [{ unitType: 'armor', queueIndex: 0 }, { unitType: 'infantry', queueIndex: 1 }])],
  new Set(['armor']),
  label
);
assert.strictEqual(blocked.length, 1);
assert.strictEqual(blocked[0]?.reason, 'blocked');
assert.deepStrictEqual(blocked[0]?.buildableTypes, ['infantry']);
assert.ok(!blocked[0]?.buildableTypes.includes('armor'));

const allCapped = findIdleProductionHexes(
  [hexRow(3, ['infantry', 'armor'], [])],
  new Set(['infantry', 'armor']),
  label
);
assert.deepStrictEqual(allCapped, []);

const cappedWithCredits = findIdleProductionHexes(
  [hexRow(4, ['infantry', 'armor', 'credits'], [])],
  new Set(['infantry', 'armor']),
  label
);
assert.strictEqual(cappedWithCredits.length, 1);
assert.strictEqual(cappedWithCredits[0]?.reason, 'empty');
assert.deepStrictEqual(cappedWithCredits[0]?.buildableTypes, ['credits']);

const queuedFortification = findIdleProductionHexes(
  [hexRow(5, ['armor', 'fortification'], [{ unitType: 'fortification', queueIndex: 0 }])],
  new Set(['armor']),
  label
);
assert.deepStrictEqual(queuedFortification, []);

const building = findIdleProductionHexes(
  [hexRow(6, ['infantry', 'armor'], [{ unitType: 'infantry', queueIndex: 0 }])],
  new Set(['armor']),
  label
);
assert.deepStrictEqual(building, []);

const grouped = findIdleProductionHexes(
  [
    hexRow(1, ['armor', 'fortification', 'credits'], []),
    hexRow(2, ['air', 'armor', 'fortification', 'credits'], []),
    hexRow(3, ['credits', 'armor', 'fortification'], []),
    hexRow(4, ['armor', 'fortification', 'credits'], [{ unitType: 'armor', queueIndex: 0 }]),
    hexRow(5, ['air', 'armor', 'fortification', 'credits'], [{ unitType: 'armor', queueIndex: 0 }]),
    hexRow(6, ['air', 'fortification'], [{ unitType: 'air', queueIndex: 0 }]),
  ],
  new Set(['armor']),
  label
);
assert.strictEqual(
  formatProductionAttentionBullet(grouped),
  'Production: 5 controlled hexes can build but are not building — ' +
    'empty queue, can build fortification, credits: H1, H3; ' +
    'empty queue, can build air, fortification, credits: H2; ' +
    'blocked at cap, can build fortification, credits: H4; ' +
    'blocked at cap, can build air, fortification, credits: H5. ' +
    'Add a set_build_queue row to productionOrders for each.'
);

const overflowCount = PRODUCTION_ATTENTION_LISTED_HEXES + 1;
const overflow = findIdleProductionHexes(
  Array.from({ length: overflowCount }, (_, index) => hexRow(index, ['infantry'], [])),
  new Set(),
  label
);
const overflowBullet = formatProductionAttentionBullet(overflow) ?? '';
assert.ok(overflowBullet.startsWith(`Production: ${overflowCount} controlled hexes`), overflowBullet);
assert.ok(
  overflowBullet.includes(
    `H${PRODUCTION_ATTENTION_LISTED_HEXES - 1}; 1 more not listed (query_production lists every hex). `
  ),
  overflowBullet
);
assert.ok(
  overflowBullet.endsWith('Add a set_build_queue row to productionOrders for each listed hex.'),
  overflowBullet
);
assert.ok(!overflowBullet.includes(`H${PRODUCTION_ATTENTION_LISTED_HEXES}`), overflowBullet);

const singleBullet =
  'Production: 1 controlled hex can build but is not building — empty queue, can build infantry: H1. Add a set_build_queue row to productionOrders for each.';
assert.strictEqual(appendProductionAttentionBullet('None.', singleBullet), `- ${singleBullet}`);
assert.strictEqual(
  appendProductionAttentionBullet('- a1 faces a moderate threat.', 'Production: listed.'),
  '- a1 faces a moderate threat.\n- Production: listed.'
);
assert.strictEqual(appendProductionAttentionBullet('- a1 faces a moderate threat.', null), '- a1 faces a moderate threat.');
console.log('productionAttention.test.ts: ok');
