/**
 * Contracts for the battle map tool and the rules tool.
 *
 * Purpose: A listed fight's odds and a cropped map still leave the model a way to ask.
 * When to use: `node dist/main/tools/referenceTools.test.js` after `npm run build:main`.
 * Expected outcome: Weather text, unknown topics, and map radius checks match the tool results.
 * Exceptions: Assertion failures.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { cellToChildren, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import { closeGameDatabaseForTests, getGameState, openGameDatabaseAtPathForTests, resetGameForNewMatch } from '../gameDb';
import { buildLatLngCoordinateMap } from '../mapData';
import {
  ensureStrategicCoordinateRegistryInitialized,
  getHexCodeForContext,
  initTacticalCoordinateRegistry,
  listStrategicH3Indexes,
} from '../briefing/map/hexCoordinates';
import { tacticalParentCell, tacticalUnderCorner } from '../tacticalBattle/testSupport/tacticalHexFixtures';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { buildSystemPromptForTools } from '../openRouter/openRouterBuildSystemPrompt';
import { getToolNamesForEnabledGroups } from '../openRouter/openRouterToolGroups';
import { RULES_POINTER_LINE, executeReferenceTool } from './referenceTools';

const emptyState = { hexes: [], units: [], phase: 'planning', turnNumber: 1, pendingOrders: [] } as unknown as GameStateSnapshot;

/**
 * A one-cell battle on a real res4 child, with a coordinate resolver for that footprint.
 *
 * Purpose: `get_map` needs a footprint, a registry code, and a resolver that agrees with the registry.
 * When to use: The map cases in this file.
 * Expected outcome: The center code resolves back to the occupied cell.
 * Exceptions: None.
 */
function oneCellBattle(): {
  battle: TacticalBattleSnapshot;
  state: GameStateSnapshot;
  center: string;
  resolveToH3: (lat: number, lng: number) => string | undefined;
} {
  const parent = tacticalParentCell(12, 34);
  const centerH3 = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
  const footprint = [...cellToChildren(parent, 4)];
  const battle: TacticalBattleSnapshot = {
    battleId: 'ref-tools-map',
    enclosingStrategicH3Index: parent,
    tacticalChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [],
  };
  initTacticalCoordinateRegistry(battle.battleId, parent);
  const center = getHexCodeForContext(centerH3, { mode: 'tactical', battleId: battle.battleId });
  assert.ok(center, 'center cell should have a tactical code');
  const { resolveToH3 } = buildLatLngCoordinateMap(footprint);
  return {
    battle,
    state: { ...emptyState, hexes: footprint.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })) },
    center: center!,
    resolveToH3,
  };
}

test('rules weather in a battle omits the strategic ferry sentence', () => {
  const result = executeReferenceTool({
    toolName: 'rules',
    execArgs: { topic: 'weather' },
    state: emptyState,
    coordinateContext: { mode: 'tactical', battleId: 'ref-weather' },
    tacticalBattle: undefined,
    resolveToH3: () => undefined,
  });
  assert.equal(result.status, 'ok');
  const text = String(result.text);
  assert.match(text, /Weather bonus is on/);
  assert.doesNotMatch(text, /strategic ferry/);
});

test('rules rejects an unknown topic and lists the topics', () => {
  const result = executeReferenceTool({
    toolName: 'rules',
    execArgs: { topic: 'nope' },
    state: emptyState,
    coordinateContext: { mode: 'strategic' },
    tacticalBattle: undefined,
    resolveToH3: () => undefined,
  });
  assert.equal(result.status, 'error');
  assert.match(String(result.error), /combat-stats/);
});

test('get_map radius 0 returns only the center cell', () => {
  const fixture = oneCellBattle();
  const result = executeReferenceTool({
    toolName: 'get_map',
    execArgs: { center: fixture.center, radius: 0 },
    state: fixture.state,
    coordinateContext: { mode: 'tactical', battleId: fixture.battle.battleId },
    tacticalBattle: fixture.battle,
    resolveToH3: fixture.resolveToH3,
  });
  assert.equal(result.status, 'ok', String(result.error));
  assert.equal(result.center, fixture.center);
  assert.equal(result.cellCount, 1);
  const map = String(result.map);
  const fence = map.split('```')[1] ?? '';
  const tokens = fence.split(/\s+/).filter((token) => /^[A-Z0-9]{2}$/.test(token));
  assert.deepEqual(tokens, [fixture.center]);
  assert.equal(JSON.stringify(result).includes(fixture.battle.tacticalChildH3Indexes[0]!), false);
});

test('get_map rejects a code that is not on the battle map', () => {
  const fixture = oneCellBattle();
  const result = executeReferenceTool({
    toolName: 'get_map',
    execArgs: { center: 'ZZ', radius: 0 },
    state: fixture.state,
    coordinateContext: { mode: 'tactical', battleId: fixture.battle.battleId },
    tacticalBattle: fixture.battle,
    resolveToH3: fixture.resolveToH3,
  });
  assert.equal(result.status, 'error');
  assert.equal(result.error, 'That cell is not on this battle map.');
});

test('get_map on the strategic map returns the center and rejects a cell outside it', () => {
  ensureStrategicCoordinateRegistryInitialized();
  const centerH3 = latLngToCell(12, 34, 1);
  const center = getHexCodeForContext(centerH3, { mode: 'strategic' });
  assert.ok(center);
  const footprint = listStrategicH3Indexes();
  assert.ok(footprint.includes(centerH3));
  const { resolveToH3 } = buildLatLngCoordinateMap([centerH3]);
  const result = executeReferenceTool({
    toolName: 'get_map',
    execArgs: { center, radius: 0 },
    state: {
      ...emptyState,
      hexes: [{ h3Index: centerH3, terrain: 'land', terrainKind: 'plains' }],
    },
    coordinateContext: { mode: 'strategic' },
    tacticalBattle: undefined,
    resolveToH3,
  });
  assert.equal(result.status, 'ok', String(result.error));
  assert.equal(result.cellCount, 1);
  assert.ok(Number(result.cellCount) <= footprint.length);
  const missing = executeReferenceTool({
    toolName: 'get_map',
    execArgs: { center: 'ZZ', radius: 0 },
    state: emptyState,
    coordinateContext: { mode: 'strategic' },
    tacticalBattle: undefined,
    resolveToH3,
  });
  assert.equal(missing.status, 'error');
  assert.equal(missing.error, 'That cell is not on the map.');
});

test('get_map rejects radius 9', () => {
  const fixture = oneCellBattle();
  const result = executeReferenceTool({
    toolName: 'get_map',
    execArgs: { center: fixture.center, radius: 9 },
    state: fixture.state,
    coordinateContext: { mode: 'tactical', battleId: fixture.battle.battleId },
    tacticalBattle: fixture.battle,
    resolveToH3: fixture.resolveToH3,
  });
  assert.equal(result.status, 'error');
});

test('a tactical prompt names rules only when that tool is enabled', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-reference-tools-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  openGameDatabaseAtPathForTests(dbPath);
  try {
    resetGameForNewMatch();
    const state = getGameState();
    const hexes = state.hexes.slice(0, 4).map((hex) => hex.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexes);
    const coord = {
      latLngByH3,
      resolveToH3,
      format: (h3: string) => h3,
    };
    const tactical = { mode: 'tactical' as const, battleId: 'ref-prompt', tacticalTurnNumber: 1 };
    const planning = getToolNamesForEnabledGroups(['planning']);
    const on = buildSystemPromptForTools(state, coord, planning, undefined, tactical);
    const off = buildSystemPromptForTools(state, coord, [], undefined, tactical);
    assert.ok(on.includes(RULES_POINTER_LINE), 'planning tools should point at rules');
    assert.ok(!off.includes('rules(topic)'), off);
    assert.ok(!off.includes('get_map'), off);
  } finally {
    closeGameDatabaseForTests();
  }
});
