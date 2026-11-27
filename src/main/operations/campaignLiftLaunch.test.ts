/**
 * Campaign lifts launched from a seeded match.
 *
 * Purpose: The turn advance must ship the ground units that cannot walk to the campaign, only with enough force, and in a slot of its own.
 * When to use: After changes to `campaignLiftForSeat`, `campaignLiftLandings`, or the lift launch in `advanceOperationsForSeat`.
 * Expected outcome: Process exit 0. The match is temporary and the force is placed on the seeded map.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { isWithinGridRangePure } from '../../shared/h3GridRangePure';
import {
  canLandUnitTraverseEdge,
  getLandStepDistances,
  STRATEGIC_LAND_MAX_WATER_PCT,
  type LandMassByH3,
} from '../../shared/landTraversalStrategic';
import type { CampaignObjective } from '../../shared/campaignTypes';
import type { Operation } from '../../shared/operationTypes';
import type { KnockoutCoordinates } from '../gameActions/knockoutConsequences';
import { dbGetOne, dbRun, getGameState, getGameStateForPlayer, listUnitsForSnapshot } from '../gameDb';
import { readCampaignObjectives, writeCampaignObjectiveForSeat } from '../gameDb/campaignObjectiveMemory';
import { readOperations, writeOperationsForSeat } from '../gameDb/operationMemory';
import { gameDbOps } from '../gameDb/dbConnection';
import { insertSideAgreement } from '../gameDb/sideAgreementStore';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { readPosture, writePosture } from '../gameDb/postureMemory';
import { POSTURE_MIN_HOLD_TURNS } from '../../shared/postureTypes';
import { loadCampaignLandMass, resolveCampaignObjectiveForSeat } from '../openRouter/campaignObjectiveFlow';
import { CAMPAIGN_REACH_LIMIT_STEPS } from '../openRouter/campaignRules';
import { CAMPAIGN_LIFT_CANCEL_COOLDOWN_TURNS, CAMPAIGN_LIFT_LANDING_MAX_STEPS } from '../openRouter/campaignSeaConstants';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import type { LatLng } from '../tools/h3LatLng';
import { campaignLiftLandings } from './campaignLiftLaunch';
import { buildLiftTerrain } from './liftTerrain';
import { applyOperationCommands } from './operationCommands';
import { advanceOperationsForSeat } from './operationTurnFlow';
import { applyPostureChoice } from './postureChoice';

const SEAT = 'opponent' as const;
const TURN = 5;

/**
 * Where the arranged force and its target sit.
 *
 * Purpose: Cases add units and read terrain around these hexes.
 * When to use: The result of `arrange`.
 * Expected outcome: Hex ids on the seeded map.
 * Exceptions: None.
 */
interface Arranged {
  /**
   * The enemy city the infantry cannot walk to.
   *
   * Contract: A coastal hex in the human home that a ship can reach from the port.
   * When to use: The campaign target.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly city: string;
  /**
   * The seaport the force musters at.
   *
   * Contract: A hex the seat controls with one seaport.
   * When to use: Reading sailing routes.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly port: string;
  /**
   * The land hex the infantry stand on.
   *
   * Contract: A land hex beside the port.
   * When to use: Placing more ground units.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly infantryHex: string;
  /**
   * The water hex the ships stand on.
   *
   * Contract: A water hex beside the port.
   * When to use: Placing more ships.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly shipHex: string;
}

/**
 * Coordinate helpers for the seeded hexes.
 *
 * Purpose: The launch writes marches, and those marches need a center for the port.
 * When to use: Before each advance.
 * Expected outcome: A center for every hex, resolved back at res 1.
 * Exceptions: None. An unresolvable center returns undefined.
 */
function coordinates(): KnockoutCoordinates {
  const state = getGameState();
  return {
    latLngByH3: new Map<string, LatLng>(state.hexes.map((hex) => [hex.h3Index, cellToLatLng(hex.h3Index)])),
    resolveToH3: (lat, lng) => {
      try {
        return latLngToCell(lat, lng, 1);
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Sets the planning turn the operation tick will read.
 *
 * Purpose: The stored operation and the objective compare against the match's turn number.
 * When to use: Before an advance that must see a chosen turn.
 * Expected outcome: The next snapshot reports that turn.
 * Exceptions: None.
 */
function setTurn(turnNumber: number): void {
  dbRun('UPDATE turn_state SET turn_number = ? WHERE id = 1', [turnNumber]);
}

/**
 * Places eight infantry, two ships, and a port, and picks an enemy city the infantry cannot walk to.
 *
 * Purpose: A campaign lift needs units that cannot reach the campaign by land, a port, and a city a ship can reach.
 * When to use: The start of each case.
 * Expected outcome: The hexes used. The seat holds the maritime posture, so one ship carries four of the eight infantry.
 * Exceptions: Fails an assertion when the seeded map has no such city.
 */
function arrange(landMass: LandMassByH3): Arranged {
  dbRun('DELETE FROM standing_orders');
  dbRun('DELETE FROM unit_transport_assignments');
  dbRun('DELETE FROM units');
  dbRun('UPDATE res_s_infrastructure SET urban_hex_count = 0');
  const state = getGameState();
  const hexById = new Map(state.hexes.map((hex) => [hex.h3Index, hex]));
  const hexSet = new Set(hexById.keys());
  const aiHome = state.homeRegionHexesBySeat?.opponent ?? [];
  const humanHome = new Set(state.homeRegionHexesBySeat?.human ?? []);
  const origin = aiHome.find((hex) => {
    const record = landMass.get(hex);
    return record !== undefined && record.waterPct < STRATEGIC_LAND_MAX_WATER_PCT;
  });
  assert.ok(origin, 'expected walkable land in the AI home');
  const steps = getLandStepDistances({ originH3s: [origin], hexSet, data: landMass, maxDepth: 8 });
  const port = [...steps.keys()].find((hex) => {
    const row = hexById.get(hex);
    return hex !== origin && (row?.terrain === 'coastal' || row?.terrainKind === 'coastal');
  });
  assert.ok(port, 'expected a coastal hex the infantry can reach');
  const infantryHex = gridDisk(port, 1).find(
    (hex) => hex !== port && hexById.get(hex)?.terrain !== 'water' && canLandUnitTraverseEdge(hex, port, landMass),
  );
  assert.ok(infantryHex, 'expected land beside the port the infantry can enter from');
  const shipHex = gridDisk(port, 1).find((hex) => hexById.get(hex)?.terrain === 'water');
  assert.ok(shipHex, 'expected water beside the port');
  dbRun(
    `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, 0, 0, 1)
     ON CONFLICT(h3_index) DO UPDATE SET seaport_count = 1`,
    [port],
  );
  dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [port, SEAT]);
  for (let index = 0; index < 8; index += 1) {
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [`inf-${index}`, SEAT, 'infantry', infantryHex]);
  }
  for (const id of ['ship-1', 'ship-2']) {
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, SEAT, 'naval', shipHex]);
  }
  writePosture({ getOne: dbGetOne, run: dbRun }, SEAT, { posture: 'maritime', sinceTurn: 1 });
  const walkable = getLandStepDistances({ originH3s: [infantryHex], hexSet, data: landMass, maxDepth: CAMPAIGN_REACH_LIMIT_STEPS });
  const terrain = buildLiftTerrain({
    state: { ...getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false }), units: listUnitsForSnapshot() },
    seatId: SEAT,
    landMass,
  });
  const city = [...humanHome].find((hex) => {
    const row = hexById.get(hex);
    if (row?.terrain !== 'coastal' && row?.terrainKind !== 'coastal') return false;
    if (walkable.has(hex) || isWithinGridRangePure(shipHex, hex, 7)) return false;
    return terrain.landingHexes(hex).some((landing) => terrain.sailTurns(port, landing) !== null);
  });
  assert.ok(city, 'expected an enemy coastal city the infantry cannot walk to');
  dbRun(
    `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, 4, 0, 0)
     ON CONFLICT(h3_index) DO UPDATE SET urban_hex_count = 4`,
    [city],
  );
  dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [city, 'human']);
  return { city, port, infantryHex, shipHex };
}

/**
 * Stores a campaign objective on the city.
 *
 * Purpose: The lift launch reads the stored target.
 * When to use: After `arrange`, before an advance.
 * Expected outcome: The seat's stored objective names the city and approaches by sea, plus any extra fields given.
 * Exceptions: None.
 */
function storeObjective(city: string, extra: Partial<CampaignObjective> = {}): void {
  writeCampaignObjectiveForSeat({ getOne: dbGetOne, run: dbRun }, SEAT, {
    targetH3: city,
    stagingH3: null,
    phase: 'assault',
    source: 'engine',
    chosenTurn: 1,
    approach: 'sea',
    ...extra,
  });
}

/**
 * Puts enemy infantry on a hex.
 *
 * Purpose: The required force counts the units waiting at the target.
 * When to use: After `arrange`.
 * Expected outcome: One human infantry per id on that hex.
 * Exceptions: None.
 */
function placeDefenders(h3Index: string, ids: readonly string[]): void {
  for (const id of ids) {
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, 'human', 'infantry', h3Index]);
  }
}

/**
 * The stored campaign lifts for the seat.
 *
 * Purpose: Cases compare the count and fields of the stored lifts.
 * When to use: After an advance.
 * Expected outcome: Operations whose purpose is campaign.
 * Exceptions: None.
 */
function storedLifts(): readonly Operation[] {
  return (readOperations({ getOne: dbGetOne }).get(SEAT) ?? []).filter((operation) => operation.purpose === 'campaign');
}

test('an undefended city gets a lift of four troops on one ship', () => {
  withTempGameDb('aw-campaign-lift-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    storeObjective(city);
    setTurn(TURN);
    advanceOperationsForSeat(SEAT, coordinates());
    const lifts = storedLifts();
    assert.equal(lifts.length, 1);
    assert.equal(lifts[0]?.method, 'sea');
    assert.equal(lifts[0]?.objectiveH3, city);
    assert.equal(lifts[0]?.unitIds.length, 4);
    assert.equal(lifts[0]?.carrierIds.length, 1);
    assert.equal(lifts[0]?.minGroundUnits, 2);
    assert.equal(readCampaignObjectives({ getOne: dbGetOne }).get(SEAT)?.liftLaunchedTurn, TURN);
  });
});

test('the consult after a launch keeps the sea target the lift serves', () => {
  withTempGameDb('aw-campaign-lift-keep-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    storeObjective(city);
    setTurn(TURN);
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(storedLifts().length, 1);
    const resolved = resolveCampaignObjectiveForSeat({
      ...getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false }),
      playerPerspective: SEAT,
    });
    assert.equal(resolved?.targetH3, city);
    assert.equal(resolved?.approach, 'sea');
    assert.equal(resolved?.liftLaunchedTurn, TURN);
  });
});

test('one defender at the target still allows a lift', () => {
  withTempGameDb('aw-campaign-lift-one-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    placeDefenders(city, ['def-1']);
    storeObjective(city);
    setTurn(TURN);
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(storedLifts().length, 1);
  });
});

test('a target that needs more than the lift can carry launches nothing', () => {
  withTempGameDb('aw-campaign-lift-heavy-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    placeDefenders(city, ['def-1', 'def-2', 'def-3', 'def-4']);
    storeObjective(city);
    setTurn(TURN);
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(storedLifts().length, 0);
  });
});

test('a second lift is not launched while one is stored', () => {
  withTempGameDb('aw-campaign-lift-second-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    storeObjective(city);
    const coords = coordinates();
    setTurn(TURN);
    advanceOperationsForSeat(SEAT, coords);
    setTurn(TURN + 1);
    advanceOperationsForSeat(SEAT, coords);
    assert.equal(storedLifts().length, 1);
  });
});

test('a posture change leaves a stored campaign lift running', () => {
  withTempGameDb('aw-campaign-lift-posture-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    storeObjective(city);
    const coords = coordinates();
    setTurn(TURN);
    advanceOperationsForSeat(SEAT, coords);
    const launched = storedLifts()[0];
    assert.ok(launched, 'expected a stored campaign lift');

    const changeTurn = POSTURE_MIN_HOLD_TURNS + 1;
    const change = applyPostureChoice({ seatId: SEAT, posture: 'strangle', turnNumber: changeTurn });
    assert.equal(change.applied, true);
    assert.equal(readPosture({ getOne: dbGetOne }, SEAT)?.posture, 'strangle');
    setTurn(changeTurn);
    advanceOperationsForSeat(SEAT, coords);

    const kept = storedLifts().find((lift) => lift.id === launched.id);
    assert.ok(kept, 'the lift is still stored after the posture changed');
    assert.deepEqual(kept.unitIds, launched.unitIds);
    assert.deepEqual(kept.carrierIds, launched.carrierIds);
    assert.equal(kept.purpose, 'campaign');
  });
});

test('a commander cancel holds off the next lift until the cooldown has passed', () => {
  for (const [turnsSinceCancel, expectedLifts] of [
    [CAMPAIGN_LIFT_CANCEL_COOLDOWN_TURNS - 1, 0],
    [CAMPAIGN_LIFT_CANCEL_COOLDOWN_TURNS, 1],
  ] as const) {
    withTempGameDb('aw-campaign-lift-cooldown-', () => {
      const landMass = loadCampaignLandMass(SEAT);
      assert.ok(landMass, 'expected the terrain cache');
      const { city } = arrange(landMass);
      storeObjective(city, { liftCancelledTurn: TURN - turnsSinceCancel });
      setTurn(TURN);
      advanceOperationsForSeat(SEAT, coordinates());
      assert.equal(storedLifts().length, expectedLifts);
    });
  }
});

test('a commander cancel of a campaign lift records the cancel turn on the objective', () => {
  withTempGameDb('aw-campaign-lift-cancel-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    storeObjective(city);
    const coords = coordinates();
    setTurn(TURN);
    advanceOperationsForSeat(SEAT, coords);
    const lift = storedLifts()[0];
    assert.ok(lift, 'expected a stored campaign lift');
    setTurn(TURN + 1);
    const result = applyOperationCommands({
      state: { ...getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false }), units: listUnitsForSnapshot() },
      seatId: SEAT,
      commands: [{ action: 'cancel', id: lift.id }],
      coordinates: coords,
      candidates: [],
    });
    assert.equal(result.appliedCount, 1);
    assert.equal(storedLifts().length, 0);
    assert.equal(readCampaignObjectives({ getOne: dbGetOne }).get(SEAT)?.liftCancelledTurn, TURN + 1);
  });
});

test('only a campaign lift for the stored target keeps a waiting sea target from expiring', () => {
  withTempGameDb('aw-campaign-lift-binding-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city, port } = arrange(landMass);
    const lift = (objectiveH3: string): Operation => ({
      id: 'opponent-op9',
      method: 'sea',
      purpose: 'campaign',
      objectiveH3,
      musterH3: port,
      landingH3: null,
      unitIds: ['gone-inf'],
      carrierIds: ['gone-ship'],
      phase: 'transit',
      source: 'engine',
      launchedTurn: 1,
      phaseTurn: 1,
    });
    const resolveAt = () => resolveCampaignObjectiveForSeat({
      ...getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false }),
      playerPerspective: SEAT,
    });
    setTurn(TURN + 20);
    storeObjective(city);
    writeOperationsForSeat({ getOne: dbGetOne, run: dbRun }, SEAT, [lift(city)]);
    assert.equal(resolveAt()?.targetH3, city);
    storeObjective(city);
    writeOperationsForSeat({ getOne: dbGetOne, run: dbRun }, SEAT, [lift('elsewhere')]);
    assert.notEqual(resolveAt()?.targetH3, city);
  });
});

test('no stored objective launches no lift', () => {
  withTempGameDb('aw-campaign-lift-none-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    arrange(landMass);
    setTurn(TURN);
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(storedLifts().length, 0);
  });
});

test('a stored raid does not use the campaign lift slot', () => {
  withTempGameDb('aw-campaign-lift-raid-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city, infantryHex, shipHex } = arrange(landMass);
    for (const id of ['raid-inf-1', 'raid-inf-2']) {
      dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [id, SEAT, 'infantry', infantryHex]);
    }
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', ['raid-ship', SEAT, 'naval', shipHex]);
    writeOperationsForSeat({ getOne: dbGetOne, run: dbRun }, SEAT, [
      {
        id: 'opponent-raid',
        method: 'sea',
        objectiveH3: city,
        musterH3: infantryHex,
        landingH3: null,
        unitIds: ['raid-inf-1', 'raid-inf-2'],
        carrierIds: ['raid-ship'],
        phase: 'muster',
        source: 'engine',
        launchedTurn: 1,
        phaseTurn: 1,
      },
    ]);
    storeObjective(city);
    setTurn(TURN);
    advanceOperationsForSeat(SEAT, coordinates());
    const stored = readOperations({ getOne: dbGetOne }).get(SEAT) ?? [];
    assert.equal(storedLifts().length, 1);
    assert.equal(stored.some((operation) => operation.id === 'opponent-raid'), true);
  });
});

test('a landing hex the seat holds near the target is a campaign lift landing', () => {
  withTempGameDb('aw-campaign-lift-landings-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    const snapshot = () => ({
      ...getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false }),
      units: listUnitsForSnapshot(),
    });
    const state = snapshot();
    const terrain = buildLiftTerrain({ state, seatId: SEAT, landMass });
    const own = new Set(terrain.landingHexes(city));
    const near = getLandStepDistances({
      originH3s: [city],
      hexSet: new Set(state.hexes.map((hex) => hex.h3Index)),
      data: landMass,
      maxDepth: CAMPAIGN_LIFT_LANDING_MAX_STEPS,
    });
    const beachhead = [...near.keys()].find((hex) => !own.has(hex) && terrain.debarkLegal(hex) && terrain.shipCanEnter(hex));
    assert.ok(beachhead, 'expected a coastal hex near the target');
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [beachhead, SEAT]);
    const held = snapshot();
    const landings = campaignLiftLandings({
      state: held,
      seatId: SEAT,
      landMass,
      terrain: buildLiftTerrain({ state: held, seatId: SEAT, landMass }),
      targetH3: city,
    });
    assert.equal(landings.includes(beachhead), true);
    assert.equal(landings.every((hex) => hex === beachhead || own.has(hex)), true);
  });
});

test('an engine target held by a pact partner gets no lift, and a commander target still does', () => {
  withTempGameDb('aw-campaign-lift-pact-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    insertSideAgreement(gameDbOps, {
      seatId: SEAT, counterpartSeatId: HUMAN_SEAT_ID, kind: 'non_aggression', terms: 'No strikes.', zoneH3: [], againstSeatId: null,
      startTurn: 1, endTurn: TURN + 3, status: 'active', intent: 'keep', reason: '',
    });
    storeObjective(city);
    setTurn(TURN);
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(storedLifts().length, 0);
    storeObjective(city, { source: 'commander' });
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(storedLifts().length, 1);
  });
});

test('an engine target the seat knows only as a pact partner home gets no lift', () => {
  withTempGameDb('aw-campaign-lift-pact-home-', () => {
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass, 'expected the terrain cache');
    const { city } = arrange(landMass);
    dbRun('DELETE FROM res_s_control WHERE h3_index = ?', [city]);
    assert.equal(getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false }).exploredHexes?.includes(city), false);
    insertSideAgreement(gameDbOps, {
      seatId: SEAT, counterpartSeatId: HUMAN_SEAT_ID, kind: 'non_aggression', terms: 'No strikes.', zoneH3: [], againstSeatId: null,
      startTurn: 1, endTurn: TURN + 3, status: 'active', intent: 'keep', reason: '',
    });
    storeObjective(city);
    setTurn(TURN);
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(storedLifts().length, 0);
    storeObjective(city, { source: 'commander' });
    advanceOperationsForSeat(SEAT, coordinates());
    assert.equal(storedLifts().length, 1);
  });
});
