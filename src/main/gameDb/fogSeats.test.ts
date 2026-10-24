import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import {
  dbGetAll,
  dbRun,
  getGameStateForPlayer,
  getScenarioHomeRegionHexes,
  getSeatRoster,
  refreshFogOfWarIntelFromCurrentState,
} from '../gameDb';
import { listGameMaps } from '../gameMap/listGameMaps';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';

/**
 * A regional map with at least three side groups.
 *
 * Purpose: Fog tests need three homes read from an installed pack.
 * When to use: Before starting the match in this file.
 * Expected outcome: The map id and three group ids, or null when no such pack is listed.
 * Exceptions: None.
 */
function threeGroupMap(): { id: string; sideGroupIds: string[] } | null {
  const map = listGameMaps().find((entry) => entry.id === 'western_asia_north' && entry.sideGroups.length >= 3)
    ?? listGameMaps().find((entry) => entry.sideGroups.length >= 3);
  if (!map) return null;
  return { id: map.id, sideGroupIds: map.sideGroups.slice(0, 3).map((group) => group.id) };
}

test('each seat keeps its own fog', (t) => {
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
  withSeatedTempGameDb('aw-fog-seats-', { gameMapId: map.id, fogOfWarEnabled: true, seats }, () => {
    const roster = getSeatRoster();
    const intelSeats = new Set(
      dbGetAll<{ player_id: string }>('SELECT DISTINCT player_id FROM player_hex_intel').map((row) => row.player_id)
    );
    for (const seat of roster) assert.equal(intelSeats.has(seat.seatId), true, seat.seatId);
    const viewer = AI_SEAT_IDS[1];
    const state = getGameStateForPlayer(viewer);
    const ownIds = dbGetAll<{ id: string }>('SELECT id FROM units WHERE player = ?', [viewer]).map((row) => row.id);
    assert.ok(ownIds.length > 0);
    for (const id of ownIds) assert.equal(state.units.some((unit) => unit.id === id), true, id);
    const home = getScenarioHomeRegionHexes(roster.find((seat) => seat.seatId === viewer)?.homeRegion ?? '');
    const visible = new Set(state.visibleHexes ?? []);
    assert.ok(home.length > 0);
    for (const hex of home) assert.equal(visible.has(hex), true, hex);
  });
});

test('turning fog off clears new-contact keys', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = map.sideGroupIds.map((sideGroupId) => ({ kind: 'ai' as const, sideGroupId }));
  withSeatedTempGameDb('aw-fog-off-', { gameMapId: map.id, fogOfWarEnabled: false, seats }, () => {
    for (const seat of getSeatRoster()) {
      dbRun('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [`fog_new_contacts_${seat.seatId}`, '[]']);
    }
    refreshFogOfWarIntelFromCurrentState();
    const keys = dbGetAll<{ key: string }>("SELECT key FROM game_config WHERE key LIKE 'fog_new_contacts_%'");
    assert.equal(keys.length, 0);
  });
});
