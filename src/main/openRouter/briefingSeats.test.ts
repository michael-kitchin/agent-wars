/**
 * Briefings computed for a chosen seat.
 * Run: `node dist/main/openRouter/briefingSeats.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { applyKnockout } from '../gameActions/knockoutConsequences';
import { formatBriefing } from '../briefingFormatter';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { buildLatLngCoordinateMap } from '../mapData';
import {
  dbGetOne,
  dbRun,
  getGameState,
  getGameStateForPlayer,
} from '../gameDb';
import { listGameMaps } from '../gameMap/listGameMaps';
import type { PrecomputationResult } from '../precomputation';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { AI_SEAT_IDS, NEUTRAL_OWNER_ID, type AiSeatId, type SeatId } from '../../shared/seatIds';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';

const EMPTY_PRECOMPUTED: PrecomputationResult = { unitAssessments: [], hexAssessments: [] };

/**
 * The western Asia north pack when it has enough side groups.
 *
 * Purpose: Briefing seat tests need real adjacent hexes and real side groups.
 * When to use: Before each case in this file.
 * Expected outcome: Map id plus the first `count` side-group ids, or null when the pack is missing.
 * Exceptions: None.
 */
function regionalMap(count: number): { id: string; sideGroupIds: string[] } | null {
  const map = listGameMaps().find((entry) => entry.id === 'western_asia_north' && entry.sideGroups.length >= count);
  if (!map) return null;
  return { id: map.id, sideGroupIds: map.sideGroups.slice(0, count).map((group) => group.id) };
}

/**
 * Moves one infantry of `player` onto `h3` and returns its id.
 *
 * Purpose: Map markers and Best Options need a known unit on a known hex.
 * When to use: After the match has seeded units.
 * Expected outcome: That infantry's hex is `h3`.
 * Exceptions: Asserts when the seat has no infantry.
 */
function placeInfantry(player: string, h3: string): string {
  const row = dbGetOne<{ id: string }>('SELECT id FROM units WHERE player = ? AND unit_type = ? LIMIT 1', [
    player,
    'infantry',
  ]);
  assert.ok(row, `${player} should have an infantry unit`);
  dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [h3, row.id]);
  return row.id;
}

/**
 * Three land hexes where the second and third neighbor the first.
 *
 * Purpose: A commander infantry must be able to attack both enemies in one step.
 * When to use: After `getGameState` on a loaded regional map.
 * Expected outcome: `[own, enemyA, enemyB]`, or null when no land hex has two land neighbors.
 * Exceptions: None. `gridDisk` errors skip that center.
 */
function adjacentLandTrio(hexes: readonly { h3Index: string; terrain: string }[]): [string, string, string] | null {
  const land = new Set(
    hexes
      .filter((hex) => hex.terrain !== 'ocean' && hex.terrain !== 'water' && hex.terrain !== 'arctic_ocean')
      .map((hex) => hex.h3Index)
  );
  for (const center of land) {
    let neighbors: string[] = [];
    try {
      neighbors = gridDisk(center, 1).filter((hex) => hex !== center && land.has(hex));
    } catch {
      continue;
    }
    if (neighbors.length >= 2) return [center, neighbors[0]!, neighbors[1]!];
  }
  return null;
}

/**
 * Overlay character drawn under a briefing hex code.
 *
 * Purpose: `*` and `!` are the second character of the map cell under that code.
 * When to use: After `formatBriefing`.
 * Expected outcome: The overlay, or null when the code is not in the fenced map.
 * Exceptions: None.
 */
function overlayUnderCode(briefing: string, code: string): string | null {
  const fence = briefing.split('```');
  const map = fence[1] ?? '';
  const lines = map.split('\n');
  for (let i = 0; i < lines.length - 1; i += 1) {
    const line = lines[i] ?? '';
    let at = line.indexOf(code);
    while (at >= 0) {
      const before = at === 0 || line[at - 1] === ' ';
      const after = at + code.length === line.length || line[at + code.length] === ' ';
      if (before && after) return (lines[i + 1] ?? '')[at + 1] ?? null;
      at = line.indexOf(code, at + 1);
    }
  }
  return null;
}

/**
 * Briefing markdown for one seat with no standing-order or memory text.
 *
 * Purpose: The map and Best Options sections are what these cases lock.
 * When to use: After units have been moved.
 * Expected outcome: The strategic briefing string for that seat's fog view.
 * Exceptions: None.
 */
function briefingFor(seatId: SeatId): string {
  const state = getGameStateForPlayer(seatId);
  return formatBriefing(state, EMPTY_PRECOMPUTED, '', '');
}

test('a briefing marks that seat with stars and every other seat as an enemy', (t) => {
  const map = regionalMap(3);
  if (!map) {
    t.skip('western_asia_north is not extracted');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'human', sideGroupId: map.sideGroupIds[0]! },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1]! },
    { kind: 'ai', sideGroupId: map.sideGroupIds[2]! },
  ];
  withSeatedTempGameDb('aw-brief-seats-', { gameMapId: map.id, seats, fogOfWarEnabled: false }, () => {
    const trio = adjacentLandTrio(getGameState().hexes);
    assert.ok(trio, 'the map should have a land hex with two land neighbors');
    const [ownHex, humanHex, otherHex] = trio;
    placeInfantry(AI_SEAT_IDS[1], ownHex);
    placeInfantry('human', humanHex);
    placeInfantry(AI_SEAT_IDS[0], otherHex);
    ensureStrategicCoordinateRegistryInitialized();
    const ctx = { mode: 'strategic' as const };
    const ownCode = h3ToCode(ownHex, ctx);
    const humanCode = h3ToCode(humanHex, ctx);
    const otherCode = h3ToCode(otherHex, ctx);

    const asSecond = briefingFor(AI_SEAT_IDS[1]);
    assert.equal(overlayUnderCode(asSecond, ownCode), '*');
    assert.equal(overlayUnderCode(asSecond, humanCode), '!');
    assert.equal(overlayUnderCode(asSecond, otherCode), '!');
    const options = asSecond.split('Best Options This Turn')[1] ?? '';
    assert.ok(options.includes(humanCode), 'Best Options should attack the human hex');
    assert.ok(options.includes(otherCode), 'Best Options should attack the other AI hex');

    const asFirst = briefingFor(AI_SEAT_IDS[0]);
    assert.equal(overlayUnderCode(asFirst, otherHex && otherCode), '*');
    assert.equal(overlayUnderCode(asFirst, ownCode), '!');
  });
});

test('neutral units are enemies on every remaining seat\'s map', (t) => {
  const map = regionalMap(4);
  if (!map) {
    t.skip('western_asia_north is not extracted');
    return;
  }
  const seats: NewGameSeatInput[] = map.sideGroupIds.map((sideGroupId) => ({ kind: 'ai' as const, sideGroupId }));
  withSeatedTempGameDb('aw-brief-neutral-', { gameMapId: map.id, seats, fogOfWarEnabled: false }, () => {
    const state = getGameState();
    applyKnockout(AI_SEAT_IDS[2], buildLatLngCoordinateMap(state.hexes.map((hex) => hex.h3Index)));
    const neutral = dbGetOne<{ h3Index: string }>(
      'SELECT h3_index AS h3Index FROM units WHERE player = ? AND unit_type = ? LIMIT 1',
      [NEUTRAL_OWNER_ID, 'infantry']
    );
    assert.ok(neutral, 'knockout should leave a neutral infantry unit');
    ensureStrategicCoordinateRegistryInitialized();
    const code = h3ToCode(neutral.h3Index, { mode: 'strategic' });
    const viewers: AiSeatId[] = [AI_SEAT_IDS[0], AI_SEAT_IDS[1], AI_SEAT_IDS[3]];
    for (const seatId of viewers) {
      assert.equal(overlayUnderCode(briefingFor(seatId), code), '!', `${seatId} should mark neutral units with !`);
    }
  });
});
