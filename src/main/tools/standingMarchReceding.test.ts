/**
 * Receding checks for standing marches and defend walk-backs.
 *
 * Purpose: Action needed compares a march destination and a defend next step, and it must ignore a defend order that is not walking back.
 * When to use: `node dist/main/tools/standingMarchReceding.test.js` after `npm run build:main`.
 * Expected outcome: An `en_route` defend step that is farther is receding. The same order with no next step, and a holding order, are not.
 * Exceptions: Assertion failures.
 */

import * as assert from 'assert';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import type { UnitAssessmentResult } from '../precomputation';
import { standingOrderRecedesFromNearestEnemy } from './standingMarchReceding';

/**
 * Builds one infantry assessment at a real cell center.
 *
 * Purpose: The check resolves lat/lng through `strategicCellAt`, so a fake `[1, 1]` position is not a cell.
 * When to use: Each case in this file.
 * Expected outcome: An assessment whose position and nearest enemy are the given centers.
 * Exceptions: None.
 */
function infantryAssessment(
  order: Record<string, unknown>,
  unitLl: readonly [number, number],
  enemyLl: readonly [number, number]
): UnitAssessmentResult {
  return {
    unitId: 'opp-inf-1',
    result: {
      status: 'ok',
      unit: {
        unitId: 'opp-inf-1',
        type: 'infantry',
        position: [unitLl[0], unitLl[1]],
        currentStandingOrder: order,
      },
      nearbyEnemies: [{ unitId: 'hum-1', position: [enemyLl[0], enemyLl[1]] }],
    } as unknown as UnitAssessmentResult['result'],
  };
}

/**
 * Cell centers for a unit one hop from an enemy and a step two hops from that enemy.
 *
 * Purpose: The farther step is the only geometry these cases need.
 * When to use: Before each assertion.
 * Expected outcome: Unit, enemy, and farther centers.
 * Exceptions: Throws when the grid has no two-hop cell.
 */
function recedingCenters(): { unitLl: [number, number]; enemyLl: [number, number]; farLl: [number, number] } {
  const origin = latLngToCell(40, 0, 1);
  const ring1 = gridDisk(origin, 1).filter((h) => h !== origin);
  const neighbor = ring1[0]!;
  const far = gridDisk(origin, 2).find((h) => h !== origin && !ring1.includes(h));
  assert.ok(far, 'expected a two-hop cell');
  return {
    unitLl: cellToLatLng(neighbor) as [number, number],
    enemyLl: cellToLatLng(origin) as [number, number],
    farLl: cellToLatLng(far!) as [number, number],
  };
}

const centers = recedingCenters();

assert.strictEqual(
  standingOrderRecedesFromNearestEnemy(
    infantryAssessment(
      { type: 'defend', status: 'en_route', nextMoveHex: centers.farLl },
      centers.unitLl,
      centers.enemyLl
    )
  ),
  true
);
assert.strictEqual(
  standingOrderRecedesFromNearestEnemy(
    infantryAssessment({ type: 'defend', status: 'en_route' }, centers.unitLl, centers.enemyLl)
  ),
  false
);
assert.strictEqual(
  standingOrderRecedesFromNearestEnemy(
    infantryAssessment(
      { type: 'defend', status: 'holding', defendHex: centers.unitLl },
      centers.unitLl,
      centers.enemyLl
    )
  ),
  false
);
console.log('standingMarchReceding.test.ts: ok');
