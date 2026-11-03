/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-function-type, seat-id-literals/no-seat-id-literals -- Electron stand-in, and a fixture moved out of a test file */
/**
 * Shared fixtures for order-flow tests that call `requestOrders`.
 *
 * Purpose: The tool-round test and the tool-group matrix need the same Electron stand-in and the same small map.
 * When to use: Tests under `src/main/openRouter` that load `openRouter` through `require`.
 * Expected outcome: `installElectronMock` redirects Electron's user-data path; `buildFixtureState` is one strategic seat.
 * Exceptions: None.
 */

import Module = require('module');

/**
 * Points Electron's user-data path at a temporary directory.
 *
 * Purpose: Loading `openRouter` constructs a database under that path, so tests must not use the real app directory.
 * When to use: Before the first `require('./openRouter')` in a test process.
 * Expected outcome: A restore function that puts the module loader back.
 * Exceptions: None.
 */
export function installElectronMock(userDataDir: string): () => void {
  const originalLoad = (Module as unknown as { _load: Function })._load;
  (Module as unknown as { _load: Function })._load = function patchedLoad(
    request: string,
    parent: unknown,
    isMain: boolean
  ) {
    if (request === 'electron') {
      return {
        app: {
          getPath: (name: string) => (name === 'userData' ? userDataDir : userDataDir),
        },
        safeStorage: {
          isEncryptionAvailable: () => false,
          encryptString: (s: string) => Buffer.from(s, 'utf8'),
          decryptString: (b: Buffer) => b.toString('utf8'),
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  return () => {
    (Module as unknown as { _load: Function })._load = originalLoad;
  };
}

/**
 * Builds a two-seat strategic snapshot on the given hexes.
 *
 * Purpose: Gives `requestOrders` a roster, a home region, and a scenario without loading a saved game.
 * When to use: Order-flow tests. Pass at least three hex ids.
 * Expected outcome: Opponent armor and air on the first hex, human infantry on the second, turn 7, planning phase.
 * Exceptions: None. Fewer than three hexes makes home-region lists empty.
 */
export function buildFixtureState(hexes: string[]) {
  return {
    hexes: hexes.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: hexes[0]! },
      { id: 'opponent-air-1', player: 'opponent', unitType: 'air', h3Index: hexes[0]! },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: hexes[1]! },
    ],
    exploredHexes: [hexes[0]!, hexes[1]!, hexes[2]!],
    strategicControl: [
      { h3Index: hexes[0]!, controllerPlayerId: 'opponent' },
      { h3Index: hexes[1]!, controllerPlayerId: 'opponent' },
      { h3Index: hexes[2]!, controllerPlayerId: 'human' },
    ],
    scenarioId: 'region_vs_region',
    playerPerspective: 'opponent',
    seats: [
      { seatId: 'human', seatOrder: 1, kind: 'human', homeRegion: 'Northern America', outTurn: null, commander: null },
      { seatId: 'opponent', seatOrder: 2, kind: 'ai', homeRegion: 'Eastern Europe', outTurn: null, commander: null },
    ],
    homeRegionHexesBySeat: {
      human: [hexes[1]!, hexes[2]!],
      opponent: [hexes[0]!, hexes[1]!],
    },
    intersectingHomeRegionHexes: [hexes[1]!],
    phase: 'planning',
    turnNumber: 7,
    pendingOrders: [],
  };
}
