/**
 * Contract tests for neighbor terrain counts.
 * Run: node dist/main/tools/hexNeighborTerrain.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { countNeighborTerrain } from './hexNeighborTerrain';

const ORIGIN = '810ebffffffffff';

test('two passable land neighbors are counted and the center is not', () => {
  const neighbors = gridDisk(ORIGIN, 1).slice(1);
  const first = neighbors[0];
  const second = neighbors[1];
  assert.ok(first && second);
  const counted = countNeighborTerrain({
    hexH3: ORIGIN,
    hexSet: new Set([ORIGIN, first, second]),
    terrainByH3: new Map([
      [ORIGIN, 'land'],
      [first, 'land'],
      [second, 'land'],
    ]),
    passableFor: 'land',
  });
  assert.equal(counted.passableNeighbors, 2);
  assert.equal(counted.adjacentLand, 2);
});

test('one water neighbor increments adjacent water', () => {
  const neighbor = gridDisk(ORIGIN, 1).slice(1)[0];
  assert.ok(neighbor);
  const counted = countNeighborTerrain({
    hexH3: ORIGIN,
    hexSet: new Set([ORIGIN, neighbor]),
    terrainByH3: new Map([
      [ORIGIN, 'land'],
      [neighbor, 'water'],
    ]),
    passableFor: 'land',
  });
  assert.equal(counted.adjacentWater, 1);
});
