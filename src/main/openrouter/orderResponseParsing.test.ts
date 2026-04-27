/**
 * Contract tests for assistant final-JSON parsing (tolerant schema + balanced `{`…`}` extraction).
 * Run with: node dist/main/openrouter/orderResponseParsing.test.js
 */

import * as assert from 'assert';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hex-coordinates';
import { buildLatLngCoordinateMap } from '../mapData';
import type { GameStateSnapshot } from '../gameDb';
import { parseOrdersResponse } from './orderResponseParsing';

/**
 * Documents the module-scope binding `minimalState` (minimalState).

 * Purpose: Minimal `GameStateSnapshot` for parsing tests that only need valid hex/units rows and registry-backed codes.
 * When to use: `parseFixture` helper input to `parseOrdersResponse`.
 * Expected outcome: Satisfies `processV3OrdersArray` and coordinate helpers without full game DB fields.
 * Exceptions: None.
 */
const minimalState: GameStateSnapshot = {
  hexes: [{ h3Index: '891f1d48b9fffff', terrain: 'land', terrainKind: 'plains' }],
  units: [
    { id: 'human-1', player: 'human', unitType: 'infantry', h3Index: '891f1d48b9fffff' },
    { id: 'opponent-1', player: 'opponent', unitType: 'armor', h3Index: '891f1d48b9fffff' },
  ],
  phase: 'planning',
  turnNumber: 1,
  pendingOrders: [],
} as GameStateSnapshot;

/**
 * Defines the `parseFixture` function shape (function parseFixture(content: string)).

 * Purpose: Runs `parseOrdersResponse` with strategic registry init and a lat/lng map derived from `minimalState.hexes`.
 * When to use: Each assertion in this file to avoid repeating coordinate setup.
 * Expected outcome: Same contract as production parsing with `coordinateContext.mode === 'strategic'`.
 * Exceptions: Throws if registry init fails (should not in CI).
 */
function parseFixture(content: string) {
  ensureStrategicCoordinateRegistryInitialized();
  const hexList = minimalState.hexes.map((h) => h.h3Index);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
  return parseOrdersResponse(content, resolveToH3, minimalState, latLngByH3, false, { mode: 'strategic' });
}

/**
 * Defines the `testAcceptsNullStrategyAndOmittedOrders` function shape.

 * Purpose: Regression for models that emit JSON `null` for `strategy` (previously rejected the whole payload).
 * When to use: After edits to `parseOrdersResponse` schema coercion.
 * Expected outcome: Parsed result with empty strategy string and no movement rows.
 * Exceptions: Assertion failure if parsing returns null.
 */
function testAcceptsNullStrategyAndOmittedOrders(): void {
  const parsed = parseFixture(`{"strategy":null,"orders":[],"airStrikes":[],"ferryOrders":[],"callbacks":[]}`);
  assert.ok(parsed);
  assert.strictEqual(parsed!.strategy, '');
  assert.strictEqual(parsed!.movementOrders.length, 0);
}

/**
 * Defines the `testExtractsJsonBeforeTrailingBraceInProse` function shape.

 * Purpose: Ensures balanced-brace extraction stops at the real object end so trailing prose with `}` does not break `JSON.parse`.
 * When to use: After edits to `extractBalancedJsonObjectFrom` or candidate ordering in `parseOrdersResponse`.
 * Expected outcome: `strategy` is read from the embedded object, not null.
 * Exceptions: Assertion failure if greedy truncation regresses.
 */
function testExtractsJsonBeforeTrailingBraceInProse(): void {
  const parsed = parseFixture(
    'Here you go:\n{"strategy":"hold","orders":[],"airStrikes":[],"ferryOrders":[],"callbacks":[]}\n' +
      'Note: brace } may appear in prose after the object.'
  );
  assert.ok(parsed);
  assert.strictEqual(parsed!.strategy, 'hold');
}

/**
 * Defines the `testSkipsBadCandidateThenParsesFence` function shape.

 * Purpose: Ensures a candidate that parses as JSON but has invalid `orders` type does not abort the whole parse (`continue` vs `return null`).
 * When to use: Regression when changing validation flow inside the candidate loop.
 * Expected outcome: Later fenced JSON block supplies the accepted payload.
 * Exceptions: Assertion failure if the first bad object short-circuits parsing.
 */
function testSkipsBadCandidateThenParsesFence(): void {
  const parsed = parseFixture(
    '{"strategy":"bad","orders":"invalid"}\n\n```json\n' +
      '{"strategy":"x","orders":[],"airStrikes":[],"ferryOrders":[],"callbacks":[]}\n' +
      '```'
  );
  assert.ok(parsed);
  assert.strictEqual(parsed!.strategy, 'x');
}

/**
 * Defines the `testRejectsTopLevelJsonArray` function shape.

 * Purpose: Enforces the assistant contract that final JSON is a single object with `strategy` and `orders`, not a legacy top-level array of order rows (which must fail `requestOrders` / repair, not parse as empty success).
 * When to use: Regression when changing candidate extraction in `parseOrdersResponse`.
 * Expected outcome: `parseOrdersResponse` returns null so callers surface a parse failure.
 * Exceptions: Assertion failure if an inner `{...}` is incorrectly accepted as the envelope.
 */
function testRejectsTopLevelJsonArray(): void {
  const parsed = parseFixture(
    '[{"unitId":"opponent-armor-1","action":"explicit_move","destination":[0,0]}]'
  );
  assert.strictEqual(parsed, null);
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Registers named cases for the manual test runner at the bottom of this file.
 * When to use: `run()` iterates this list for TAP-free CI output consistent with sibling `*.test.ts` modules.
 * Expected outcome: Every entry has a `name` and `fn` that runs without async.
 * Exceptions: None.
 */
const tests = [
  { name: 'parseOrdersResponse null strategy and empty orders', fn: testAcceptsNullStrategyAndOmittedOrders },
  { name: 'parseOrdersResponse balanced extract before trailing prose', fn: testExtractsJsonBeforeTrailingBraceInProse },
  { name: 'parseOrdersResponse tries fenced json after bad preamble', fn: testSkipsBadCandidateThenParsesFence },
  { name: 'parseOrdersResponse rejects top-level JSON array', fn: testRejectsTopLevelJsonArray },
];

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Executes all `tests` entries and exits the process with code 1 on first failure.
 * When to use: Invoked at module load when running `node dist/.../orderResponseParsing.test.js`.
 * Expected outcome: Prints `OK` lines and returns normally when all pass.
 * Exceptions: `process.exit(1)` on assertion error.
 */
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
