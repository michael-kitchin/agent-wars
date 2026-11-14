/**
 * Advances every active AI seat's sea operations once the planning turn has begun.
 *
 * Purpose: Muster, transit, assault, and return move forward after fog is refreshed and before the turn is saved.
 * When to use: Once, from the end of strategic resolution. A failure here must not stop the turn.
 * Expected outcome: Stored operations match the decisions. A seat that is no longer active loses its operations.
 * Exceptions: None. A thrown error is logged. The turn continues, and a seat that throws keeps the operations it already had.
 */

import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import type { AiSeatId } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../gameDb';
import { activeAiSeatIds } from '../../shared/seatRoster';
import type { Operation, OperationCandidate } from '../../shared/operationTypes';
import { postureSettingsForSeat } from '../gameDb/postureMemory';
import type { KnockoutCoordinates } from '../gameActions/knockoutConsequences';
import {
  dbGetAll,
  dbGetOne,
  dbRun,
  getGameStateForPlayer,
  getSeatRoster,
  listUnitsForSnapshot,
} from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import { loadCampaignLandMass } from '../openRouter/campaignObjectiveFlow';
import { resolveDefendPostH3 } from '../tools/standingOrdersDefendPost';
import { parseOrderParams, type StandingOrderRow } from '../tools/standingOrdersShared';
import {
  nextOperationId,
  readOperationOffer,
  readOperations,
  operationMemorySeatIds,
  writeOperationEventTurn,
  writeOperationNote,
  writeOperationOffer,
  writeOperationsForSeat,
} from '../gameDb/operationMemory';
import { buildLiftTerrain } from './liftTerrain';
import { applyOperationActions } from './operationActions';
import { advanceOperation } from './operationAdvance';
import { operationCandidatesForSeat } from './operationCandidates';
import { decideOperationOffer } from './operationOffer';
import { OPERATION_MUSTER_CANDIDATE_LIMIT } from './operationRules';
import { type OperationFacts, type StoredOrderFact } from './seaOperationAdvance';
import { listKnownEnemyCities } from './seaOperationCandidates';

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
 * Builds the facts one operation's advance reads.
 *
 * Purpose: A launch and a cancel must judge the force with the same terrain, orders, and city facts as the turn advance.
 * When to use: Once per operation, with the snapshot that includes every unit the decision should see.
 * Expected outcome: Facts for that operation. Null when the land mass cannot be loaded.
 * Exceptions: None. A missing land mass is null. A thrown terrain error propagates.
 */
export function buildOperationFacts(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly operation: Operation;
  readonly coordinates: KnockoutCoordinates;
}): OperationFacts | null {
  logTrace('operationTurnFlow buildOperationFacts', { seatId: args.seatId, id: args.operation.id, phase: args.operation.phase });
  const landMass = loadCampaignLandMass(args.seatId);
  if (landMass === null) {
    logDebug('operationTurnFlow buildOperationFacts', { seatId: args.seatId, id: args.operation.id, skipped: 'terrain' });
    return null;
  }
  const terrain = buildLiftTerrain({ state: args.state, seatId: args.seatId, landMass });
  const own = args.state.units.filter((unit) => unit.player === args.seatId);
  const carrierByCargoId = new Map<string, string>();
  for (const unit of own) {
    if (unit.embarkedOnCarrierUnitId) carrierByCargoId.set(unit.id, unit.embarkedOnCarrierUnitId);
  }
  const enemyCities = new Set(listKnownEnemyCities(args.state, args.seatId).map((city) => city.h3Index));
  const controlByHex = new Map((args.state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  return {
    turnNumber: args.state.turnNumber,
    unitHexById: new Map(own.map((unit) => [unit.id, unit.h3Index])),
    unitTypeById: new Map(own.map((unit) => [unit.id, unit.unitType])),
    carrierByCargoId,
    storedOrderById: readStoredOrders(args.seatId, args.coordinates),
    objectiveIsOwn: controlByHex.get(args.operation.objectiveH3) === args.seatId,
    objectiveIsEnemyCity: enemyCities.has(args.operation.objectiveH3),
    objectiveHasEnemyUnit: terrain.enemyUnitsWithin(args.operation.objectiveH3, 0) > 0,
    chooseLanding: (fromH3) => chooseLanding(terrain, args.operation.objectiveH3, fromH3),
    chooseReturnPort: (fromH3) => chooseReturnPort({ fromH3, seatId: args.seatId, state: args.state, terrain }),
  };
}

/**
 * Advances one seat's stored operations and launches into any free slot.
 *
 * Purpose: The seat counts enemy units that fog would hide. It launches only a sea or air row the posture counts as clear, after that row has waited one turn.
 * When to use: Once per active AI seat, after knocked-out seats have been cleared.
 * Expected outcome: The seat's stored list is replaced with the operations still running. A new landing waits until a row the posture counts as clear has been offered on an earlier turn. Land rows are not launched.
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
  const unitHexById = new Map(
    state.units.filter((unit) => unit.player === seatId).map((unit) => [unit.id, unit.h3Index]),
  );
  const kept: Operation[] = [];
  const withheldIds = new Set<string>();
  let seatEvent = false;
  const stored = [...(readOperations(configOps).get(seatId) ?? [])].sort((left, right) => compareIds(left.id, right.id));
  for (const operation of stored) {
    const startedPhase = operation.phase;
    const facts = buildOperationFacts({ state, seatId, operation, coordinates });
    if (facts === null) {
      kept.push(operation);
      continue;
    }
    const step = advanceOperation(operation, facts);
    const actionCount = applyOperationActions({ seatId, actions: step.actions, state, coordinates });
    if (step.next !== null) kept.push(step.next);
    for (const unitId of step.releasedIds) withheldIds.add(unitId);
    if (step.outcome !== 'running' || (step.next !== null && step.next.phase !== startedPhase)) seatEvent = true;
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
  let offer = readOperationOffer(configOps, seatId);
  let launchedThisTick = false;
  const settings = postureSettingsForSeat(seatId);
  /**
   * Whether the engine may treat this sea or air row as clear.
   *
   * Purpose: The offer clock and the launch share one rule, so a lightly held city can start the clock.
   * When to use: On the land-free list only. A land row is removed before this runs.
   * Expected outcome: True when the row is clear, or its defender count is within the posture's maximum. An air row stays true because its clear flag is true.
   * Exceptions: None.
   */
  const engineMayLaunch = (candidate: OperationCandidate): boolean =>
    candidate.clear || candidate.defenders <= settings.engineLaunchMaxDefenders;
  while (true) {
    const candidates = operationCandidatesForSeat({ state, seatId, active: kept, withheldIds });
    const launchable = candidates.filter((candidate) => candidate.method !== 'land');
    const decision = decideOperationOffer({
      turnNumber: state.turnNumber,
      hasCandidate: launchable.length > 0,
      hasClear: launchable.some(engineMayLaunch),
      offer,
    });
    offer = decision.offer;
    if (decision.consult) seatEvent = true;
    if (!decision.launch || launchedThisTick) break;
    const candidate = launchable.find(engineMayLaunch);
    if (candidate === undefined || candidate.method === 'land') break;
    const launched: Operation = {
      id: nextOperationId(seatId, kept, state.turnNumber),
      method: candidate.method,
      objectiveH3: candidate.objectiveH3,
      musterH3: candidate.musterH3,
      landingH3: candidate.method === 'air' ? candidate.landingH3 : null,
      unitIds: [...candidate.unitIds],
      carrierIds: [...candidate.carrierIds],
      phase: 'muster',
      source: 'engine',
      launchedTurn: state.turnNumber,
      phaseTurn: state.turnNumber,
    };
    const facts = buildOperationFacts({ state, seatId, operation: launched, coordinates });
    if (facts === null) break;
    const step = advanceOperation(launched, facts);
    applyOperationActions({ seatId, actions: step.actions, state, coordinates });
    launchedThisTick = true;
    if (step.next !== null) kept.push(step.next);
    seatEvent = true;
    logDebug('operationTurnFlow launched', {
      seatId,
      id: launched.id,
      method: launched.method,
      objectiveH3: launched.objectiveH3,
      musterH3: launched.musterH3,
      unitCount: launched.unitIds.length,
      carrierCount: launched.carrierIds.length,
    });
  }
  const offerEmpty = offer.announcedTurn === null && offer.clearOfferTurn === null;
  writeOperationOffer(configOps, seatId, offerEmpty ? null : offer);
  if (seatEvent) writeOperationEventTurn(configOps, seatId, state.turnNumber);
  writeOperationsForSeat(configOps, seatId, kept);
}

/**
 * Advances sea operations for every active AI seat.
 *
 * Purpose: The planning turn has already been incremented and fog has been refreshed. This is the operation tick.
 * When to use: Once, after fog refresh and before the database save. Pass the coordinates the turn already built.
 * Expected outcome: Active seats have current operations. Every other seat loses its operations, its menu, its consult turn, and its refusal note. A failure is logged and the turn still finishes.
 * Exceptions: None. The outer catch logs a failure of the roster or the clear step. A seat catch logs that seat and continues.
 */
export function advanceOperationsAfterTurn(coordinates: KnockoutCoordinates): void {
  logDebug('operationTurnFlow advanceOperationsAfterTurn', {});
  try {
    const active = new Set<string>(activeAiSeatIds(getSeatRoster()));
    for (const seatId of operationMemorySeatIds(configOps)) {
      if (!active.has(seatId)) {
        writeOperationsForSeat(configOps, seatId, []);
        writeOperationOffer(configOps, seatId, null);
        writeOperationEventTurn(configOps, seatId, null);
        writeOperationNote(configOps, seatId, null);
      }
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
