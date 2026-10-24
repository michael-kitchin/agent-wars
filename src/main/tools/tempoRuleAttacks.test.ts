/**
 * Tempo rule sweep — the contracts that decide whether a unit fires when the model orders nothing.
 * Run with: node dist/main/tools/tempoRuleAttacks.test.js
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cellToLatLng, gridDisk } from 'h3-js';
import {
  dbRun,
  getGameState,
  resetGameForNewMatch,
  openGameDatabaseAtPathForTests,
  closeGameDatabaseForTests,
} from '../gameDb';
import type { GameStateSnapshot } from '../gameDb';
import { safeGridHexDistance } from './assessUnitProximity';
import { collectTempoRuleAttacks, mergeCommanderAttackOrders } from './tempoRuleAttacks';

/**
 * A shooter of the requested type with an enemy planted one hex away.
 *
 * Purpose: Every case here needs the same setup — one opponent unit that indisputably has a legal shot — and only
 * varies what is layered on top (a hold_fire row, a pre-existing attack).
 * When to use: Start of each test in this file, inside an open temp database.
 * Expected outcome: The opponent shooter, the enemy hex, and the live state; null when the seed cannot supply them.
 * Exceptions: None.
 */
function stageAdjacentEnemy(
  shooterType: string
): { shooter: GameStateSnapshot['units'][number]; enemyH3: string; state: GameStateSnapshot } | null {
  const seeded = getGameState();
  const shooter = seeded.units.find((u) => u.player === 'opponent' && u.unitType === shooterType);
  if (!shooter) return null;
  const occupied = new Set(seeded.units.map((u) => u.h3Index));
  const hexSet = new Set(seeded.hexes.map((h) => h.h3Index));
  const enemyH3 = gridDisk(shooter.h3Index, 1).find(
    (h3) => h3 !== shooter.h3Index && hexSet.has(h3) && !occupied.has(h3) && safeGridHexDistance(shooter.h3Index, h3) === 1
  );
  if (!enemyH3) return null;
  dbRun(
    `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, 'human', 'infantry', ?, 97)`,
    ['human-tempo-target', enemyH3]
  );
  return { shooter, enemyH3, state: getGameState() };
}

/**
 * Runs `body` against a freshly seeded temp database so cases cannot leak standing orders into each other.
 *
 * Purpose: Each case inserts rows; sharing one database would make results order-dependent.
 * When to use: Wrapping every test in this file.
 * Expected outcome: The database is closed even when an assertion throws.
 * Exceptions: Propagates whatever `body` throws.
 */
function withSeededGame(label: string, body: () => void): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `aw-tempo-${label}-`));
  try {
    openGameDatabaseAtPathForTests(path.join(tempDir, 't.sqlite'));
    resetGameForNewMatch();
    body();
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * The reason this module exists: an idle unit with a legal shot fires without any standing order.
 *
 * Purpose: A captured turn 17 had the model order no attacks at all, and only DEFEND units engaged. Armor carrying
 * no standing order must still shoot an adjacent enemy.
 * When to use: After changes to `collectTempoRuleAttacks` or the shared engagement helper.
 * Expected outcome: One ranged attack aimed at the planted enemy hex.
 * Exceptions: Skips when the seed has no opponent armor with a free adjacent hex.
 */
function testSweepFiresForUnitWithNoStandingOrder(): void {
  withSeededGame('fires', () => {
    const staged = stageAdjacentEnemy('armor');
    if (!staged) {
      console.log('testSweepFiresForUnitWithNoStandingOrder: skip — seed lacks opponent armor with a free neighbour');
      return;
    }
    const result = collectTempoRuleAttacks({
      playerId: 'opponent',
      state: staged.state,
      alreadyAttackingUnitIds: new Set<string>(),
    });
    const shot = result.rangedAttacks.find((r) => r.unitId === staged.shooter.id);
    assert.ok(shot, 'armor with no standing order must take the legal shot');
    assert.strictEqual(shot!.targetH3Index, staged.enemyH3);
  });
}

/**
 * A hold_fire standing order still means hold fire.
 *
 * Purpose: hold_fire is the only way to tell a unit not to shoot; a sweep that ignored it would remove the control
 * entirely. This is the essential failure case for the feature.
 * When to use: After changes to how the sweep reads standing orders.
 * Expected outcome: No attack for the unit that would otherwise fire in the happy-path case above.
 * Exceptions: Skips when the seed cannot stage the scenario.
 */
function testSweepRespectsHoldFire(): void {
  withSeededGame('holdfire', () => {
    const staged = stageAdjacentEnemy('armor');
    if (!staged) {
      console.log('testSweepRespectsHoldFire: skip — seed lacks opponent armor with a free neighbour');
      return;
    }
    dbRun(
      `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'opponent',
        staged.shooter.id,
        'hold_fire',
        JSON.stringify({ type: 'hold_fire' }),
        null,
        'holding',
        staged.state.turnNumber,
        JSON.stringify(cellToLatLng(staged.shooter.h3Index)),
      ]
    );
    const result = collectTempoRuleAttacks({
      playerId: 'opponent',
      state: staged.state,
      alreadyAttackingUnitIds: new Set<string>(),
    });
    assert.ok(
      !result.rangedAttacks.some((r) => r.unitId === staged.shooter.id),
      'hold_fire must suppress the tempo sweep for that unit'
    );
  });
}

/**
 * A unit that already has an attack does not get a second one.
 *
 * Purpose: Only one ranged attack per unit resolves each turn, so a duplicate would either be dropped downstream or
 * silently override the target the model chose.
 * When to use: After changes to how callers assemble `alreadyAttackingUnitIds`.
 * Expected outcome: No sweep-generated attack for a unit passed in as already attacking.
 * Exceptions: Skips when the seed cannot stage the scenario.
 */
function testSweepSkipsUnitsAlreadyAttacking(): void {
  withSeededGame('dedupe', () => {
    const staged = stageAdjacentEnemy('armor');
    if (!staged) {
      console.log('testSweepSkipsUnitsAlreadyAttacking: skip — seed lacks opponent armor with a free neighbour');
      return;
    }
    const result = collectTempoRuleAttacks({
      playerId: 'opponent',
      state: staged.state,
      alreadyAttackingUnitIds: new Set([staged.shooter.id]),
    });
    assert.ok(
      !result.rangedAttacks.some((r) => r.unitId === staged.shooter.id),
      'a unit that already has an attack must not receive a second one'
    );
  });
}

/**
 * Infantry has no strategic ranged attack, so the sweep must not invent one.
 *
 * Purpose: The prompt states infantry is melee only. A sweep that fired for everything would generate orders that
 * fail validation every turn and fill the drop-reason list.
 * When to use: After changes to the range check in the shared engagement helper.
 * Expected outcome: No ranged attack for infantry standing next to an enemy.
 * Exceptions: Skips when the seed cannot stage the scenario.
 */
function testSweepSkipsInfantry(): void {
  withSeededGame('infantry', () => {
    const staged = stageAdjacentEnemy('infantry');
    if (!staged) {
      console.log('testSweepSkipsInfantry: skip — seed lacks opponent infantry with a free neighbour');
      return;
    }
    const result = collectTempoRuleAttacks({
      playerId: 'opponent',
      state: staged.state,
      alreadyAttackingUnitIds: new Set<string>(),
    });
    assert.ok(
      !result.rangedAttacks.some((r) => r.unitId === staged.shooter.id),
      'infantry has no strategic ranged attack and must be skipped'
    );
  });
}

/**
 * The model keeps its agency: a target it chose itself survives, and nothing else fires for that unit.
 *
 * Purpose: The whole point of the sweep is to be a floor. If it could overwrite or shadow a model-chosen target, the
 * model's judgement would stop mattering and the opponent would always attack its nearest enemy. This covers the
 * cross-list case too — a standing-order air strike must not tag along behind a model-ordered ranged attack for the
 * same unit, since only one attack per unit resolves.
 * When to use: After any change to precedence in `mergeOpponentAttackOrders`.
 * Expected outcome: Exactly the model's row for that unit, with the model's target hex.
 * Exceptions: Skips when the seed cannot stage the scenario.
 */
function testModelOrderOutranksStandingOrderAndSweep(): void {
  withSeededGame('precedence', () => {
    const staged = stageAdjacentEnemy('armor');
    if (!staged) {
      console.log('testModelOrderOutranksStandingOrderAndSweep: skip — seed lacks opponent armor with a free neighbour');
      return;
    }
    const modelChosenTarget = staged.enemyH3;
    const standingChoseElsewhere = staged.shooter.h3Index;
    const merged = mergeCommanderAttackOrders({
      seatId: 'opponent',
      state: staged.state,
      standingOrderRanged: [{ unitId: staged.shooter.id, targetH3Index: standingChoseElsewhere }],
      standingOrderAirStrikes: [
        { unitId: staged.shooter.id, targetH3Index: standingChoseElsewhere, targetType: 'units' },
      ],
      modelRanged: [{ unitId: staged.shooter.id, targetH3Index: modelChosenTarget }],
      modelAirStrikes: [],
    });
    const own = merged.rangedAttacks.filter((r) => r.unitId === staged.shooter.id);
    assert.strictEqual(own.length, 1, 'the unit must end up with exactly one ranged attack');
    assert.strictEqual(own[0]!.targetH3Index, modelChosenTarget, 'the model target must win');
    assert.ok(
      !merged.airStrikes.some((s) => s.unitId === staged.shooter.id),
      'a standing-order air strike must not shadow a model-ordered ranged attack for the same unit'
    );
  });
}

function run(): void {
  testSweepFiresForUnitWithNoStandingOrder();
  testSweepRespectsHoldFire();
  testSweepSkipsUnitsAlreadyAttacking();
  testSweepSkipsInfantry();
  testModelOrderOutranksStandingOrderAndSweep();
  console.log('tempoRuleAttacks tests passed');
}

run();
