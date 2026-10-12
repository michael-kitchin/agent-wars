/**
 * Contract tests for outbound tool JSON redaction (geo tuples → briefing hex codes).
 */

import * as assert from 'assert';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { ensureStrategicCoordinateRegistryInitialized, listStrategicH3Indexes } from '../briefing/map/hexCoordinates';
import { cellToLatLng } from 'h3-js';
import { encodeOpenRouterToolResultForLlm } from './openRouterToolResultHex';

const strategicCtx: CoordinateContext = { mode: 'strategic' };

/**
 * Builds a trivial `resolveToH3` that snaps to the nearest cell in a fixed hex list.
 *
 * Purpose: Lets tests encode tuples without a full game snapshot.
 * When to use: Only in this test module.
 * Expected outcome: Returns the closest `h3` from `hexList` by planar distance to stored centers.
 * Exceptions: None.
 */
function makeResolveToH3(hexList: string[]): (lat: number, lng: number) => string | undefined {
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h3 of hexList) {
    const [lat, lng] = cellToLatLng(h3);
    latLngByH3.set(h3, [lat, lng]);
  }
  return (lat: number, lng: number): string | undefined => {
    let best = hexList[0];
    let bestD = Infinity;
    for (const h3 of hexList) {
      const ll = latLngByH3.get(h3)!;
      const d = (lat - ll[0]) ** 2 + (lng - ll[1]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = h3;
      }
    }
    return best;
  };
}

/**
 * Defines the `testEncodeAssessUnitReplacesPositionTuples` function shape (function testEncodeAssessUnitReplacesPositionTuples(): void).

 * Purpose: Guards the optional Phase 5B path for tool 2 success payloads.
 * When to use: `npm run build:main` then `node dist/main/openRouter/openRouterToolResultHex.test.js`.
 * Expected outcome: `position` fields become two-character strings; status stays `ok`.
 * Exceptions: None.
 */
function testEncodeAssessUnitReplacesPositionTuples(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const cells = listStrategicH3Indexes().slice(0, 3);
  assert.ok(cells.length >= 2, 'need strategic cells');
  const resolveToH3 = makeResolveToH3(cells);
  const ll0 = cellToLatLng(cells[0]!);
  const ll1 = cellToLatLng(cells[1]!);
  const raw = {
    status: 'ok' as const,
    error: null,
    unit: { unitId: 'u1', type: 'infantry', position: [ll0[0], ll0[1]], terrain: 'land', movementBudget: 1, currentStandingOrder: null },
    nearbyEnemies: [{ unitId: 'e1', type: 'armor', position: [ll1[0], ll1[1]], hexDistance: 2, estimatedTurnsToReach: 1, inRangedRange: true, inMeleeRange: false, inEnemyRangedRange: false, confidence: 'current', lastSeen: 1 }],
    nearbyFriendlies: [],
    threats: [],
    canAttackThisTurn: [],
  };
  const out = encodeOpenRouterToolResultForLlm('assess_unit', raw as Record<string, unknown>, strategicCtx, resolveToH3);
  assert.strictEqual(out.status, 'ok');
  assert.strictEqual(typeof (out.unit as { position?: unknown }).position, 'string');
  assert.strictEqual(
    typeof (out.nearbyEnemies as { position?: unknown }[])[0]!.position,
    'string'
  );
}

/**
 * Defines the `testEncodeEstimateCombatTargetHexString` function shape (function testEncodeEstimateCombatTargetHexString(): void).

 * Purpose: Ensures tool 3 `targetHex` tuple is rewritten for the model.
 * When to use: Same as `testEncodeAssessUnitReplacesPositionTuples`.
 * Expected outcome: `targetHex` is a briefing code string.
 * Exceptions: None.
 */
function testEncodeEstimateCombatTargetHexString(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const cells = listStrategicH3Indexes().slice(0, 2);
  const resolveToH3 = makeResolveToH3(cells);
  const ll = cellToLatLng(cells[0]!);
  const raw = {
    status: 'ok' as const,
    error: null,
    engagementType: 'ranged',
    targetHex: [ll[0], ll[1]],
    attackerSummary: { units: [], totalUnits: 0 },
    defenderSummary: { units: [], totalUnits: 0, canReturnFire: false, returnFireDetails: null },
    prediction: { assessment: 'uncontested', reasoning: 'test' },
  };
  const out = encodeOpenRouterToolResultForLlm('estimate_combat', raw as Record<string, unknown>, strategicCtx, resolveToH3);
  assert.strictEqual(typeof out.targetHex, 'string');
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Node test entrypoint.
 * When to use: After `npm run build:main`.
 * Expected outcome: Process exits 0 when all cases pass.
 * Exceptions: None.
 */
/**
 * Ensures a `plan_route` result does not give the model raw hex indexes.
 *
 * Purpose: `pathH3Indexes` is for the player's stop labels. The model sees hex codes only.
 * When to use: After edits to `redactPlanRouteResult`.
 * Expected outcome: The encoded JSON has neither the field nor a raw index from it.
 * Exceptions: None.
 */
function testEncodePlanRouteDropsPathH3Indexes(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const cells = listStrategicH3Indexes().slice(0, 2);
  const resolveToH3 = makeResolveToH3(cells);
  const secret = '8ffffffffffffffff';
  const raw = {
    status: 'ok' as const,
    unitId: 'h1-t1',
    pathH3Indexes: [cells[0], secret],
    path: [],
    orderToH3: cells[0],
  };
  const out = encodeOpenRouterToolResultForLlm('plan_route', raw as Record<string, unknown>, strategicCtx, resolveToH3);
  assert.strictEqual(out.pathH3Indexes, undefined);
  assert.strictEqual(JSON.stringify(out).includes(secret), false);
  assert.strictEqual(JSON.stringify(out).includes(String(cells[0])), false);
}

function run(): void {
  const tests = [
    { name: 'assess_unit positions redacted', fn: testEncodeAssessUnitReplacesPositionTuples },
    { name: 'estimate_combat targetHex redacted', fn: testEncodeEstimateCombatTargetHexString },
    { name: 'plan_route pathH3Indexes redacted', fn: testEncodePlanRouteDropsPathH3Indexes },
  ];
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (e) {
      console.error(`FAIL ${t.name}`, e);
      process.exit(1);
    }
  }
  console.log(`All ${tests.length} openRouterToolResultHex tests passed.`);
}

run();
