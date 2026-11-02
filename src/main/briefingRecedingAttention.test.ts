/**
 * Attention Flags and Action needed for a receding march and a defend walk-back.
 *
 * Purpose: Those two orders share the receding check and differ in the threat they require.
 * When to use: After edits to `standingOrderRecedesFromNearestEnemy` or the attention bullets.
 * Expected outcome: A receding march is Action needed. A defend walk-back is Action needed only under a moderate or critical threat.
 * Exceptions: None.
 */

import * as assert from 'assert';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import type { UnitAssessmentResult } from './precomputation';
import { buildAttentionFlags, buildUnitStatusTable } from './briefingFormatter';

/**
 * A healthy march that recedes from the nearest enemy is a worklist row.
 *
 * Purpose: A march that walks away after a legal shot has to stay on the worklist.
 * When to use: After edits to the march branch of `standingOrderRecedesFromNearestEnemy`.
 * Expected outcome: Action needed yes, and Attention Flags name the receding march.
 * Exceptions: None.
 */
function testRecedingMarchIsActionNeeded(): void {
  const origin = latLngToCell(40, 0, 1);
  const ring1 = gridDisk(origin, 1).filter((h) => h !== origin);
  const neighbor = ring1[0]!;
  const far = gridDisk(origin, 2).find((h) => h !== origin && !ring1.includes(h));
  assert.ok(far, 'expected a two-hop dest');
  const unitLl = cellToLatLng(neighbor);
  const enemyLl = cellToLatLng(origin);
  const farLl = cellToLatLng(far!);
  const assessments: UnitAssessmentResult[] = [
    {
      unitId: 'opp-naval-recede',
      result: {
        status: 'ok',
        unit: {
          unitId: 'opp-naval-recede',
          type: 'naval',
          position: [unitLl[0], unitLl[1]],
          currentStandingOrder: {
            type: 'march',
            status: 'en_route',
            destination: [farLl[0], farLl[1]],
          },
        },
        nearbyEnemies: [
          {
            unitId: 'hum-naval-1',
            hexDistance: 3,
            estimatedTurnsToReach: 3,
            position: [enemyLl[0], enemyLl[1]],
            inRangedRange: false,
            inMeleeRange: false,
          } as UnitAssessmentResult['result']['nearbyEnemies'][0],
        ],
        threats: [{ description: 'nearby', severity: 'moderate', sourceUnit: 'hum-naval-1' }],
        canAttackThisTurn: [],
      } as unknown as UnitAssessmentResult['result'],
    },
  ];
  const table = buildUnitStatusTable(assessments, { mode: 'strategic' as const }, true);
  const row = table.split('\n').find((l) => l.includes('opp-naval-recede'));
  assert.ok(row && row.includes('| yes |'), `receding march must read Action needed yes: ${row}`);
  const flags = buildAttentionFlags(assessments, 'strategic', true);
  assert.ok(flags.includes('opp-naval-recede'), 'receding march belongs in Attention Flags');
  assert.ok(flags.includes('recedes'), `Attention Flags must name the receding march: ${flags}`);
}

/**
 * An off-post defend walk-back is a worklist row only under a moderate or critical threat.
 *
 * Purpose: A defender walking away from contact must be named, and a low or missing threat must not add that bullet.
 * When to use: After the receding march case.
 * Expected outcome: Moderate threat yields the defend bullet and Action needed yes. A low threat yields neither.
 * Exceptions: None.
 */
function testRecedingDefendWalkBackNeedsAThreat(): void {
  const origin = latLngToCell(40, 0, 1);
  const ring1 = gridDisk(origin, 1).filter((h) => h !== origin);
  const neighbor = ring1[0]!;
  const far = gridDisk(origin, 2).find((h) => h !== origin && !ring1.includes(h));
  assert.ok(far, 'expected a two-hop step');
  const unitLl = cellToLatLng(neighbor);
  const enemyLl = cellToLatLng(origin);
  const farLl = cellToLatLng(far!);
  const assessment = (severity: 'moderate' | 'low'): UnitAssessmentResult => ({
    unitId: 'opp-inf-walkback',
    result: {
      status: 'ok',
      unit: {
        unitId: 'opp-inf-walkback',
        type: 'infantry',
        position: [unitLl[0], unitLl[1]],
        currentStandingOrder: {
          type: 'defend',
          status: 'en_route',
          nextMoveHex: [farLl[0], farLl[1]],
        },
      },
      nearbyEnemies: [
        {
          unitId: 'hum-inf-1',
          hexDistance: 3,
          estimatedTurnsToReach: 3,
          position: [enemyLl[0], enemyLl[1]],
          inRangedRange: false,
          inMeleeRange: false,
        } as UnitAssessmentResult['result']['nearbyEnemies'][0],
      ],
      threats: [{ description: 'nearby', severity, sourceUnit: 'hum-inf-1' }],
      canAttackThisTurn: [],
    } as unknown as UnitAssessmentResult['result'],
  });
  const moderate = buildAttentionFlags([assessment('moderate')], 'strategic', true);
  assert.ok(
    moderate.includes('defend order walks it back to its post'),
    `moderate threat must name the walk-back: ${moderate}`
  );
  const moderateRow = buildUnitStatusTable([assessment('moderate')], { mode: 'strategic' as const }, true);
  assert.ok(moderateRow.includes('| yes |'), moderateRow);
  const low = buildAttentionFlags([assessment('low')], 'strategic', true);
  assert.ok(!low.includes('defend order walks it back'), `low threat must not name the walk-back: ${low}`);
  const lowRow = buildUnitStatusTable([assessment('low')], { mode: 'strategic' as const }, true);
  assert.ok(lowRow.includes('| no |'), lowRow);
}

/**
 * Runs the receding attention cases.
 *
 * Purpose: The main test script executes this file as a node script.
 * When to use: After `npm run build:main`.
 * Expected outcome: Each case prints OK. The process exits 1 on the first failure.
 * Exceptions: None.
 */
function run(): void {
  const tests = [
    { name: 'receding march is Action needed', fn: testRecedingMarchIsActionNeeded },
    { name: 'receding defend walk-back needs a threat', fn: testRecedingDefendWalkBackNeedsAThreat },
  ];
  for (const test of tests) {
    try {
      test.fn();
      console.log(`OK ${test.name}`);
    } catch (err) {
      console.error(`FAIL ${test.name}`, err);
      process.exit(1);
    }
  }
}

run();
