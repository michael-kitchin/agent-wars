/**
 * Tests for homeland / nearest / other partitioning used by possible unit actions briefing text.
 */

import * as assert from 'assert';
import { gridDistance } from 'h3-js';
import { getOrderedHexList } from '../mapData';
import { partitionHomelandNearestOther } from './possibleUnitActions';

function minDistToHomeland(h: string, homeland: Set<string>): number {
  let m = Infinity;
  for (const t of homeland) {
    try {
      const d = gridDistance(h, t);
      if (d < m) m = d;
    } catch {
      continue;
    }
  }
  return m;
}

function testPartitionPrefersHomelandOverNearest(): void {
  const hexList = getOrderedHexList().slice(0, 5);
  const homeland = new Set([hexList[0]!, hexList[1]!]);
  const legal = [hexList[0]!, hexList[4]!];
  const p = partitionHomelandNearestOther(legal, homeland);
  assert.deepStrictEqual(p.homeland, [hexList[0]!]);
  assert.deepStrictEqual(p.nearest, []);
  assert.deepStrictEqual(p.other, [hexList[4]!]);
}

function testPartitionNearestWhenNoneInHomeland(): void {
  const hexList = getOrderedHexList().slice(0, 8);
  const homeland = new Set([hexList[0]!]);
  const legal = [hexList[3]!, hexList[4]!, hexList[5]!];
  const p = partitionHomelandNearestOther(legal, homeland);
  assert.deepStrictEqual(p.homeland, []);
  assert.ok(p.nearest.length >= 1);
  const nearestSet = new Set(p.nearest);
  for (const h of p.other) {
    assert.ok(!nearestSet.has(h));
  }
}

function testPartitionEmptyHomelandAllOther(): void {
  const hexList = getOrderedHexList().slice(0, 3);
  const p = partitionHomelandNearestOther([hexList[1]!, hexList[2]!], new Set());
  assert.deepStrictEqual(p.homeland, []);
  assert.deepStrictEqual(p.nearest, []);
  assert.deepStrictEqual(p.other, [hexList[1]!, hexList[2]!].sort((a, b) => a.localeCompare(b)));
}

function testPartitionIncludesAllTiesAtMinDistance(): void {
  const hexList = getOrderedHexList().slice(0, 20);
  const homeland = new Set([hexList[0]!]);
  const legal = hexList.slice(5, 15);
  const p = partitionHomelandNearestOther(legal, homeland);
  if (p.nearest.length >= 2) {
    const ref = minDistToHomeland(p.nearest[0]!, homeland);
    for (const h of p.nearest) {
      assert.strictEqual(minDistToHomeland(h, homeland), ref, 'all nearest bucket hexes share minimum distance to homeland');
    }
  }
}

const tests = [
  { name: 'partitionHomelandNearestOther prefers homeland', fn: testPartitionPrefersHomelandOverNearest },
  { name: 'partitionHomelandNearestOther uses nearest when no homeland hit', fn: testPartitionNearestWhenNoneInHomeland },
  { name: 'partitionHomelandNearestOther empty homeland -> other only', fn: testPartitionEmptyHomelandAllOther },
  { name: 'partitionHomelandNearestOther tie handling', fn: testPartitionIncludesAllTiesAtMinDistance },
];

function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exit(1);
    }
  }
}

run();
