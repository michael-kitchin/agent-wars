/**
 * Tactical battles between the human and one other owner.
 * Run: `node dist/main/tacticalBattle/tacticalPartiesSeats.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { commitHumanTacticalDraftOrders } from '../gameActions/humanTacticalDraftCommit';
import { applyKnockout } from '../gameActions/knockoutConsequences';
import { ready } from '../gameActions';
import { dbGetAll, dbGetOne, dbRun } from '../gameDb';
import { listGameMaps } from '../gameMap/listGameMaps';
import { buildLatLngCoordinateMap } from '../mapData';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import { endTacticalBattleSession, startTacticalBattleForEnclosingHex } from './tacticalBattleSession';

/**
 * A regional map with at least three side groups.
 *
 * Purpose: These cases need a second AI seat and a home for Neutral's former units.
 * When to use: Before opening the temporary match.
 * Expected outcome: The map id and three group ids, or null when none is listed.
 * Exceptions: None.
 */
function threeGroupMap(): { id: string; sideGroupIds: string[] } | null {
  const map = listGameMaps().find((entry) => entry.id === 'western_asia_north' && entry.sideGroups.length >= 3)
    ?? listGameMaps().find((entry) => entry.sideGroups.length >= 3);
  if (!map) return null;
  return { id: map.id, sideGroupIds: map.sideGroups.slice(0, 3).map((group) => group.id) };
}

/**
 * One infantry of a player, with the hex it stands on.
 *
 * Purpose: Contested-hex setup should use a unit type that can take a tactical cell on land.
 * When to use: Before moving that unit onto another side's hex.
 * Expected outcome: The id and hex, or null when that player has no infantry.
 * Exceptions: None.
 */
function infantryAt(player: string): { id: string; h3Index: string } | undefined {
  return dbGetOne<{ id: string; h3Index: string }>(
    `SELECT id, h3_index AS h3Index FROM units WHERE player = ? AND unit_type = 'infantry' LIMIT 1`,
    [player]
  );
}

/**
 * Moves one unit onto a hex and opens planning.
 *
 * Purpose: `startTacticalBattleForEnclosingHex` only accepts a planning-phase contested hex.
 * When to use: After the match exists and before starting the battle.
 * Expected outcome: The unit's hex is `hex`, and the turn phase is planning.
 * Exceptions: None.
 */
function colocateForBattle(unitId: string, hex: string): void {
  dbRun(`UPDATE units SET h3_index = ? WHERE id = ?`, [hex, unitId]);
  dbRun(`UPDATE turn_state SET phase = 'planning' WHERE id = 1`);
}

/**
 * Puts the shooter on a footprint neighbor of a human sub-unit.
 *
 * Purpose: Tempo fire has to have a cell in range. Placement can leave the two sides farther apart than infantry range.
 * When to use: After the battle has started and before committing an empty human beat.
 * Expected outcome: The updated snapshot, the shooter id, and the cell it now occupies.
 * Exceptions: Throws when no human land sub-unit has a neighbor inside the footprint.
 */
function standShooterNextToHuman(
  battle: TacticalBattleSnapshot,
  shooterPlayer: string
): { battle: TacticalBattleSnapshot; shooterId: string; cell: string } {
  const footprint = new Set(battle.tacticalChildH3Indexes);
  const shooter = battle.subUnits.find(
    (unit) => unit.player === shooterPlayer && (unit.unitType === 'infantry' || unit.unitType === 'armor')
  );
  assert.ok(shooter);
  const human = battle.subUnits.find((unit) => {
    if (unit.player !== HUMAN_SEAT_ID) return false;
    if (unit.unitType !== 'infantry' && unit.unitType !== 'armor') return false;
    try {
      return gridDisk(unit.h3Index, 1).some((cell) => cell !== unit.h3Index && footprint.has(cell));
    } catch {
      return false;
    }
  });
  assert.ok(human);
  const cell = gridDisk(human.h3Index, 1).find((candidate) => candidate !== human.h3Index && footprint.has(candidate));
  assert.ok(cell);
  const next: TacticalBattleSnapshot = {
    ...battle,
    subUnits: battle.subUnits.map((unit) => (unit.id === shooter.id ? { ...unit, h3Index: cell } : unit)),
  };
  setActiveTacticalBattleSnapshotRef(next);
  return { battle: next, shooterId: shooter.id, cell };
}

test('a battle against the second AI seat records that seat', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'human', sideGroupId: map.sideGroupIds[0] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[2] },
  ];
  withSeatedTempGameDb('aw-tactical-party-', { gameMapId: map.id, seats }, () => {
    try {
      const human = infantryAt(HUMAN_SEAT_ID);
      const other = infantryAt(AI_SEAT_IDS[1]);
      assert.ok(human);
      assert.ok(other);
      colocateForBattle(other.id, human.h3Index);
      const started = startTacticalBattleForEnclosingHex(human.h3Index);
      assert.equal(started.success, true);
      assert.ok(started.battle);
      assert.equal(started.battle.opposingPartyId, AI_SEAT_IDS[1]);
    } finally {
      endTacticalBattleSession();
    }
  });
});

test('three owners in one hex are not a tactical battle', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'human', sideGroupId: map.sideGroupIds[0] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[2] },
  ];
  withSeatedTempGameDb('aw-tactical-three-', { gameMapId: map.id, seats }, () => {
    const human = infantryAt(HUMAN_SEAT_ID);
    const first = infantryAt(AI_SEAT_IDS[0]);
    const second = infantryAt(AI_SEAT_IDS[1]);
    assert.ok(human);
    assert.ok(first);
    assert.ok(second);
    colocateForBattle(first.id, human.h3Index);
    colocateForBattle(second.id, human.h3Index);
    const started = startTacticalBattleForEnclosingHex(human.h3Index);
    assert.equal(started.success, false);
    if (started.success) return;
    assert.equal(started.reason, 'Hex is not contested by exactly two sides.');
  });
});

test('Neutral holds and fires when it is the other party', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'human', sideGroupId: map.sideGroupIds[0] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[2] },
  ];
  withSeatedTempGameDb('aw-tactical-neutral-', { gameMapId: map.id, seats }, () => {
    try {
      const hexes = dbGetAll<{ h3_index: string }>('SELECT h3_index FROM hexes').map((row) => row.h3_index);
      applyKnockout(AI_SEAT_IDS[1], buildLatLngCoordinateMap(hexes));
      const human = infantryAt(HUMAN_SEAT_ID);
      const neutral = infantryAt(NEUTRAL_OWNER_ID);
      assert.ok(human);
      assert.ok(neutral);
      colocateForBattle(neutral.id, human.h3Index);
      const started = startTacticalBattleForEnclosingHex(human.h3Index);
      assert.equal(started.success, true);
      assert.ok(started.battle);
      assert.equal(started.battle.opposingPartyId, NEUTRAL_OWNER_ID);
      const placed = standShooterNextToHuman(started.battle, NEUTRAL_OWNER_ID);
      const committed = commitHumanTacticalDraftOrders({ movementOrders: [] });
      assert.equal(committed.success, true);
      if (!committed.success) return;
      const lines = committed.tacticalResolutionPlayback?.rangedResolutionShotLines ?? [];
      assert.ok(lines.some((line) => line.fromH3Index === placed.cell));
      const shooter = committed.tacticalBattle?.subUnits.find((unit) => unit.id === placed.shooterId);
      if (shooter) assert.equal(shooter.h3Index, placed.cell);
    } finally {
      endTacticalBattleSession();
    }
  });
});

test('a match with no human seat does not pause for melee', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'ai', sideGroupId: map.sideGroupIds[0] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1] },
  ];
  withSeatedTempGameDb('aw-tactical-observe-', { gameMapId: map.id, seats }, () => {
    const first = infantryAt(AI_SEAT_IDS[0]);
    const second = infantryAt(AI_SEAT_IDS[1]);
    assert.ok(first);
    assert.ok(second);
    dbRun(`UPDATE units SET h3_index = ? WHERE id = ?`, [first.h3Index, second.id]);
    const result = ready();
    assert.equal(result.success, true);
    assert.equal(result.awaitingMeleeDecision, undefined);
  });
});
