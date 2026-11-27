/**
 * World-map orders at the next Ready when a side is listed: from a plan stored before the change, and with no plan.
 *
 * Purpose: A side listed after a plan was stored, as in a battle, must not take that plan's automatic fire, and a turn
 * with no consult must not fire at it either.
 * When to use: `node dist/main/openRouter/holdAutomaticFireAgainstStoredPlan.test.js`.
 * Expected outcome: Throws on failure.
 * Exceptions: Skips when no map with three side groups is listed.
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { gridDisk } from 'h3-js';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { playerIdCodeFor } from '../../shared/unitIds';
import { dbRun, getGameState, getGameStateForPlayer, getSeatRoster } from '../gameDb';
import { listGameMaps } from '../gameMap/listGameMaps';
import { withSeatedTempGameDbAsync } from '../testSupport/withSeatedTempGameDb';
import { mergeCommanderAttackOrders } from '../tools/tempoRuleAttacks';
import { afterResolution } from './afterResolution';
import { launchCommanderConsult, resetCommanderPool, waitForSeatsSettled } from './commanderPool';
import { gatherCommanderOrdersForReady } from './commanderReadyGather';
import { emptyConsultOutcome } from './commanderPoolSupport';
import { applyHoldAutomaticFireAgainstChoice } from './holdAutomaticFireAgainstApply';
import { storeConsultedPlan } from './holdAutomaticFireAgainstStoredPlan';

const [OWN, LISTED, THIRD] = AI_SEAT_IDS;
const SHOOTER = 'own-armor';

type Attack = { unitId: string; targetH3Index: string };

/**
 * The hexes of one case: the shooter's, and two adjacent ones.
 *
 * Contract: All three are on the loaded map.
 * When to use: Placing units.
 * Expected outcome: Both targets are inside armor range.
 * Exceptions: None.
 */
type Hexes = { own: string; listed: string; third: string };

/**
 * One AI seat with a model id that is never called.
 *
 * Purpose: The pool starts a consult only for a seat with a model. Ready in these cases does not consult.
 * When to use: Building the match.
 * Expected outcome: A new-game seat row.
 * Exceptions: None.
 */
function seatInput(sideGroupId: string): NewGameSeatInput {
  return {
    kind: 'ai',
    sideGroupId,
    commander: { modelId: 'test-model', reasoningEffort: null, providerSort: 'throughput', doctrineChoice: 'balanced', nickname: '' },
  };
}

/**
 * Inserts one unit.
 *
 * Purpose: The cases place their own units.
 * When to use: After the match units are cleared.
 * Expected outcome: A unit of `owner` on the hex.
 * Exceptions: None.
 */
function seedUnit(id: string, owner: string, unitType: string, h3Index: string): void {
  dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, owner, unitType, h3Index]);
}

/**
 * A hex with two neighbours on the map.
 *
 * Purpose: Both targets must be in armor range.
 * When to use: Once per case.
 * Expected outcome: The three hexes.
 * Exceptions: Throws when the map has none.
 */
function adjacentHexes(): Hexes {
  const onMap = new Set(getGameState().hexes.map((hex) => hex.h3Index));
  for (const own of onMap) {
    const near = gridDisk(own, 1).filter((hex) => hex !== own && onMap.has(hex));
    if (near.length >= 2) return { own, listed: near[0], third: near[1] };
  }
  throw new Error('the map has no hex with two neighbours');
}

/**
 * One temporary match with the shooter and one listed-side unit.
 *
 * Purpose: Every case starts the same way.
 * When to use: Wrapping a case.
 * Expected outcome: Runs the case, or skips the test.
 * Exceptions: Propagates the case's failure.
 */
async function withMatch(t: TestContext, runCase: (hexes: Hexes) => Promise<void>): Promise<void> {
  const map = listGameMaps().find((entry) => entry.sideGroups.length >= 3);
  if (!map) {
    t.skip('no map with three side groups is listed');
    return;
  }
  const seats = map.sideGroups.slice(0, 3).map((group) => seatInput(group.id));
  await withSeatedTempGameDbAsync('aw-automatic-fire-stored-plan-', { gameMapId: map.id, fogOfWarEnabled: false, seats }, async () => {
    dbRun('DELETE FROM units');
    const hexes = adjacentHexes();
    seedUnit(SHOOTER, OWN, 'armor', hexes.own);
    seedUnit('listed-infantry', LISTED, 'infantry', hexes.listed);
    await runCase(hexes);
  });
}

/**
 * Merges one reply's attacks without storing them, as for a reply the consult then discards.
 *
 * Purpose: A merge records which rows the engine chose before anything is stored.
 * When to use: Through `storePlan`, and alone for a cancelled or superseded reply.
 * Expected outcome: The merged attacks. The pending plan is untouched.
 * Exceptions: None.
 */
function mergeReply(modelRanged: readonly Attack[], standingOrderRanged: readonly Attack[] = []): ReturnType<typeof mergeCommanderAttackOrders> {
  return mergeCommanderAttackOrders({
    seatId: OWN,
    state: getGameStateForPlayer(OWN),
    tacticalBattle: null,
    standingOrderRanged,
    standingOrderAirStrikes: [],
    modelRanged,
    modelAirStrikes: [],
  });
}

/**
 * Merges one reply's attacks and stores them as the seat's pending plan, as a world-map consult does.
 *
 * Purpose: The cases start from a real stored plan.
 * When to use: Before the list changes.
 * Expected outcome: The stored ranged rows.
 * Exceptions: None.
 */
function storePlan(modelRanged: readonly Attack[], standingOrderRanged: readonly Attack[] = []): Attack[] {
  const merged = mergeReply(modelRanged, standingOrderRanged);
  storeConsultedPlan(OWN, {
    movementOrders: [],
    rangedOrders: merged.rangedAttacks,
    airStrikeOrders: merged.airStrikes,
    ferryOrders: [],
    embarkOrders: [],
    missileLaunchOrders: [],
  });
  return merged.rangedAttacks;
}

/**
 * Lists the listed side for the shooter's seat, as a battle reply does.
 *
 * Purpose: A battle is when a list changes while a world-map plan is already stored.
 * When to use: After the plan of a case is stored.
 * Expected outcome: The side is listed and nothing is dropped.
 * Exceptions: Fails the test on a drop reason.
 */
function listSideInABattle(): void {
  const battle = { battleId: 'battle-1', tacticalTurnNumber: 1 } as TacticalBattleSnapshot;
  const applied = applyHoldAutomaticFireAgainstChoice({
    seatId: OWN,
    choice: { kind: 'replace', sideCodes: [playerIdCodeFor(LISTED)] },
    turnNumber: 1,
    battle,
  });
  assert.deepEqual(applied.dropReasons, []);
}

/**
 * The shooter seat's ranged attacks at the next Ready.
 *
 * Purpose: The cases assert what is played, not what is stored.
 * When to use: At the end of a case.
 * Expected outcome: The ranged rows Ready gathers, with no model call.
 * Exceptions: None.
 */
async function playedRanged(): Promise<Attack[]> {
  const orders = await gatherCommanderOrdersForReady({
    useEventDriven: true,
    turnNumber: 2,
    aiPlanningRunEnabled: false,
    hasKey: false,
    getGameStateForPlayer: (seatId) => getGameStateForPlayer(seatId),
  });
  return (orders.get(OWN)?.rangedOrders ?? []).map(({ unitId, targetH3Index }) => ({ unitId, targetH3Index }));
}

test('a stored automatic attack on a side listed afterwards is not played', async (t) => {
  await withMatch(t, async (hexes) => {
    assert.deepEqual(storePlan([]), [{ unitId: SHOOTER, targetH3Index: hexes.listed }]);
    listSideInABattle();
    assert.deepEqual(await playedRanged(), []);
  });
});

test('the freed unit fires at a side that is not listed', async (t) => {
  await withMatch(t, async (hexes) => {
    storePlan([]);
    seedUnit('third-infantry', THIRD, 'infantry', hexes.third);
    listSideInABattle();
    assert.deepEqual(await playedRanged(), [{ unitId: SHOOTER, targetH3Index: hexes.third }]);
  });
});

test('a stored attack the model ordered on the listed side is played', async (t) => {
  await withMatch(t, async (hexes) => {
    storePlan([{ unitId: SHOOTER, targetH3Index: hexes.listed }]);
    listSideInABattle();
    assert.deepEqual(await playedRanged(), [{ unitId: SHOOTER, targetH3Index: hexes.listed }]);
  });
});

test('a stored pursue shot on the listed side is played', async (t) => {
  await withMatch(t, async (hexes) => {
    dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, status, created_turn, origin_hex)
       VALUES (?, ?, 'pursue', ?, 'active', 1, ?)`,
      [OWN, SHOOTER, JSON.stringify({ targetUnitId: 'listed-infantry' }), hexes.own]
    );
    storePlan([], [{ unitId: SHOOTER, targetH3Index: hexes.listed }]);
    listSideInABattle();
    assert.deepEqual(await playedRanged(), [{ unitId: SHOOTER, targetH3Index: hexes.listed }]);
  });
});

test('a stored DEFEND shot on the listed side is not played', async (t) => {
  await withMatch(t, async (hexes) => {
    dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, status, created_turn, origin_hex)
       VALUES (?, ?, 'defend', ?, 'active', 1, ?)`,
      [OWN, SHOOTER, JSON.stringify({ postH3Index: hexes.own }), hexes.own]
    );
    storePlan([], [{ unitId: SHOOTER, targetH3Index: hexes.listed }]);
    listSideInABattle();
    assert.deepEqual(await playedRanged(), []);
  });
});

test('a swept shot of a unit with a pursue order that did not fire is not played', async (t) => {
  await withMatch(t, async (hexes) => {
    dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, status, created_turn, origin_hex)
       VALUES (?, ?, 'pursue', ?, 'active', 1, ?)`,
      [OWN, SHOOTER, JSON.stringify({ targetUnitId: 'far-unit' }), hexes.own]
    );
    assert.deepEqual(storePlan([]), [{ unitId: SHOOTER, targetH3Index: hexes.listed }]);
    listSideInABattle();
    assert.deepEqual(await playedRanged(), []);
  });
});

test('a reply that was never stored does not make a stored automatic attack look ordered', async (t) => {
  await withMatch(t, async (hexes) => {
    storePlan([]);
    mergeReply([{ unitId: SHOOTER, targetH3Index: hexes.listed }]);
    listSideInABattle();
    assert.deepEqual(await playedRanged(), []);
  });
});

test('a reply that was never stored does not make a stored ordered attack look automatic', async (t) => {
  await withMatch(t, async (hexes) => {
    storePlan([{ unitId: SHOOTER, targetH3Index: hexes.listed }]);
    mergeReply([]);
    listSideInABattle();
    assert.deepEqual(await playedRanged(), [{ unitId: SHOOTER, targetH3Index: hexes.listed }]);
  });
});

test('a seat with no stored plan takes no automatic shot at a listed side', async (t) => {
  await withMatch(t, async (hexes) => {
    assert.deepEqual(await playedRanged(), [{ unitId: SHOOTER, targetH3Index: hexes.listed }]);
    listSideInABattle();
    assert.deepEqual(await playedRanged(), []);
  });
});

test('a plan the commander pool stores can be re-aimed when a side is listed', async (t) => {
  await withMatch(t, async () => {
    resetCommanderPool(getSeatRoster());
    try {
      launchCommanderConsult(OWN, 'strategic', null, async () => ({
        ...emptyConsultOutcome(),
        finished: true,
        rangedOrders: mergeReply([]).rangedAttacks,
        modelId: 'test-model',
      }));
      await waitForSeatsSettled([OWN], 5_000);
      for (let step = 0; step < 12; step += 1) await Promise.resolve();
      listSideInABattle();
      assert.deepEqual(await playedRanged(), []);
    } finally {
      resetCommanderPool([]);
    }
  });
});

test('a plan stored after resolution can be re-aimed when a side is listed', async (t) => {
  await withMatch(t, async () => {
    const stored = await afterResolution(
      getGameState(),
      { success: true },
      {
        modelId: 'test-model',
        enabledToolNames: [],
        hasKey: () => true,
        requestOrders: async () => ({ success: true, orders: [], rangedAttacks: mergeReply([]).rangedAttacks }),
      },
      OWN
    );
    assert.equal(stored.consulted, true);
    listSideInABattle();
    assert.deepEqual(await playedRanged(), []);
  });
});
