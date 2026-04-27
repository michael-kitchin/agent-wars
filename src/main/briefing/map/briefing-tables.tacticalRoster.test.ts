/**
 * Tactical opponent roster markdown includes persisted standing orders from SQLite.
 *
 * Purpose: Regression guard for `renderTacticalOpponentRosterMarkdown` wiring to `getStandingOrderForUnit`.
 * When to use: `npm test` after `build:main`.
 * Expected outcome: A `hold_fire` row in `standing_orders` appears as `HOLD_FIRE` in the roster table body.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { closeGameDatabaseForTests, openGameDatabaseAtPathForTests, resetGameForNewMatch, dbRun } from '../../gameDb';
import type { GameStateSnapshot } from '../../gameDb';
import { tacticalRes1Cell, tacticalRes4UnderRes1Corner } from '../../tacticalBattle/testSupport/tacticalRes4HexFixtures';
import { initTacticalCoordinateRegistry } from './hex-coordinates';
import { renderTacticalOpponentRosterMarkdown } from './briefing-tables';

test('renderTacticalOpponentRosterMarkdown shows opponent standing order from DB', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-brief-roster-'));
  const dbPath = path.join(dir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const res1 = tacticalRes1Cell(12, 34);
    const res4Opp = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
    const res4Hum = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.04 });
    const battleId = 'brief-roster-so';
    initTacticalCoordinateRegistry(battleId, res1);
    const oppId = 'opp-roster-unit-1';
    dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES ('opponent', ?, 'hold_fire', '{}', NULL, 'holding', 1, '[0,0]')`,
      [oppId]
    );
    const state: GameStateSnapshot = {
      turnNumber: 1,
      phase: 'planning',
      hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
      units: [
        { id: 'hum-roster-1', player: 'human', unitType: 'infantry', h3Index: res4Hum },
        { id: oppId, player: 'opponent', unitType: 'armor', h3Index: res4Opp },
      ],
      pendingOrders: [],
    };
    const md = renderTacticalOpponentRosterMarkdown(state, { mode: 'tactical', battleId });
    assert.match(md, /HOLD_FIRE/);
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
