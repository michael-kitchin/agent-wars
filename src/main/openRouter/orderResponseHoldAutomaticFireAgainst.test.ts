/**
 * The orders parser reads `holdAutomaticFireAgainst` on the world map and in a battle.
 * Run with: node dist/main/openRouter/orderResponseHoldAutomaticFireAgainst.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import type { GameStateSnapshot } from '../gameDb';
import { buildLatLngCoordinateMap } from '../mapData';
import { parseOrdersResponse } from './orderResponseParsing';

const STATE = {
  hexes: [{ h3Index: '891f1d48b9fffff', terrain: 'land', terrainKind: 'plains' }],
  units: [{ id: 'opponent-1', player: 'opponent', unitType: 'armor', h3Index: '891f1d48b9fffff' }],
  phase: 'planning',
  turnNumber: 1,
  pendingOrders: [],
} as GameStateSnapshot;

/**
 * Parses one reply whose only extra key is the given text.
 *
 * Purpose: Every case differs only in the field's value and the theater.
 * When to use: Every case.
 * Expected outcome: The parsed reply.
 * Exceptions: Fails the test when the reply does not parse.
 */
function parse(extra: string, mode: 'strategic' | 'tactical' = 'strategic') {
  ensureStrategicCoordinateRegistryInitialized();
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(STATE.hexes.map((h) => h.h3Index));
  const context = mode === 'strategic' ? { mode } : { mode, battleId: 'automatic-fire-parse' };
  const parsed = parseOrdersResponse(`{"strategy":"x","orders":[]${extra}}`, resolveToH3, STATE, latLngByH3, false, context);
  assert.ok(parsed);
  return parsed;
}

/**
 * Whether any drop reason names the field.
 *
 * Purpose: A kept list must be silent.
 * When to use: In the cases of this file.
 * Expected outcome: True when a reason mentions it.
 * Exceptions: None.
 */
function namesField(dropReasons: readonly string[] | undefined): boolean {
  return (dropReasons ?? []).some((reason) => reason.includes('holdAutomaticFireAgainst'));
}

for (const mode of ['strategic', 'tactical'] as const) {
  test(`a ${mode} reply with side codes asks to replace the list`, () => {
    const parsed = parse(',"holdAutomaticFireAgainst":["a2"]', mode);
    assert.deepEqual(parsed.holdAutomaticFireAgainstChoice, { kind: 'replace', sideCodes: ['a2'] });
  });
}

test('["none"] asks to clear the list', () => {
  assert.deepEqual(parse(',"holdAutomaticFireAgainst":["none"]').holdAutomaticFireAgainstChoice, { kind: 'clear' });
});

test('a missing field and an empty list ask for nothing and report nothing', () => {
  for (const extra of ['', ',"holdAutomaticFireAgainst":[]']) {
    const parsed = parse(extra);
    assert.equal(parsed.holdAutomaticFireAgainstChoice, undefined);
    assert.equal(namesField(parsed.dropReasons), false);
  }
});

test('a value that is not a list is dropped with a reason and the orders are kept', () => {
  const parsed = parse(',"holdAutomaticFireAgainst":"a2","callbacks":[]');
  assert.equal(parsed.strategy, 'x');
  assert.equal(parsed.holdAutomaticFireAgainstChoice, undefined);
  assert.ok(parsed.dropReasons?.includes('holdAutomaticFireAgainst dropped: expected a list of side codes.'));
});
