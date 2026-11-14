/**
 * Advances every active AI seat's sea operations once the planning turn has begun.
 *
 * Purpose: Muster, transit, assault, and return move forward after fog is refreshed and before the turn is saved.
 * When to use: Once, from the end of strategic resolution. A failure here must not stop the turn.
 * Expected outcome: Stored operations match the decisions. A seat that is no longer active loses its operations.
 * Exceptions: None. A thrown error is logged. The turn continues, and a seat that throws keeps the operations it already had.
 */

import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import { GAME_SIZE_MULTIPLIER, parseGameSize } from '../../shared/gameSize';
import type { AiSeatId } from '../../shared/seatIds';
import { activeAiSeatIds } from '../../shared/seatRoster';
import type { Operation } from '../../shared/operationTypes';
import type { KnockoutCoordinates } from '../gameActions/knockoutConsequences';
import {
  dbGetAll,
  dbGetOne,
  dbRun,
  getGameStateForPlayer,
  getSeatRoster,
  listUnitsForSnapshot,
} from '../gameDb';
import { logDebug, logError } from '../logger';
import { CAMPAIGN_CONTACT_RADIUS } from '../openRouter/campaignRules';
import { campaignPlanForState, loadCampaignLandMass } from '../openRouter/campaignObjectiveFlow';
import { resolveDefendPostH3 } from '../tools/standingOrdersDefendPost';
import { parseOrderParams, type StandingOrderRow } from '../tools/standingOrdersShared';
import { nextOperationId, readOperations, writeOperationsForSeat } from '../gameDb/operationMemory';
import { buildLiftTerrain } from './liftTerrain';
import { applyOperationActions } from './operationActions';
import { OPERATION_MAX_SEA_PER_SIZE, OPERATION_MUSTER_CANDIDATE_LIMIT } from './operationRules';
import { advanceSeaOperation, type OperationFacts, type StoredOrderFact } from './seaOperationAdvance';
import { listKnownEnemyCities, listSeaOperationCandidates } from './seaOperationCandidates';

/**
 * Database helpers the operations row uses.
 *
 * Purpose: Read and write share one pair, so a seat's list is not split across connections.
 * When to use: The turn advance only.
 * Expected outcome: The open match database.
 * Exceptions: None.
 */
const configOps = { getOne: dbGetOne, run: dbRun };

/**
 * Orders two ids by their raw string order.
 *
 * Purpose: `localeCompare` follows the machine locale and can reorder operations between runs.
 * When to use: Operation ids and ship hexes.
 * Expected outcome: Negative when `left` is first.
 * Exceptions: None.
 */
function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Standing orders reduced to the type and hex the advance compares.
 *
 * Purpose: A march uses the resolved destination. A defend uses the stored post. Any other type has no hex.
 * When to use: Once per seat, before the first operation.
 * Expected outcome: Unit id to the reduced order. Units with no row are absent.
 * Exceptions: None.
 */
function readStoredOrders(seatId: string, coordinates: KnockoutCoordinates): ReadonlyMap<string, StoredOrderFact> {
  const rows = dbGetAll<StandingOrderRow>('SELECT * FROM standing_orders WHERE player_id = ? ORDER BY unit_id', [seatId]);
  const orders = new Map<string, StoredOrderFact>();
  for (const row of rows) {
    let h3Index: string | null = null;
    if (row.order_type === 'march') {
      const destination = parseOrderParams(row).destination;
      if (Array.isArray(destination) && destination.length >= 2) {
        h3Index = coordinates.resolveToH3(Number(destination[0]), Number(destination[1])) ?? null;
      }
    } else if (row.order_type === 'defend') {
      h3Index = resolveDefendPostH3(row) ?? null;
    }
    orders.set(row.unit_id, { type: row.order_type, h3Index });
  }
  return orders;
}

/**
 * The landing with the shortest sail from a port, then the lowest hex.
 *
 * Purpose: A loaded force needs one beach, and every caller must pick the same one.
 * When to use: When a muster is ready to load.
 * Expected outcome: A landing hex, or null when no beach can be sailed to.
 * Exceptions: None.
 */
function chooseLanding(terrain: ReturnType<typeof buildLiftTerrain>, objectiveH3: string, fromH3: string): string | null {
  let best: { readonly hex: string; readonly sail: number } | null = null;
  for (const hex of terrain.landingHexes(objectiveH3)) {
    const sail = terrain.sailTurns(fromH3, hex);
    if (sail === null) continue;
    if (best === null || sail < best.sail || (sail === best.sail && hex < best.hex)) best = { hex, sail };
  }
  return best?.hex ?? null;
}

/**
 * The home port a ship can sail back to.
 *
 * Purpose: A return uses one port, chosen from the nearest ports the ship can enter.
 * When to use: When a transit turns back, with the first remaining ship's hex.
 * Expected outcome: The nearest controllable port with a route, within the port limit, or null when none has a route.
 * Exceptions: None.
 */
function chooseReturnPort(args: {
  readonly fromH3: string;
  readonly seatId: string;
  readonly state: ReturnType<typeof getGameStateForPlayer>;
  readonly terrain: ReturnType<typeof buildLiftTerrain>;
}): string | null {
  const ports: { readonly hex: string; readonly distance: number }[] = [];
  for (const row of args.state.strategicControl ?? []) {
    if (row.controllerPlayerId !== args.seatId) continue;
    if (!args.terrain.debarkLegal(row.h3Index) || !args.terrain.shipCanEnter(row.h3Index)) continue;
    const distance = computeGridDistanceWithPathFallbackPure(args.fromH3, row.h3Index);
    if (distance === null) continue;
    ports.push({ hex: row.h3Index, distance });
  }
  ports.sort((left, right) => left.distance - right.distance || compareIds(left.hex, right.hex));
  let best: { readonly hex: string; readonly sail: number } | null = null;
  for (const port of ports.slice(0, OPERATION_MUSTER_CANDIDATE_LIMIT)) {
    const sail = args.terrain.sailTurns(args.fromH3, port.hex);
    if (sail === null) continue;
    if (best === null || sail < best.sail || (sail === best.sail && port.hex < best.hex)) best = { hex: port.hex, sail };
  }
  return best?.hex ?? null;
}

/**
 * How many of the operation's remaining ground units are still aboard one of its ships.
 *
 * Purpose: A return that finishes while cargo is aboard is a failure the log has to show.
 * When to use: After the tick's embark and unload actions have been written.
 * Expected outcome: A count of remaining ground units whose assignment names a remaining ship.
 * Exceptions: None.
 */
function cargoStillAboard(unitIds: readonly string[], carrierIds: readonly string[]): number {
  if (unitIds.length === 0 || carrierIds.length === 0) return 0;
  const ships = new Set(carrierIds);
  const rows = dbGetAll<{ landUnitId: string; navalUnitId: string }>(
    'SELECT land_unit_id AS landUnitId, naval_unit_id AS navalUnitId FROM unit_transport_assignments',
  );
  const aboard = new Set(rows.filter((row) => ships.has(row.navalUnitId)).map((row) => row.landUnitId));
  return unitIds.filter((unitId) => aboard.has(unitId)).length;
}

/**
 * Advances one seat's stored operations and launches into any free slot.
 *
 * Purpose: The seat sees enemy units that fog would hide, so a city is not launched while a defender is standing on it.
 * When to use: Once per active AI seat, after knocked-out seats have been cleared.
 * Expected outcome: The seat's stored list is replaced with the operations still running, including any launch this tick.
 * Exceptions: Propagates a database or terrain error. The caller logs it and leaves this seat's previous list in place only when the write has not run.
 */
export function advanceOperationsForSeat(seatId: AiSeatId, coordinates: KnockoutCoordinates): void {
  logDebug('operationTurnFlow advanceOperationsForSeat', { seatId });
  const seatState = getGameStateForPlayer(seatId, { maskUnexploredTerrain: false });
  const state = { ...seatState, units: listUnitsForSnapshot() };
  const landMass = loadCampaignLandMass(seatId);
  if (landMass === null) {
    logDebug('operationTurnFlow advanceOperationsForSeat', { seatId, skipped: 'terrain' });
    return;
  }
  const terrain = buildLiftTerrain({ state, seatId, landMass });
  const own = state.units.filter((unit) => unit.player === seatId);
  const unitHexById = new Map(own.map((unit) => [unit.id, unit.h3Index]));
  const unitTypeById = new Map(own.map((unit) => [unit.id, unit.unitType]));
  const carrierByCargoId = new Map<string, string>();
  for (const unit of own) {
    if (unit.embarkedOnCarrierUnitId) carrierByCargoId.set(unit.id, unit.embarkedOnCarrierUnitId);
  }
  const storedOrderById = readStoredOrders(seatId, coordinates);
  const enemyCities = new Set(listKnownEnemyCities(state, seatId).map((city) => city.h3Index));
  const controlByHex = new Map((state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  const factsFor = (operation: Operation): OperationFacts => ({
    turnNumber: state.turnNumber,
    unitHexById,
    unitTypeById,
    carrierByCargoId,
    storedOrderById,
    objectiveIsOwn: controlByHex.get(operation.objectiveH3) === seatId,
    objectiveIsEnemyCity: enemyCities.has(operation.objectiveH3),
    chooseLanding: (fromH3) => chooseLanding(terrain, operation.objectiveH3, fromH3),
    chooseReturnPort: (fromH3) => chooseReturnPort({ fromH3, seatId, state, terrain }),
  });
  const kept: Operation[] = [];
  const withheldIds = new Set<string>();
  const stored = [...(readOperations(configOps).get(seatId) ?? [])].sort((left, right) => compareIds(left.id, right.id));
  for (const operation of stored) {
    const step = advanceSeaOperation(operation, factsFor(operation));
    const actionCount = applyOperationActions({ seatId, actions: step.actions, state, coordinates });
    if (step.next !== null) kept.push(step.next);
    for (const unitId of step.releasedIds) withheldIds.add(unitId);
    const shipHexes = (step.next?.carrierIds ?? [])
      .map((shipId) => unitHexById.get(shipId))
      .filter((hex): hex is string => hex !== undefined)
      .sort(compareIds);
    logDebug('operationTurnFlow advanced', {
      seatId,
      id: operation.id,
      phase: step.next?.phase ?? null,
      outcome: step.outcome,
      reason: step.reason,
      actionCount,
      releasedIds: step.releasedIds,
      shipHexes,
      cargoAboard: cargoStillAboard(step.next?.unitIds ?? [], step.next?.carrierIds ?? []),
    });
  }
  const slots = OPERATION_MAX_SEA_PER_SIZE * GAME_SIZE_MULTIPLIER[parseGameSize(state.gameSize)];
  while (kept.length < slots) {
    const plan = campaignPlanForState(state);
    const protectedUnitIds = new Set<string>([...(plan?.defenderUnitIds ?? []), ...withheldIds]);
    for (const unit of own) {
      if (unit.unitType !== 'infantry' && unit.unitType !== 'armor') continue;
      if (terrain.enemyUnitsWithin(unit.h3Index, CAMPAIGN_CONTACT_RADIUS) > 0) protectedUnitIds.add(unit.id);
    }
    const candidates = listSeaOperationCandidates({
      state,
      seatId,
      landMass,
      terrain,
      active: kept,
      protectedUnitIds,
      hasCampaignPlan: plan !== null,
    });
    const candidate = candidates.find((row) => row.clear);
    if (candidate === undefined) break;
    const launched: Operation = {
      id: nextOperationId(seatId, kept, state.turnNumber),
      method: 'sea',
      objectiveH3: candidate.objectiveH3,
      musterH3: candidate.musterH3,
      landingH3: null,
      unitIds: [...candidate.unitIds],
      carrierIds: [...candidate.carrierIds],
      phase: 'muster',
      source: 'engine',
      launchedTurn: state.turnNumber,
      phaseTurn: state.turnNumber,
    };
    const step = advanceSeaOperation(launched, factsFor(launched));
    applyOperationActions({ seatId, actions: step.actions, state, coordinates });
    if (step.next === null) break;
    kept.push(step.next);
    logDebug('operationTurnFlow launched', {
      seatId,
      id: launched.id,
      objectiveH3: launched.objectiveH3,
      musterH3: launched.musterH3,
      unitCount: launched.unitIds.length,
      carrierCount: launched.carrierIds.length,
    });
  }
  writeOperationsForSeat(configOps, seatId, kept);
}

/**
 * Advances sea operations for every active AI seat.
 *
 * Purpose: The planning turn has already been incremented and fog has been refreshed. This is the operation tick.
 * When to use: Once, after fog refresh and before the database save. Pass the coordinates the turn already built.
 * Expected outcome: Active seats have current operations. Every other seat's operations are removed. A failure is logged and the turn still finishes.
 * Exceptions: None. The outer catch logs a failure of the roster or the clear step. A seat catch logs that seat and continues.
 */
export function advanceOperationsAfterTurn(coordinates: KnockoutCoordinates): void {
  logDebug('operationTurnFlow advanceOperationsAfterTurn', {});
  try {
    const active = new Set<string>(activeAiSeatIds(getSeatRoster()));
    for (const seatId of readOperations(configOps).keys()) {
      if (!active.has(seatId)) writeOperationsForSeat(configOps, seatId, []);
    }
    for (const seatId of activeAiSeatIds(getSeatRoster())) {
      try {
        advanceOperationsForSeat(seatId, coordinates);
      } catch (err) {
        logError('operationTurnFlow: seat failed; operations left as stored', { seatId }, err);
      }
    }
  } catch (err) {
    logError('operationTurnFlow: could not advance operations; the turn goes on', err);
  }
}
