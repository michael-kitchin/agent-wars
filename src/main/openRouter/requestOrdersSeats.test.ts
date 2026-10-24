/* eslint-disable @typescript-eslint/no-require-imports -- openRouter loads Electron, so this file requires it after the mock. */
/**
 * One consultation plans a single seat and stores only that seat's orders.
 * The key strings in this file are for testing.
 * Run: `node dist/main/openRouter/requestOrdersSeats.test.js`
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import Module = require('module');
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { afterResolution } from './afterResolution';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import {
  closeGameDatabaseForTests,
  dbGetOne,
  dbRun,
  getAiPendingOrders,
  getGameState,
  openGameDatabaseAtPathForTests,
  resetGameForNewMatch,
} from '../gameDb';
import { clearLoadedGameMapForTests } from '../gameMap/loadGameMap';
import { listGameMaps } from '../gameMap/listGameMaps';
import { setRegionPackUserDataRootForTests } from '../gameMap/regionPackExtract';
import { clearScenarioRegionCache, installSideGroupHomes } from '../regionScenario';
import { clearTerrainClassificationCache } from '../terrainClassificationCache';
import { setActiveTerrainPackDirectory } from '../terrainMetadataPaths';
import { clearTacticalOriginAreas } from '../unitOrigin/tacticalOriginAreas';
import { clearTacticalBirthCountryCache } from '../unitOrigin/tacticalBirthCountryCache';
import { clearWeatherPackCache } from '../weather/weatherPackLoad';
import { resetActiveGameMap } from '../../shared/activeGameMap';
import { setLoadedStrategicFootprint } from '../../shared/loadedStrategicFootprint';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS } from '../../shared/seatIds';

/**
 * Installs a stand-in Electron so the key store can load under Node.
 *
 * Purpose: `requestOrders` reads the key through Electron safe storage.
 * When to use: Before the first import of `openRouter` in this file.
 * Expected outcome: `saveKey` writes under `userDataDir`. The returned function restores module loading.
 * Exceptions: None.
 */
function installElectronMock(userDataDir: string): () => void {
  const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;
  (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function patchedLoad(
    request: string,
    parent: unknown,
    isMain: boolean
  ) {
    if (request === 'electron') {
      return {
        app: { getPath: () => userDataDir },
        safeStorage: {
          isEncryptionAvailable: () => false,
          encryptString: (value: string) => Buffer.from(value, 'utf8'),
          decryptString: (value: Buffer) => value.toString('utf8'),
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  return () => {
    (Module as unknown as { _load: typeof originalLoad })._load = originalLoad;
  };
}

/**
 * Opens a three-seat regional match, runs the case, and clears process map state.
 *
 * Purpose: The consultation needs a real roster and real hexes, then must not leak them.
 * When to use: The seat consultation case.
 * Expected outcome: `runCase` finishes before the database closes.
 * Exceptions: Propagates `runCase` after cleanup.
 */
async function withThreeSeatMatch(runCase: () => Promise<void>): Promise<void> {
  const map = listGameMaps().find((entry) => entry.id === 'western_asia_north' && entry.sideGroups.length >= 3);
  if (!map) return;
  const seats: NewGameSeatInput[] = map.sideGroups.slice(0, 3).map((group) => ({ kind: 'ai' as const, sideGroupId: group.id }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-orders-seat-'));
  const userData = path.join(dir, 'user-data');
  fs.mkdirSync(userData);
  setRegionPackUserDataRootForTests(userData);
  openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
  try {
    resetGameForNewMatch({ gameMapId: map.id, seats, fogOfWarEnabled: false });
    await runCase();
  } finally {
    setRegionPackUserDataRootForTests(null);
    closeGameDatabaseForTests();
    clearTerrainClassificationCache();
    clearWeatherPackCache();
    clearTacticalBirthCountryCache();
    clearScenarioRegionCache();
    clearLoadedGameMapForTests();
    setActiveTerrainPackDirectory(null);
    setLoadedStrategicFootprint(null);
    installSideGroupHomes(null);
    clearTacticalOriginAreas();
    resetActiveGameMap();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A second-seat consultation keeps only that seat's move and stores it under that seat.
 *
 * Purpose: Validation, drops, and pending-order storage are per commander.
 * When to use: After a consultation can be aimed at a seat other than the first AI seat.
 * Expected outcome: The first seat's move is dropped. Pending orders exist only for the second seat.
 * Exceptions: Skips when the regional pack is not extracted.
 */
test('a second-seat consultation orders only that seat', async (t) => {
  const map = listGameMaps().find((entry) => entry.id === 'western_asia_north' && entry.sideGroups.length >= 3);
  if (!map) {
    t.skip('western_asia_north is not extracted');
    return;
  }
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-orders-seat-electron-'));
  const restoreElectron = installElectronMock(userData);
  const openRouter = require('./openRouter') as {
    saveKey: (key: string) => void;
    setSelectedModel: (modelId: string) => void;
    setChatTransportOverrideForTests: (override: ((payload: { key: string }) => Promise<{
      ok: true;
      status: number;
      headers: Record<string, string>;
      bodyText: string;
    }>) | null) => void;
    requestOrders: (
      state: ReturnType<typeof getGameState>,
      modelId: string,
      options: { seatId: 'opponent2'; enabledToolNames: string[]; usePrecomputation: boolean }
    ) => Promise<{ success: boolean; orders: { unitId: string; toH3Index: string }[]; dropReasons?: string[]; error?: string }>;
  };
  try {
    openRouter.saveKey('test-key');
    openRouter.setSelectedModel('test-model');
    await withThreeSeatMatch(async () => {
      const first = dbGetOne<{ id: string; h3Index: string }>(
        'SELECT id, h3_index AS h3Index FROM units WHERE player = ? AND unit_type = ? LIMIT 1',
        [AI_SEAT_IDS[0], 'infantry']
      );
      const second = dbGetOne<{ id: string; h3Index: string }>(
        'SELECT id, h3_index AS h3Index FROM units WHERE player = ? AND unit_type = ? LIMIT 1',
        [AI_SEAT_IDS[1], 'infantry']
      );
      assert.ok(first && second, 'both AI seats should have infantry');
      dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [first.h3Index, second.id]);
      ensureStrategicCoordinateRegistryInitialized();
      const destination = h3ToCode(first.h3Index, { mode: 'strategic' });
      const content = JSON.stringify({
        message: 'hold',
        strategy: 'hold',
        orders: [
          { action: 'explicit_move', unitId: second.id, destination },
          { action: 'explicit_move', unitId: first.id, destination },
        ],
        airStrikes: [],
        ferryOrders: [],
        callbacks: [],
      });
      openRouter.setChatTransportOverrideForTests(async (payload) => {
        assert.equal(payload.key, 'test-key');
        return {
          ok: true as const,
          status: 200,
          headers: {},
          bodyText: JSON.stringify({ choices: [{ message: { content } }] }),
        };
      });
      const state = getGameState();
      const result = await openRouter.requestOrders(state, 'test-model', {
        seatId: 'opponent2',
        enabledToolNames: [],
        usePrecomputation: false,
      });
      assert.equal(result.success, true, result.error);
      assert.deepEqual(result.orders.map((order) => order.unitId), [second.id]);
      const drops = result.dropReasons ?? [];
      assert.ok(
        drops.some((reason) => reason.includes(first.id) || reason.includes("own side")),
        `the other seat's order should be dropped: ${drops.join(' | ')}`
      );
      const stored = await afterResolution(
        state,
        { success: true },
        {
          modelId: 'test-model',
          enabledToolNames: [],
          hasKey: () => true,
          requestOrders: async () => ({ success: true, orders: result.orders }),
        },
        'opponent2'
      );
      assert.equal(stored.consulted, true);
      const ownPending = getAiPendingOrders('opponent2');
      const otherPending = getAiPendingOrders('opponent');
      assert.deepEqual(ownPending?.movementOrders.map((order) => order.unitId), [second.id]);
      assert.equal(otherPending, null);
    });
  } finally {
    openRouter.setChatTransportOverrideForTests(null);
    restoreElectron();
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

/**
 * A consultation sends the key stored for that seat.
 *
 * Purpose: Two commanders can use different keys, and a stored empty key does not fall back to the legacy key.
 * When to use: After seat keys can be stored apart from the legacy key.
 * Expected outcome: Each call's transport payload carries that seat's key. An empty stored key fails before the transport runs.
 * Exceptions: Skips when the regional pack is not extracted.
 */
test('each seat sends its own key, and an empty key does not call the model', async (t) => {
  const map = listGameMaps().find((entry) => entry.id === 'western_asia_north' && entry.sideGroups.length >= 3);
  if (!map) {
    t.skip('western_asia_north is not extracted');
    return;
  }
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-orders-seat-key-'));
  const restoreElectron = installElectronMock(userData);
  // The first case already loaded this module against its own directory.
  delete require.cache[require.resolve('./openRouter')];
  const openRouter = require('./openRouter') as {
    saveKey: (key: string) => void;
    setChatTransportOverrideForTests: (override: ((payload: { key: string }) => Promise<{
      ok: true;
      status: number;
      headers: Record<string, string>;
      bodyText: string;
    }>) | null) => void;
    requestOrders: (
      state: ReturnType<typeof getGameState>,
      modelId: string,
      options: { seatId: (typeof AI_SEAT_IDS)[number]; enabledToolNames: string[]; usePrecomputation: boolean }
    ) => Promise<{ success: boolean; error?: string }>;
  };
  const memory = require('./commanderKeyMemory') as {
    writeSeatApiKeys: (entries: readonly { seatId: string; apiKey: string }[]) => void;
  };
  const bodyText = JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      message: 'hold',
      strategy: 'hold',
      orders: [],
      airStrikes: [],
      ferryOrders: [],
      callbacks: [],
    }) } }],
  });
  try {
    await withThreeSeatMatch(async () => {
      openRouter.saveKey('test-openrouter-key');
      const seen: string[] = [];
      openRouter.setChatTransportOverrideForTests(async (payload) => {
        seen.push(payload.key);
        return { ok: true, status: 200, headers: {}, bodyText };
      });
      memory.writeSeatApiKeys([
        { seatId: AI_SEAT_IDS[0], apiKey: 'test-openrouter-key' },
        { seatId: AI_SEAT_IDS[1], apiKey: 'test-openrouter-key-b' },
      ]);
      const state = getGameState();
      await openRouter.requestOrders(state, 'test-model', {
        seatId: AI_SEAT_IDS[0],
        enabledToolNames: [],
        usePrecomputation: false,
      });
      await openRouter.requestOrders(state, 'test-model', {
        seatId: AI_SEAT_IDS[1],
        enabledToolNames: [],
        usePrecomputation: false,
      });
      assert.deepEqual(seen, ['test-openrouter-key', 'test-openrouter-key-b']);
      seen.length = 0;
      memory.writeSeatApiKeys([
        { seatId: AI_SEAT_IDS[0], apiKey: 'test-openrouter-key' },
        { seatId: AI_SEAT_IDS[1], apiKey: '' },
      ]);
      const empty = await openRouter.requestOrders(state, 'test-model', {
        seatId: AI_SEAT_IDS[1],
        enabledToolNames: [],
        usePrecomputation: false,
      });
      assert.equal(empty.success, false);
      assert.equal(empty.error, 'No API key set');
      assert.deepEqual(seen, []);
    });
  } finally {
    openRouter.setChatTransportOverrideForTests(null);
    restoreElectron();
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
