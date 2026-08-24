/**
 * Air ferry sweep — the contracts that decide whether an idle squadron flies toward the front.
 * Run with: node dist/main/tools/tempoRuleAirFerry.test.js
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
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { safeGridHexDistance } from './assessUnitProximity';
import { collectTempoRuleFerries } from './tempoRuleAirFerry';

/**
 * A rear-based opponent squadron, a forward friendly airport, and an enemy only the forward base can reach.
 *
 * Purpose: Every case here needs the same geometry — one squadron that cannot strike anything from where it sits and
 * exactly one better base to fly to — and only varies what is layered on top (a hold_fire row, a prior order).
 * When to use: Start of each test in this file, inside an open temp database.
 * Expected outcome: The squadron, the base it should pick, and the live state; null when the map cannot supply two
 * airports inside ferry range with room to plant an enemy at the right distance.
 * Exceptions: None.
 */
function stageIdleSquadron(): {
  squadron: GameStateSnapshot['units'][number];
  forwardBase: string;
  state: GameStateSnapshot;
} | null {
  const seeded = getGameState();
  const squadron = seeded.units.find((u) => u.player === 'opponent' && u.unitType === 'air');
  if (!squadron) return null;
  const hexSet = new Set(seeded.hexes.map((h) => h.h3Index));
  const occupied = new Set(seeded.units.map((u) => u.h3Index));
  const airports = (seeded.res1Infrastructure ?? []).filter((i) => i.airportCount > 0).map((i) => i.h3Index);

  for (const homeBase of airports) {
    for (const forwardBase of airports) {
      if (forwardBase === homeBase) continue;
      const hop = safeGridHexDistance(homeBase, forwardBase);
      if (hop === null || hop > AIR_FERRY_RANGE_HEXES) continue;
      // The enemy must be unreachable from home and reachable from forward, otherwise the sweep is
      // correct to leave the squadron where it is and the case proves nothing.
      const enemyH3 = gridDisk(forwardBase, 1).find((h3) => {
        if (h3 === forwardBase || !hexSet.has(h3) || occupied.has(h3)) return false;
        const fromForward = safeGridHexDistance(forwardBase, h3);
        const fromHome = safeGridHexDistance(homeBase, h3);
        return fromForward !== null && fromForward <= AIR_STRIKE_RANGE_HEXES && fromHome !== null && fromHome > AIR_STRIKE_RANGE_HEXES;
      });
      if (!enemyH3) continue;
      for (const base of [homeBase, forwardBase]) {
        dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [base, 'opponent']);
      }
      dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [homeBase, squadron.id]);
      dbRun(
        `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, 'human', 'infantry', ?, 96)`,
        ['human-ferry-target', enemyH3]
      );
      const state = getGameState();
      const moved = state.units.find((u) => u.id === squadron.id);
      if (!moved) return null;
      return { squadron: moved, forwardBase, state };
    }
  }
  return null;
}

/**
 * Runs `body` against a freshly seeded temp database so cases cannot leak control or standing orders into each other.
 *
 * Purpose: Each case rewrites hex control and unit positions; sharing one database would make results order-dependent.
 * When to use: Wrapping every test in this file.
 * Expected outcome: The database is closed even when an assertion throws.
 * Exceptions: Propagates whatever `body` throws.
 */
function withSeededGame(label: string, body: () => void): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `aw-ferry-${label}-`));
  try {
    openGameDatabaseAtPathForTests(path.join(tempDir, 't.sqlite'));
    resetGameForNewMatch();
    body();
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * The reason this module exists: a squadron with nothing in strike range flies to the base that has something.
 *
 * Purpose: A captured strategic turn left all 24 opponent squadrons parked at home with ferry destinations listed and
 * no ferry orders issued. An idle squadron must reposition without waiting for the model to notice it.
 * When to use: After changes to `collectTempoRuleFerries` or its candidate ranking.
 * Expected outcome: One ferry order for the squadron, aimed at the forward base.
 * Exceptions: Skips when the map cannot supply the staged geometry.
 */
function testSweepFerriesIdleSquadronForward(): void {
  withSeededGame('forward', () => {
    const staged = stageIdleSquadron();
    if (!staged) {
      console.log('testSweepFerriesIdleSquadronForward: skip — map lacks two airports in ferry range with a plantable enemy');
      return;
    }
    const orders = collectTempoRuleFerries({
      playerId: 'opponent',
      state: staged.state,
      unavailableAirUnitIds: new Set<string>(),
    });
    const order = orders.find((f) => f.unitId === staged.squadron.id);
    assert.ok(order, 'an idle squadron with a closer friendly airport must be ferried forward');
    assert.strictEqual(order!.destinationH3Index, staged.forwardBase);
  });
}

/**
 * A squadron that already has a strike or a ferry this turn is left alone.
 *
 * Purpose: Resolution drops a ferry for any unit that also strikes, and applies only one ferry per unit, so a sweep
 * that ignored the claimed set would either waste the squadron's turn or override the model's own choice. This is the
 * essential failure case for the feature.
 * When to use: After changes to how callers assemble `unavailableAirUnitIds`.
 * Expected outcome: No sweep-generated ferry for a squadron passed in as unavailable.
 * Exceptions: Skips when the map cannot supply the staged geometry.
 */
function testSweepSkipsClaimedSquadrons(): void {
  withSeededGame('claimed', () => {
    const staged = stageIdleSquadron();
    if (!staged) {
      console.log('testSweepSkipsClaimedSquadrons: skip — map lacks two airports in ferry range with a plantable enemy');
      return;
    }
    const orders = collectTempoRuleFerries({
      playerId: 'opponent',
      state: staged.state,
      unavailableAirUnitIds: new Set([staged.squadron.id]),
    });
    assert.ok(
      !orders.some((f) => f.unitId === staged.squadron.id),
      'a squadron that already has a strike or ferry must not receive a second order'
    );
  });
}

/**
 * A hold_fire standing order still keeps the squadron on the ground.
 *
 * Purpose: hold_fire is the only way to tell a unit to stay out of the fight; a sweep that flew it to the front line
 * anyway would remove that control for air entirely.
 * When to use: After changes to how the sweep reads standing orders.
 * Expected outcome: No ferry for the squadron that flies forward in the happy-path case above.
 * Exceptions: Skips when the map cannot supply the staged geometry.
 */
function testSweepRespectsHoldFire(): void {
  withSeededGame('holdfire', () => {
    const staged = stageIdleSquadron();
    if (!staged) {
      console.log('testSweepRespectsHoldFire: skip — map lacks two airports in ferry range with a plantable enemy');
      return;
    }
    dbRun(
      `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'opponent',
        staged.squadron.id,
        'hold_fire',
        JSON.stringify({ type: 'hold_fire' }),
        null,
        'holding',
        staged.state.turnNumber,
        JSON.stringify(cellToLatLng(staged.squadron.h3Index)),
      ]
    );
    const orders = collectTempoRuleFerries({
      playerId: 'opponent',
      state: staged.state,
      unavailableAirUnitIds: new Set<string>(),
    });
    assert.ok(
      !orders.some((f) => f.unitId === staged.squadron.id),
      'hold_fire must suppress the ferry sweep for that squadron'
    );
  });
}

/**
 * A squadron already within strike range stays on its own base.
 *
 * Purpose: The sweep exists to give idle air a fight, not to shuffle air that already has one. Flying a squadron away
 * from a target it can hit this turn would cost the tempo the attack sweep just bought.
 * When to use: After changes to the strike-range gate.
 * Expected outcome: No ferry for a squadron sitting next to an enemy.
 * Exceptions: Skips when the map cannot supply the staged geometry.
 */
function testSweepLeavesSquadronThatCanAlreadyStrike(): void {
  withSeededGame('inrange', () => {
    const staged = stageIdleSquadron();
    if (!staged) {
      console.log('testSweepLeavesSquadronThatCanAlreadyStrike: skip — map lacks two airports in ferry range with a plantable enemy');
      return;
    }
    const adjacent = gridDisk(staged.squadron.h3Index, 1).find(
      (h3) => h3 !== staged.squadron.h3Index && safeGridHexDistance(staged.squadron.h3Index, h3) === 1
    );
    if (!adjacent) {
      console.log('testSweepLeavesSquadronThatCanAlreadyStrike: skip — no measurable neighbour of the home base');
      return;
    }
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, 'human', 'infantry', ?, 95)`,
      ['human-ferry-near', adjacent]
    );
    const orders = collectTempoRuleFerries({
      playerId: 'opponent',
      state: getGameState(),
      unavailableAirUnitIds: new Set<string>(),
    });
    assert.ok(
      !orders.some((f) => f.unitId === staged.squadron.id),
      'a squadron with an enemy inside strike range must stay where it is'
    );
  });
}

function run(): void {
  testSweepFerriesIdleSquadronForward();
  testSweepSkipsClaimedSquadrons();
  testSweepRespectsHoldFire();
  testSweepLeavesSquadronThatCanAlreadyStrike();
  console.log('tempoRuleAirFerry tests passed');
}

run();
