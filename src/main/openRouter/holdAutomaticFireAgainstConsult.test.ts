/* eslint-disable @typescript-eslint/no-require-imports -- `openRouter` loads only after the Electron stand-in */
/**
 * The automatic-fire list through a whole orders consult, with a scripted model.
 *
 * Purpose: The list has to be stored before the reply's own attacks are merged, survive a repair reply, and reach the
 * check that holds a shortened battle move.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/holdAutomaticFireAgainstConsult.test.js`.
 * Expected outcome: Throws on failure.
 * Exceptions: Skips when no map with three side groups is listed.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test, type TestContext } from 'node:test';
import { gridDisk, gridDistance } from 'h3-js';
import { tacticalChildrenOf } from '../../shared/h3Resolutions';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS, type AiSeatId } from '../../shared/seatIds';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { playerIdCodeFor } from '../../shared/unitIds';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { ensureStrategicCoordinateRegistryInitialized, initTacticalCoordinateRegistry } from '../briefing/map/hexCoordinates';
import { dbRun, getGameState } from '../gameDb';
import { readHoldAutomaticFireAgainstSeatIds } from '../gameDb/holdAutomaticFireAgainstMemory';
import { listGameMaps } from '../gameMap/listGameMaps';
import { withSeatedTempGameDbAsync } from '../testSupport/withSeatedTempGameDb';
import { installElectronMock } from './openRouterTestHelpers';
import type { RequestOrdersError, RequestOrdersResult } from './requestOrdersFlowTypes';

const [OWN, LISTED, THIRD] = AI_SEAT_IDS;
const SHOOTER = 'own-armor';

/**
 * The part of `openRouter` these cases call.
 *
 * Contract: The module is loaded after the Electron stand-in is installed.
 * When to use: Every case.
 * Expected outcome: A consult that reads the scripted replies.
 * Exceptions: None.
 */
type OrdersModule = {
  /**
   * Stores the API key.
   *
   * Contract: Writes under the stand-in user-data path.
   * When to use: Once per file.
   * Expected outcome: Consults find a key.
   * Exceptions: None.
   */
  saveKey: (key: string) => void;
  /**
   * Selects the model.
   *
   * Contract: Any id; no model is called.
   * When to use: Once per file.
   * Expected outcome: Consults name it.
   * Exceptions: None.
   */
  setSelectedModel: (modelId: string) => void;
  /**
   * Replaces the network call.
   *
   * Contract: Null restores it.
   * When to use: Before each scripted consult.
   * Expected outcome: Replies come from the case.
   * Exceptions: None.
   */
  setChatTransportOverrideForTests: (
    override: (() => Promise<{ ok: true; status: number; headers: Record<string, string>; bodyText: string }>) | null
  ) => void;
  /**
   * Runs one orders consult.
   *
   * Contract: The production flow.
   * When to use: Through `consult`.
   * Expected outcome: A result or an error.
   * Exceptions: None.
   */
  requestOrders: (
    state: ReturnType<typeof getGameState>,
    modelId: string,
    options: {
      /**
       * The consulted seat.
       *
       * Contract: An AI seat.
       * When to use: Every consult.
       * Expected outcome: Its orders are applied.
       * Exceptions: None.
       */
      seatId: AiSeatId;
      /**
       * Tool groups offered.
       *
       * Contract: Empty in these cases.
       * When to use: Every consult.
       * Expected outcome: No tool round.
       * Exceptions: None.
       */
      enabledToolNames: string[];
      /**
       * Whether to precompute briefing data.
       *
       * Contract: False in these cases.
       * When to use: Every consult.
       * Expected outcome: A shorter consult.
       * Exceptions: None.
       */
      usePrecomputation: boolean;
      /**
       * The battle being consulted.
       *
       * Contract: Omitted on the world map.
       * When to use: The battle case.
       * Expected outcome: A tactical consult.
       * Exceptions: None.
       */
      tacticalAiBattle?: TacticalBattleSnapshot;
    }
  ) => Promise<RequestOrdersResult | RequestOrdersError>;
};

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-automatic-fire-consult-electron-'));
const restoreElectron = installElectronMock(userDataDir);
const openRouter = require('./openRouter') as OrdersModule;
openRouter.saveKey('test-key');
openRouter.setSelectedModel('test-model');

after(() => {
  openRouter.setChatTransportOverrideForTests(null);
  restoreElectron();
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

/**
 * One AI seat with no model of its own.
 *
 * Purpose: The cases name the model on each consult.
 * When to use: Building the match.
 * Expected outcome: A new-game seat row.
 * Exceptions: None.
 */
function seatInput(sideGroupId: string): NewGameSeatInput {
  return {
    kind: 'ai',
    sideGroupId,
    commander: { modelId: null, reasoningEffort: null, providerSort: 'throughput', doctrineChoice: 'balanced', nickname: '' },
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
 * Two adjacent hexes of the loaded map.
 *
 * Purpose: The listed unit must be inside armor range of the shooter.
 * When to use: Once per world-map case.
 * Expected outcome: The shooter's hex and the listed unit's hex.
 * Exceptions: Throws when the map has no such pair.
 */
function adjacentPair(): { own: string; listed: string } {
  const onMap = new Set(getGameState().hexes.map((hex) => hex.h3Index));
  for (const own of onMap) {
    const listed = gridDisk(own, 1).find((hex) => hex !== own && onMap.has(hex));
    if (listed) return { own, listed };
  }
  throw new Error('the map has no adjacent pair');
}

/**
 * One temporary match whose only units are the shooter and one unit of the side to be listed.
 *
 * Purpose: Every case starts from a single legal automatic shot.
 * When to use: Wrapping a case.
 * Expected outcome: Runs the case, or skips the test.
 * Exceptions: Propagates the case's failure.
 */
async function withMatch(t: TestContext, runCase: (hexes: { own: string; listed: string }) => Promise<void>): Promise<void> {
  const map = listGameMaps().find((entry) => entry.sideGroups.length >= 3);
  if (!map) {
    t.skip('no map with three side groups is listed');
    return;
  }
  const seats = map.sideGroups.slice(0, 3).map((group) => seatInput(group.id));
  await withSeatedTempGameDbAsync('aw-automatic-fire-consult-', { gameMapId: map.id, fogOfWarEnabled: false, seats }, async () => {
    dbRun('DELETE FROM units');
    const hexes = adjacentPair();
    seedUnit(SHOOTER, OWN, 'armor', hexes.own);
    seedUnit('listed-infantry', LISTED, 'infantry', hexes.listed);
    ensureStrategicCoordinateRegistryInitialized();
    await runCase(hexes);
  });
}

/**
 * Answers the consult's calls with these replies, in order.
 *
 * Purpose: The second reply is the one a repair request gets.
 * When to use: Before a consult.
 * Expected outcome: Each call takes the next reply, and the returned function reports how many calls were made.
 * Exceptions: The transport throws when a consult makes more calls than there are replies.
 */
function scriptReplies(...replies: Readonly<Record<string, unknown>>[]): () => number {
  let calls = 0;
  openRouter.setChatTransportOverrideForTests(async () => {
    const reply = replies[calls];
    calls += 1;
    assert.ok(reply, 'the consult made more calls than were scripted');
    const content = JSON.stringify({ message: 'm', strategy: 's', orders: [], airStrikes: [], ferryOrders: [], callbacks: [], ...reply });
    return { ok: true as const, status: 200, headers: {}, bodyText: JSON.stringify({ choices: [{ message: { content } }] }) };
  });
  return () => calls;
}

/**
 * One consult of the shooter's seat.
 *
 * Purpose: Every case consults the same way.
 * When to use: After the replies are scripted.
 * Expected outcome: A successful result.
 * Exceptions: Fails the test when the consult fails.
 */
async function consult(battle?: TacticalBattleSnapshot): Promise<RequestOrdersResult> {
  const result = await openRouter.requestOrders(getGameState(), 'test-model', {
    seatId: OWN,
    enabledToolNames: [],
    usePrecomputation: false,
    ...(battle ? { tacticalAiBattle: battle } : {}),
  });
  if (!result.success) assert.fail(result.error);
  return result;
}

/**
 * A reply whose only actor row names a unit that does not exist, so the consult asks for a repair.
 *
 * Purpose: The repair cases need a first reply that parses but keeps no actor row.
 * When to use: As the first scripted reply.
 * Expected outcome: One dropped row.
 * Exceptions: None.
 */
function unusableOrders(extra: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return { orders: [{ action: 'explicit_move', unitId: 'no-such-unit', destination: 'no-such-code' }], ...extra };
}

test('a reply that lists a side and orders no attack takes no automatic shot at it', async (t) => {
  await withMatch(t, async (hexes) => {
    scriptReplies({});
    assert.deepEqual((await consult()).rangedAttacks?.map((attack) => attack.targetH3Index), [hexes.listed]);
    scriptReplies({ holdAutomaticFireAgainst: [playerIdCodeFor(LISTED)] });
    assert.deepEqual((await consult()).rangedAttacks ?? [], []);
  });
});

test('a repair reply that omits the field keeps the first reply\'s list', async (t) => {
  await withMatch(t, async () => {
    const calls = scriptReplies(unusableOrders({ holdAutomaticFireAgainst: [playerIdCodeFor(LISTED)] }), {});
    const result = await consult();
    assert.equal(calls(), 2);
    assert.deepEqual([...readHoldAutomaticFireAgainstSeatIds(OWN)], [LISTED]);
    assert.deepEqual(result.rangedAttacks ?? [], []);
  });
});

test('a repair reply that sends its own list replaces the first reply\'s list', async (t) => {
  await withMatch(t, async () => {
    const calls = scriptReplies(
      unusableOrders({ holdAutomaticFireAgainst: [playerIdCodeFor(LISTED)] }),
      { holdAutomaticFireAgainst: [playerIdCodeFor(THIRD)] }
    );
    await consult();
    assert.equal(calls(), 2);
    assert.deepEqual([...readHoldAutomaticFireAgainstSeatIds(OWN)], [THIRD]);
  });
});

/**
 * A two-commander battle on a plains footprint: the shooter's infantry with a listed unit beside it.
 *
 * Purpose: A march past this beat's budget is shortened, and the shooter can already fire from where it stands.
 * When to use: The battle cases.
 * Expected outcome: The snapshot, the shooter's sub-unit, and a destination too far for one beat.
 * Exceptions: Fails the test when the footprint has no such cells.
 */
function battleOn(enclosing: string): { battle: TacticalBattleSnapshot; shooter: TacticalSubUnitSnapshot; far: string } {
  const footprint = tacticalChildrenOf(enclosing);
  const inside = new Set(footprint);
  const start = footprint.find((cell) => gridDisk(cell, 4).every((near) => inside.has(near)));
  assert.ok(start, 'the footprint has no cell with four rings inside it');
  const beside = gridDisk(start, 1).find((cell) => cell !== start);
  const far = gridDisk(start, 4).find((cell) => gridDistance(start, cell) === 4 && cell !== beside);
  assert.ok(beside && far);
  /**
   * One infantry sub-unit.
   *
   * Purpose: Both sides are built the same way.
   * When to use: Building the battle.
   * Expected outcome: A sub-unit on the cell.
   * Exceptions: None.
   */
  const sub = (id: string, player: AiSeatId, h3Index: string): TacticalSubUnitSnapshot =>
    ({ id, parentUnitId: id, player, unitType: 'infantry', h3Index, displayName: id });
  const shooter = sub('own-infantry-s1', OWN, start);
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-automatic-fire-clamp',
    leadPartyId: OWN,
    opposingPartyId: LISTED,
    enclosingStrategicH3Index: enclosing,
    tacticalChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: Object.fromEntries(footprint.map((cell) => [cell, 'plains'])),
    subUnits: [shooter, sub('listed-infantry-s1', LISTED, beside)],
  };
  return { battle, shooter, far };
}

test('a shortened battle march is held for a shot at an unlisted side and not for one at a listed side', async (t) => {
  await withMatch(t, async (hexes) => {
    const { battle, shooter, far } = battleOn(hexes.own);
    initTacticalCoordinateRegistry(battle.battleId, battle.enclosingStrategicH3Index);
    const destination = h3ToCode(far, { mode: 'tactical', battleId: battle.battleId, tacticalTurnNumber: 1 });
    const march = { orders: [{ action: 'explicit_move', unitId: shooter.id, destination }] };

    scriptReplies(march);
    const held = await consult(battle);
    assert.deepEqual(held.orders, []);
    assert.ok((held.dropReasons ?? []).some((reason) => reason.includes('held on its firing cell')), held.dropReasons?.join(' | '));

    scriptReplies({ ...march, holdAutomaticFireAgainst: [playerIdCodeFor(LISTED)] });
    const moved = await consult(battle);
    assert.deepEqual(moved.orders.map((order) => order.unitId), [shooter.id]);
    assert.deepEqual(moved.rangedAttacks ?? [], []);
  });
});
