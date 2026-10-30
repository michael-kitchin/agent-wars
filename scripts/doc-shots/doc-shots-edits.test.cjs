#!/usr/bin/env node
'use strict';

/**
 * Contract tests for the saved-match edit behind the second documentation session.
 *
 * Purpose: The edit must pick distinct, empty, legal hexes and fall back cleanly when a city is too small.
 * When to use: From `scripts/run-main-node-tests.cjs` as an extra CJS test, or directly with node after `npm run build:main`.
 * Expected outcome: Exits 0 when the chosen hexes and statements match.
 * Exceptions: Assertion failures abort the process via node:test.
 *
 * The game states below are made-up test values built around real H3 cells.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const h3 = require('h3-js');
const { economyEdit, farthestClearHex, hexRing } = require('./doc-shots-edits.cjs');

const { GLOBAL_GAME_MAP } = require(path.join(__dirname, '..', '..', 'dist', 'shared', 'activeGameMap.js'));

const CENTER = h3.latLngToCell(40, -3, 1);
const HOME = h3.gridDisk(CENTER, 3);
const FORT_CITY = hexRing(CENTER, 3)[0];
const ARMOR_HEX = hexRing(CENTER, 2).find((cell) => !h3.gridDisk(FORT_CITY, 1).includes(cell));
const ENEMY_START = hexRing(CENTER, 6)[0];

/**
 * Builds a game state with two home cities, a lone human armor, and one enemy infantry.
 *
 * Purpose: Each test changes one thing about the same layout.
 * When to use: Every test below.
 * Expected outcome: The largest city is at the home's center with `largest` urban cells, and the smaller city has 3.
 *   Hexes in `water` are water. `home` replaces the home's hexes.
 * Exceptions: None.
 */
function testState({ largest = 21, seatId = 'human', pendingOrders = [], water = [], home = HOME } = {}) {
  const waterSet = new Set(water);
  return {
    seats: [{ seatId, kind: 'human', outTurn: null }, { seatId: 'opponent', kind: 'ai', outTurn: null }],
    homeRegionHexesBySeat: { [seatId]: home },
    strategicInfrastructure: [{ h3Index: CENTER, urbanHexCount: largest }, { h3Index: FORT_CITY, urbanHexCount: 3 }],
    hexes: h3.gridDisk(CENTER, 6).map((h3Index) => ({ h3Index, terrainKind: waterSet.has(h3Index) ? 'water' : 'plains' })),
    units: [
      { id: 'h1-a1', player: seatId, unitType: 'armor', h3Index: ARMOR_HEX, embarkedOnNavalUnitId: null },
      { id: 'o1-i1', player: 'opponent', unitType: 'infantry', h3Index: ENEMY_START, embarkedOnNavalUnitId: null },
    ],
    pendingOrders,
  };
}

/**
 * Lists every parameter of every statement.
 *
 * Purpose: The tests check what the edit writes without depending on its SQL text.
 * When to use: After `economyEdit`.
 * Expected outcome: One flat array of parameters.
 * Exceptions: None.
 */
function allParams(edit) {
  return edit.statements.flatMap((statement) => statement.params);
}

test('a large city queues a missile and credits, and every chosen hex is distinct', () => {
  const edit = economyEdit(testState(), GLOBAL_GAME_MAP.rules);
  assert.equal(edit.queueHex, CENTER);
  assert.equal(edit.fortHex, FORT_CITY);
  assert.equal(edit.armorHex, ARMOR_HEX);
  assert.equal(edit.showMissile, true);
  assert.equal(edit.raiseFits, true);
  for (const statement of edit.statements) {
    assert.equal(typeof statement.sql, 'string');
    assert.ok(Array.isArray(statement.params));
  }
  for (const value of ['missile', 'credits', 'h1-m90', 100]) assert.ok(allParams(edit).includes(value), `missing ${value}`);
  assert.ok(edit.statements.some((statement) => statement.sql.includes('is_fortified')), 'fortification is stored on the city cells');
  const chosen = [edit.missileHex, edit.launchHoverHex, edit.enemyHex, edit.queueHex, edit.fortHex];
  assert.equal(new Set(chosen).size, 5);
  assert.ok(h3.gridDistance(edit.missileHex, edit.launchHoverHex) >= 4, 'the launch line is long enough to see');
});

test('a clear line skips a hex whose path crosses a blocked hex', () => {
  const blockedCell = hexRing(CENTER, 1)[0];
  const far = farthestClearHex({ fromHex: CENTER, distances: [2], accept: () => true, blocked: (hex) => hex === blockedCell });
  assert.ok(far);
  assert.ok(!h3.gridPathCells(CENTER, far).includes(blockedCell));
  assert.equal(farthestClearHex({ fromHex: CENTER, distances: [2], accept: () => false, blocked: () => false }), null);
});

test('a city below the Advanced size queues infantry and credits', () => {
  const edit = economyEdit(testState({ largest: 12 }), GLOBAL_GAME_MAP.rules);
  assert.equal(edit.showMissile, false);
  assert.equal(edit.raiseFits, true);
  assert.ok(allParams(edit).includes('infantry'));
  assert.ok(allParams(edit).includes('credits'));
  assert.ok(!allParams(edit).includes('missile'));
});

test('a city too small to raise one infantry does not throw', () => {
  const edit = economyEdit(testState({ largest: 9 }), GLOBAL_GAME_MAP.rules);
  assert.equal(edit.raiseFits, false);
  assert.equal(edit.showMissile, false);
});

test('the enemy never stands on a pending march destination', () => {
  const neighbors = h3.gridDisk(ARMOR_HEX, 1).filter((cell) => cell !== ARMOR_HEX && cell !== CENTER && cell !== FORT_CITY);
  const [first, second, ...rest] = neighbors;
  const edit = economyEdit(testState({ pendingOrders: [{ unitId: 'h1-x', toH3Index: first }], water: rest }), GLOBAL_GAME_MAP.rules);
  assert.equal(edit.enemyHex, second);
  assert.notEqual(edit.missileHex, first);
});

test('a human seat whose id is not human throws', () => {
  assert.throws(() => economyEdit(testState({ seatId: 'p1' }), GLOBAL_GAME_MAP.rules), /human seat id is not human/);
});

test('a home with no empty hex for the missile throws', () => {
  assert.throws(() => economyEdit(testState({ home: [CENTER, FORT_CITY, ARMOR_HEX] }), GLOBAL_GAME_MAP.rules));
});
