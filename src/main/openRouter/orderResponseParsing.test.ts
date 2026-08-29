/**
 * Contract tests for assistant final-JSON parsing (tolerant schema + balanced `{`…`}` extraction).
 * Run with: node dist/main/openRouter/orderResponseParsing.test.js
 */

import * as assert from 'assert';
import { cellToLatLng } from 'h3-js';
import { ensureStrategicCoordinateRegistryInitialized, listStrategicRes1H3Indexes } from '../briefing/map/hexCoordinates';
import { buildLatLngCoordinateMap } from '../mapData';
import type { GameStateSnapshot } from '../gameDb';
import { dbRun, getGameState } from '../gameDb';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { parseOrdersResponse } from './orderResponseParsing';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { isEmbarkedLandUnit } from '../gameActions/sealift';

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
  assert.strictEqual(parsed!.message, '');
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
 * Verifies the orders-envelope `"message"` field is trimmed like `"strategy"`, with missing and non-string values coerced to empty.
 *
 * Purpose: Guards player-facing taunt parse so omitted or invalid `message` does not fail the envelope.
 * When to use: After edits to `parseOrdersResponse` message coercion.
 * Expected outcome: Trimmed string when present; `''` for null, non-string, or omitted keys.
 * Exceptions: Assertion failure if parsing returns null.
 */
function testCoercesMessageLikeStrategy(): void {
  const present = parseFixture(
    `{"message":"  You will break.  ","strategy":"hold","orders":[],"airStrikes":[],"ferryOrders":[],"callbacks":[]}`
  );
  assert.ok(present);
  assert.strictEqual(present!.message, 'You will break.');
  const nulled = parseFixture(
    `{"message":null,"strategy":"hold","orders":[],"airStrikes":[],"ferryOrders":[],"callbacks":[]}`
  );
  assert.ok(nulled);
  assert.strictEqual(nulled!.message, '');
  const nonString = parseFixture(
    `{"message":12,"strategy":"hold","orders":[],"airStrikes":[],"ferryOrders":[],"callbacks":[]}`
  );
  assert.ok(nonString);
  assert.strictEqual(nonString!.message, '');
}

/**
 * Defines the `testInvalidAssignOrderTypeSurfacesDropReason` function shape.
 *
 * Purpose: Regression for invalid standing-order types (e.g. model-emitted "hold") surfacing in dropReasons instead of silent failure.
 * When to use: After edits to `processV3OrdersArray` assign_order handling.
 * Expected outcome: Parsed dropReasons mention assign_order rejection; no standing order row is created.
 * Exceptions: None.
 */
function testInvalidAssignOrderTypeSurfacesDropReason(): void {
  const parsed = parseFixture(
    '{"strategy":"x","orders":[{"action":"assign_order","unitId":"opponent-1","order":{"type":"hold"}}],"airStrikes":[],"ferryOrders":[],"callbacks":[]}'
  );
  assert.ok(parsed);
  assert.ok(
    parsed!.dropReasons?.some((r) => r.includes('assign_order opponent-1')),
    'expected assign_order rejection in dropReasons'
  );
}

/**
 * Drops assign_order / cancel_order when parsing under tactical coordinate context.
 *
 * Purpose: Prevents strategic `standing_orders` pollution from sub-unit ids shown in tactical briefings.
 * When to use: After edits to tactical guards in `processV3OrdersArray`.
 * Expected outcome: dropReasons mention tactical skip; no movement orders from those actions.
 * Exceptions: None.
 */
function testTacticalModeSkipsAssignAndCancelOrder(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const latLngByH3 = new Map(minimalState.hexes.map((h) => [h.h3Index, cellToLatLng(h.h3Index) as [number, number]]));
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    for (const [h3, ll] of latLngByH3) {
      if (Math.abs(ll[0] - lat) < 1e-9 && Math.abs(ll[1] - lng) < 1e-9) return h3;
    }
    return undefined;
  };
  const parsed = parseOrdersResponse(
    '{"strategy":"x","orders":[{"action":"assign_order","unitId":"parent:01","order":{"type":"hold_fire"}},{"action":"cancel_order","unitId":"parent:01"}],"airStrikes":[],"ferryOrders":[],"callbacks":[]}',
    resolveToH3,
    minimalState,
    latLngByH3,
    false,
    { mode: 'tactical', battleId: 'parse-tactical-so-guard' }
  );
  assert.ok(parsed);
  assert.ok(
    parsed!.dropReasons?.some((r) => r.includes('assign_order') && r.includes('tactical')),
    'expected tactical assign_order skip'
  );
  assert.ok(
    parsed!.dropReasons?.some((r) => r.includes('cancel_order') && r.includes('tactical')),
    'expected tactical cancel_order skip'
  );
}

/**
 * Expands a grouped `unitIds` array on move, fire, air, and ferry entries into per-unit orders.
 *
 * Purpose: Large rosters cannot fit one JSON object per unit inside the completion budget; Best Options already groups ids.
 * When to use: After edits to actor-id collection in `processV3OrdersArray` / air / ferry normalizers.
 * Expected outcome: Two actors on `unitIds` become two movement, ranged, air, and ferry rows; a lone `unitId` still works.
 * Exceptions: None.
 */
function testUnitIdsExpandsGroupedMoveFireAirAndFerry(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const dest = h3ToCode(minimalState.hexes[0]!.h3Index, { mode: 'strategic' });
  const parsed = parseFixture(
    JSON.stringify({
      strategy: 'group',
      orders: [
        { action: 'explicit_move', unitIds: ['opponent-a', 'opponent-b'], destination: dest },
        { action: 'ranged_attack', unitIds: ['opponent-a', 'opponent-b'], targetHexCode: dest },
        { action: 'explicit_move', unitId: 'opponent-c', destination: dest },
      ],
      airStrikes: [{ unitIds: ['opponent-air-a', 'opponent-air-b'], targetHexCode: dest, targetType: 'units' }],
      ferryOrders: [{ unitIds: ['opponent-air-a', 'opponent-air-b'], destination: dest }],
      callbacks: [],
    })
  );
  assert.ok(parsed);
  assert.deepStrictEqual(
    parsed!.movementOrders.map((row) => row.unitId).sort(),
    ['opponent-a', 'opponent-b', 'opponent-c']
  );
  assert.deepStrictEqual(
    parsed!.rangedAttacks.map((row) => row.unitId).sort(),
    ['opponent-a', 'opponent-b']
  );
  assert.deepStrictEqual(
    parsed!.airStrikes.map((row) => row.unitId).sort(),
    ['opponent-air-a', 'opponent-air-b']
  );
  assert.deepStrictEqual(
    parsed!.ferryOrders.map((row) => row.unitId).sort(),
    ['opponent-air-a', 'opponent-air-b']
  );
}

/**
 * Defines the `testDisembarkClearsAssignmentAndEnqueuesMovement` function shape.

 * Purpose: LLM movement actions auto-debark embarked opponent cargo before enqueueing movement.
 * When to use: After edits to `processV3OrdersArray` disembark handling.
 * Expected outcome: Assignment row removed and one movement order emitted for destination hex.
 * Exceptions: None.
 */
function testDisembarkClearsAssignmentAndEnqueuesMovement(): void {
  withTempGameDb('aw-order-disembark-', () => {
    ensureStrategicCoordinateRegistryInitialized();
    const strategicCtx = { mode: 'strategic' as const };
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'opponent' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'opponent' && u.unitType === 'naval');
    assert.ok(landUnit, 'expected seeded opponent land unit');
    assert.ok(navalUnit, 'expected seeded opponent naval unit');
    const coastalHex = state.hexes[0]!.h3Index;
    dbRun('UPDATE hexes SET terrain = ? WHERE h3_index = ?', ['coastal', coastalHex]);
    const destHex = state.hexes[1]!.h3Index;
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      landUnit!.id,
      navalUnit!.id,
    ]);
    assert.strictEqual(isEmbarkedLandUnit(landUnit!.id), true);

    const liveState = getGameState();
    const hexList = liveState.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const destCode = h3ToCode(destHex, strategicCtx);
    const parsed = parseOrdersResponse(
      `{"strategy":"debark","orders":[{"action":"disembark","unitId":"${landUnit!.id}","destination":"${destCode}"}],"airStrikes":[],"ferryOrders":[],"callbacks":[]}`,
      resolveToH3,
      liveState,
      latLngByH3,
      false,
      strategicCtx
    );
    assert.ok(parsed);
    assert.strictEqual(isEmbarkedLandUnit(landUnit!.id), false);
    assert.strictEqual(parsed!.movementOrders.length, 1);
    assert.strictEqual(parsed!.movementOrders[0]?.unitId, landUnit!.id);
    assert.strictEqual(parsed!.movementOrders[0]?.toH3Index, destHex);
  });
}

/**
 * Defines the `testExplicitMoveWhileEmbarkedAutoDebarks` function shape.

 * Purpose: LLM explicit_move auto-debarks embarked opponent cargo before enqueueing movement.
 * When to use: After edits to embarked handling in `processV3OrdersArray`.
 * Expected outcome: Assignment cleared and one movement row enqueued.
 * Exceptions: None.
 */
function testExplicitMoveWhileEmbarkedAutoDebarks(): void {
  withTempGameDb('aw-order-explicit-embarked-', () => {
    ensureStrategicCoordinateRegistryInitialized();
    const strategicCtx = { mode: 'strategic' as const };
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'opponent' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'opponent' && u.unitType === 'naval');
    assert.ok(landUnit && navalUnit, 'expected seeded opponent units');
    const coastalHex = state.hexes[0]!.h3Index;
    dbRun('UPDATE hexes SET terrain = ? WHERE h3_index = ?', ['coastal', coastalHex]);
    const destHex = state.hexes[1]!.h3Index;

    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [coastalHex, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [coastalHex, navalUnit!.id]);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      landUnit!.id,
      navalUnit!.id,
    ]);

    const liveState = getGameState();
    const hexList = liveState.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const destCode = h3ToCode(destHex, strategicCtx);
    const parsed = parseOrdersResponse(
      `{"strategy":"hold","orders":[{"action":"explicit_move","unitId":"${landUnit!.id}","destination":"${destCode}"}],"airStrikes":[],"ferryOrders":[],"callbacks":[]}`,
      resolveToH3,
      liveState,
      latLngByH3,
      false,
      strategicCtx
    );
    assert.ok(parsed);
    assert.strictEqual(isEmbarkedLandUnit(landUnit!.id), false);
    assert.strictEqual(parsed!.movementOrders.length, 1);
    assert.strictEqual(parsed!.movementOrders[0]?.unitId, landUnit!.id);
    assert.strictEqual(parsed!.movementOrders[0]?.toH3Index, destHex);
  });
}

/**
 * Stores infrastructure_destroyed watches as H3, not as the briefing code the prompt taught.
 *
 * Purpose: Compact and object JSON name `hex` or put a two-character code in `h3Index`; the evaluator matches destroyed-infra events by H3.
 * When to use: After edits to compact parsing or `rewriteInfrastructureDestroyedParams`.
 * Expected outcome: `params.h3Index` is the registry H3 for the supplied briefing code; `targetType` is preserved.
 * Exceptions: Assertion failure if registry init cannot produce a strategic cell code.
 */
function testInfrastructureDestroyedCallbackStoresH3NotBriefingCode(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const h3 = listStrategicRes1H3Indexes()[0];
  assert.ok(h3, 'expected at least one strategic cell');
  const code = h3ToCode(h3, { mode: 'strategic' });
  const compact = parseFixture(
    `{"strategy":"hold","orders":[],"callbacks":["infrastructure_destroyed(airport, ${code})"]}`
  );
  assert.ok(compact);
  const compactSub = compact!.callbacks?.find((c) => c.event === 'infrastructure_destroyed');
  assert.ok(compactSub, 'compact form must store the subscription');
  assert.strictEqual(compactSub!.params.targetType, 'airport');
  assert.strictEqual(compactSub!.params.h3Index, h3);

  const objectForm = parseFixture(
    `{"strategy":"hold","orders":[],"callbacks":[{"event":"infrastructure_destroyed","params":{"targetType":"urban","hex":"${code}"}}]}`
  );
  assert.ok(objectForm);
  const objectSub = objectForm!.callbacks?.find((c) => c.event === 'infrastructure_destroyed');
  assert.ok(objectSub, 'object form must store the subscription');
  assert.strictEqual(objectSub!.params.targetType, 'urban');
  assert.strictEqual(objectSub!.params.h3Index, h3);
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
  { name: 'parseOrdersResponse coerces message like strategy', fn: testCoercesMessageLikeStrategy },
  { name: 'parseOrdersResponse balanced extract before trailing prose', fn: testExtractsJsonBeforeTrailingBraceInProse },
  { name: 'parseOrdersResponse tries fenced json after bad preamble', fn: testSkipsBadCandidateThenParsesFence },
  { name: 'parseOrdersResponse rejects top-level JSON array', fn: testRejectsTopLevelJsonArray },
  { name: 'parseOrdersResponse invalid assign_order type drop reason', fn: testInvalidAssignOrderTypeSurfacesDropReason },
  { name: 'parseOrdersResponse tactical skips assign_order and cancel_order', fn: testTacticalModeSkipsAssignAndCancelOrder },
  { name: 'parseOrdersResponse unitIds expands grouped move fire air and ferry', fn: testUnitIdsExpandsGroupedMoveFireAirAndFerry },
  {
    name: 'parseOrdersResponse infrastructure_destroyed stores H3 not briefing code',
    fn: testInfrastructureDestroyedCallbackStoresH3NotBriefingCode,
  },
  { name: 'parseOrdersResponse disembark clears assignment and enqueues movement', fn: testDisembarkClearsAssignmentAndEnqueuesMovement },
  { name: 'parseOrdersResponse explicit_move while embarked auto-debarks', fn: testExplicitMoveWhileEmbarkedAutoDebarks },
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
