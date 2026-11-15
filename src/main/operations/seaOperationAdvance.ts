/**
 * Decides the next phase, the orders, and the releases for one sea operation.
 *
 * Purpose: One pure step so the turn hook can apply orders without re-deciding them.
 * When to use: Once per stored operation each planning turn, and once on the tick an operation is launched.
 * Expected outcome: The next stored operation, or null when it ended, plus the actions to apply in order.
 * Exceptions: None. The caller supplies the facts. This file does not read the database or the map.
 */

import { compareCodeUnits } from '../../shared/codeUnitOrder';
import type { Operation, OperationPhase } from '../../shared/operationTypes';
import { logDebug } from '../logger';
import { fillShip } from './liftRules';
import {
  OPERATION_ASSAULT_TIMEOUT_TURNS,
  OPERATION_MIN_GROUND_UNITS,
  OPERATION_MUSTER_TIMEOUT_TURNS,
  OPERATION_TRANSIT_TIMEOUT_TURNS,
} from './operationRules';

import type {
  OperationAction,
  OperationFacts,
  OperationOutcome,
  OperationStep,
} from './operationStepTypes';
export type {
  OperationAction,
  OperationFacts,
  OperationOutcome,
  OperationStep,
  StoredOrderFact,
} from './operationStepTypes';

/**
 * A force after units that are gone or released have been removed.
 *
 * Purpose: Every phase reads the same remaining ids.
 * When to use: The start of `advanceSeaOperation`.
 * Expected outcome: Remaining ground units, remaining ships, and the ids released this tick.
 * Exceptions: None.
 */
interface RemainingForce {
  /**
   * Ground units still in the operation.
   *
   * Contract: Later rules march, embark, or unload these ids only.
   * When to use: The phase rule.
   * Expected outcome: Ids that exist and were not released.
   * Exceptions: None.
   */
  readonly unitIds: readonly string[];
  /**
   * Ships still in the operation.
   *
   * Contract: Later rules march or unload these ids only.
   * When to use: The phase rule.
   * Expected outcome: Ids that exist and were not released.
   * Exceptions: None.
   */
  readonly carrierIds: readonly string[];
  /**
   * Ids released this tick, ground units first and then ships.
   *
   * Contract: Cargo of a released ship is included even when that cargo had no order of its own.
   * When to use: The step's `releasedIds`.
   * Expected outcome: A subset of the ids that existed at the start of the tick.
   * Exceptions: None.
   */
  readonly releasedIds: readonly string[];
}

/**
 * How many turns the current phase has already lasted.
 *
 * Purpose: A timeout fires when this reaches the phase constant. The opening tick is zero.
 * When to use: Muster, transit, and assault.
 * Expected outcome: `turnNumber - phaseTurn`.
 * Exceptions: None.
 */
function elapsedTurns(operation: Operation, facts: OperationFacts): number {
  return facts.turnNumber - operation.phaseTurn;
}

/**
 * True when the ground unit is aboard a ship that is still in the operation.
 *
 * Purpose: Cargo is unloaded or released with its ship. A unit on foot is the landed wave or is dropped.
 * When to use: Release and the transit and return drop rules.
 * Expected outcome: True only when `carrierByCargoId` names one of `carrierIds`.
 * Exceptions: None.
 */
function isCarried(unitId: string, facts: OperationFacts, carrierIds: readonly string[]): boolean {
  const carrierId = facts.carrierByCargoId.get(unitId);
  return carrierId !== undefined && carrierIds.includes(carrierId);
}

/**
 * One order the current phase may leave on a unit.
 *
 * Purpose: The release check shares the hex and the type.
 * When to use: Building the allowed list for one unit.
 * Expected outcome: A type and the hex that type must name.
 * Exceptions: None.
 */
interface AllowedOrder {
  /**
   * Order type the phase assigns.
   *
   * Contract: `march` and `defend` are the only types a phase writes.
   * When to use: Compared with the stored order type.
   * Expected outcome: `march` or `defend`.
   * Exceptions: None.
   */
  readonly type: string;
  /**
   * Hex that order must name.
   *
   * Contract: The same type on another hex belongs to the commander, not the phase.
   * When to use: Compared with the stored order hex.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly h3: string;
}

/**
 * Orders the phase would have assigned to this unit.
 *
 * Purpose: Any other stored order releases the unit. No stored order never releases it.
 * When to use: Once per existing unit before the phase rule.
 * Expected outcome: An empty list when the phase assigns nothing, which releases a unit that has an order.
 * Exceptions: None.
 */
function ordersAssigned(operation: Operation, role: 'ground' | 'ship', carried: boolean): readonly AllowedOrder[] {
  if (operation.phase === 'muster') {
    return [
      { type: 'march', h3: operation.musterH3 },
      { type: 'defend', h3: operation.musterH3 },
    ];
  }
  if (operation.phase === 'transit' && role === 'ship' && operation.landingH3 !== null) {
    return [{ type: 'march', h3: operation.landingH3 }];
  }
  if (operation.phase === 'transit' && role === 'ground' && !carried) {
    return [
      { type: 'march', h3: operation.objectiveH3 },
      { type: 'defend', h3: operation.objectiveH3 },
    ];
  }
  if (operation.phase === 'assault' && role === 'ground') {
    return [
      { type: 'march', h3: operation.objectiveH3 },
      { type: 'defend', h3: operation.objectiveH3 },
    ];
  }
  if (operation.phase === 'return' && role === 'ship') {
    return [{ type: 'march', h3: operation.musterH3 }];
  }
  return [];
}

/**
 * True when the unit's stored order is not one the phase would assign.
 *
 * Purpose: The commander takes a unit out by giving it any other standing order.
 * When to use: For each unit that still exists.
 * Expected outcome: False when the unit has no stored order or the order matches.
 * Exceptions: None.
 */
function hasForeignOrder(unitId: string, operation: Operation, facts: OperationFacts, role: 'ground' | 'ship', carried: boolean): boolean {
  const order = facts.storedOrderById.get(unitId);
  if (order === undefined) return false;
  return !ordersAssigned(operation, role, carried).some((allowed) => allowed.type === order.type && allowed.h3 === order.h3Index);
}

/**
 * Drops units that are gone or released, and remembers the releases.
 *
 * Purpose: Later rules must not unload or march a unit the commander took back.
 * When to use: At the start of every advance, before the phase rule.
 * Expected outcome: Remaining ids, plus released ids. Cargo of a released ship is released and left embarked. The launch tick replaces orders the units already had.
 * Exceptions: None.
 */
function remainingForce(operation: Operation, facts: OperationFacts): RemainingForce {
  const presentUnits = operation.unitIds.filter((unitId) => facts.unitHexById.has(unitId));
  const presentShips = operation.carrierIds.filter((shipId) => facts.unitHexById.has(shipId));
  const released = new Set<string>();
  const claimedThisTurn = operation.launchedTurn === facts.turnNumber;
  if (!claimedThisTurn) {
    for (const unitId of presentUnits) {
      if (hasForeignOrder(unitId, operation, facts, 'ground', isCarried(unitId, facts, presentShips))) released.add(unitId);
    }
    for (const shipId of presentShips) {
      if (hasForeignOrder(shipId, operation, facts, 'ship', false)) released.add(shipId);
    }
  }
  for (const shipId of presentShips) {
    if (!released.has(shipId)) continue;
    for (const unitId of presentUnits) {
      if (facts.carrierByCargoId.get(unitId) === shipId) released.add(unitId);
    }
  }
  return {
    unitIds: presentUnits.filter((unitId) => !released.has(unitId)),
    carrierIds: presentShips.filter((shipId) => !released.has(shipId)),
    releasedIds: [
      ...presentUnits.filter((unitId) => released.has(unitId)),
      ...presentShips.filter((shipId) => released.has(shipId)),
    ],
  };
}

/**
 * True when an uncarried unit is the part of the force already put ashore.
 *
 * Purpose: Transit keeps that wave so the next tick does not forget a unit that has landed.
 * When to use: The transit drop, after release.
 * Expected outcome: True when its order is a march or defend on the objective, or it stands on the landing or the objective.
 * Exceptions: None.
 */
function isLandedWave(unitId: string, operation: Operation, facts: OperationFacts): boolean {
  const order = facts.storedOrderById.get(unitId);
  const orderedOntoObjective = order !== undefined
    && (order.type === 'march' || order.type === 'defend')
    && order.h3Index === operation.objectiveH3;
  const hex = facts.unitHexById.get(unitId);
  return orderedOntoObjective || hex === operation.landingH3 || hex === operation.objectiveH3;
}

/**
 * Drops ground units the phase no longer carries and does not count as ashore.
 *
 * Purpose: Transit keeps the landed wave. Return keeps only units still aboard.
 * When to use: After release, before the phase rule. Other phases keep every remaining unit.
 * Expected outcome: The kept ids. Dropped ids are not released and receive no action.
 * Exceptions: None.
 */
function dropUncarried(operation: Operation, facts: OperationFacts, force: RemainingForce): readonly string[] {
  if (operation.phase !== 'transit' && operation.phase !== 'return') return force.unitIds;
  return force.unitIds.filter((unitId) => {
    if (isCarried(unitId, facts, force.carrierIds)) return true;
    if (operation.phase === 'return') return false;
    return isLandedWave(unitId, operation, facts);
  });
}

/**
 * A cancel for each id, in the order given.
 *
 * Purpose: Giving up a muster clears the orders the operation had assigned.
 * When to use: When a muster abandons, and for units that do not board.
 * Expected outcome: One `cancelOrder` per id.
 * Exceptions: None.
 */
function cancelAll(ids: readonly string[]): OperationAction[] {
  return ids.map((unitId) => ({ kind: 'cancelOrder' as const, unitId }));
}

/**
 * An ended step with no stored operation.
 *
 * Purpose: The four end outcomes share one shape.
 * When to use: Abandon, loss, and completion.
 * Expected outcome: `next` is null.
 * Exceptions: None.
 */
function ended(outcome: OperationOutcome, reason: string, actions: readonly OperationAction[], releasedIds: readonly string[]): OperationStep {
  return { next: null, actions, releasedIds, outcome, reason };
}

/**
 * Lost only when a unit or ship that was not released is missing from the map.
 *
 * Purpose: A transit that the commander emptied is abandoned. One that lost a unit or a ship is lost.
 * When to use: When transit has no ground unit left, including when no ship remains either.
 * Expected outcome: `lost` when any id still named by the operation, and not in `releasedIds`, is absent from `unitHexById`. Otherwise `abandoned`.
 * Exceptions: None.
 */
function departureOutcome(operation: Operation, releasedIds: readonly string[], facts: OperationFacts): 'abandoned' | 'lost' {
  const released = new Set(releasedIds);
  const gone = [...operation.unitIds, ...operation.carrierIds]
    .filter((id) => !released.has(id))
    .some((id) => !facts.unitHexById.has(id));
  return gone ? 'lost' : 'abandoned';
}

/**
 * Lost only when the side that emptied lost a member to the map.
 *
 * Purpose: A sunk ship or a destroyed force is a loss, while a muster the commander emptied is abandoned.
 * When to use: When a muster has no ground unit or no ship left.
 * Expected outcome: `lost` when the ground units are all gone and one of them, not released, is absent from `unitHexById`, or the same for the ships. Otherwise `abandoned`.
 * Exceptions: None.
 */
function emptyMusterOutcome(args: {
  readonly operation: Operation;
  readonly facts: OperationFacts;
  readonly unitIds: readonly string[];
  readonly carrierIds: readonly string[];
  readonly releasedIds: readonly string[];
}): 'abandoned' | 'lost' {
  const released = new Set(args.releasedIds);
  const lostFrom = (ids: readonly string[]): boolean => ids.some((id) => !released.has(id) && !args.facts.unitHexById.has(id));
  const groundLost = args.unitIds.length === 0 && lostFrom(args.operation.unitIds);
  const shipsLost = args.carrierIds.length === 0 && lostFrom(args.operation.carrierIds);
  return groundLost || shipsLost ? 'lost' : 'abandoned';
}

/**
 * The march or defend that brings a unit to the muster, or null when it already has it.
 *
 * Purpose: A unit standing on the port defends there. Any other unit marches there.
 * When to use: Muster, when the force is not yet ready to load.
 * Expected outcome: One action, or null when the stored order is already the one this would write.
 * Exceptions: None.
 */
function gatherAction(unitId: string, musterH3: string, facts: OperationFacts): OperationAction | null {
  const order = facts.storedOrderById.get(unitId);
  if (facts.unitHexById.get(unitId) === musterH3) {
    if (order?.type === 'defend' && order.h3Index === musterH3) return null;
    return { kind: 'defend', unitId, atH3: musterH3 };
  }
  if (order?.type === 'march' && order.h3Index === musterH3) return null;
  return { kind: 'march', unitId, toH3: musterH3 };
}

/**
 * Copies an operation with a new force and, when the phase changes, a new phase clock.
 *
 * Purpose: Callers spread one object instead of repeating every stored field.
 * When to use: When a phase continues or changes but the operation is not finished.
 * Expected outcome: A new operation. The input is not changed.
 * Exceptions: None.
 */
function continueOperation(operation: Operation, patch: {
  readonly unitIds: readonly string[];
  readonly carrierIds: readonly string[];
  readonly phase: OperationPhase;
  readonly phaseTurn: number;
  readonly landingH3?: string | null;
  readonly musterH3?: string;
}): Operation {
  return {
    ...operation,
    unitIds: patch.unitIds,
    carrierIds: patch.carrierIds,
    phase: patch.phase,
    phaseTurn: patch.phaseTurn,
    landingH3: patch.landingH3 !== undefined ? patch.landingH3 : operation.landingH3,
    musterH3: patch.musterH3 ?? operation.musterH3,
  };
}

/**
 * Loads the units waiting at the port and sails the ships that took them.
 *
 * Purpose: Ready muster returns only these actions, not the gather marches.
 * When to use: When the muster is ready and a landing exists.
 * Expected outcome: Cancel and embark for each loaded unit, a march for each loaded ship, and cancels for everyone else.
 * Exceptions: None.
 */
function loadAndSail(args: {
  readonly operation: Operation;
  readonly facts: OperationFacts;
  readonly unitIds: readonly string[];
  readonly carrierIds: readonly string[];
  readonly presentIds: readonly string[];
  readonly shipsPresent: readonly string[];
  readonly landing: string;
}): OperationStep {
  const { operation, facts, unitIds, carrierIds, presentIds, shipsPresent, landing } = args;
  let waiting = [...presentIds];
  const embarked = new Set<string>();
  const loadedShips = new Set<string>();
  const actions: OperationAction[] = [];
  for (const shipId of [...shipsPresent].sort(compareCodeUnits)) {
    if (waiting.length === 0) break;
    const chosen = fillShip(waiting.map((id) => ({ id, unitType: facts.unitTypeById.get(id) ?? '' })));
    if (chosen.length === 0) break;
    for (const unitId of chosen) {
      actions.push({ kind: 'cancelOrder', unitId });
      actions.push({ kind: 'embark', unitId, carrierId: shipId });
      embarked.add(unitId);
    }
    loadedShips.add(shipId);
    const chosenIds = new Set(chosen);
    waiting = waiting.filter((id) => !chosenIds.has(id));
  }
  for (const shipId of [...loadedShips].sort(compareCodeUnits)) {
    actions.push({ kind: 'march', unitId: shipId, toH3: landing });
  }
  for (const shipId of carrierIds) {
    if (!loadedShips.has(shipId)) actions.push({ kind: 'cancelOrder', unitId: shipId });
  }
  for (const unitId of unitIds) {
    if (!embarked.has(unitId)) actions.push({ kind: 'cancelOrder', unitId });
  }
  const next = continueOperation(operation, {
    unitIds: unitIds.filter((unitId) => embarked.has(unitId)),
    carrierIds: carrierIds.filter((shipId) => loadedShips.has(shipId)),
    phase: 'transit',
    phaseTurn: facts.turnNumber,
    landingH3: landing,
  });
  return { next, actions, releasedIds: [], outcome: 'running', reason: 'muster-loaded' };
}

/**
 * Advances a muster: gather, load, or give up.
 *
 * Purpose: The force marches to the port and boards only when enough of it, and a ship, are there.
 * When to use: `operation.phase` is `muster`.
 * Expected outcome: `transit` when the force loads. `abandoned` when it cannot, or `lost` when it emptied because a unit or ship is gone from the map. Otherwise the same phase.
 * Exceptions: None. A null landing abandons without embarking.
 */
function advanceMuster(operation: Operation, facts: OperationFacts, unitIds: readonly string[], carrierIds: readonly string[], releasedIds: readonly string[]): OperationStep {
  const remaining = [...unitIds, ...carrierIds];
  if (unitIds.length === 0 || carrierIds.length === 0) {
    const outcome = emptyMusterOutcome({ operation, facts, unitIds, carrierIds, releasedIds });
    return ended(outcome, 'muster-empty', cancelAll(remaining), releasedIds);
  }
  const presentIds = unitIds.filter((unitId) => facts.unitHexById.get(unitId) === operation.musterH3);
  const shipsPresent = carrierIds.filter((shipId) => facts.unitHexById.get(shipId) === operation.musterH3);
  const timedOut = elapsedTurns(operation, facts) >= OPERATION_MUSTER_TIMEOUT_TURNS;
  const everyonePresent = presentIds.length === unitIds.length;
  const ready = shipsPresent.length > 0 && (everyonePresent || (timedOut && presentIds.length >= OPERATION_MIN_GROUND_UNITS));
  if (timedOut && !ready) return ended('abandoned', 'muster-timeout', cancelAll(remaining), releasedIds);
  if (ready) {
    const landing = facts.chooseLanding(operation.musterH3);
    if (landing === null) return ended('abandoned', 'muster-no-landing', cancelAll(remaining), releasedIds);
    const loaded = loadAndSail({ operation, facts, unitIds, carrierIds, presentIds, shipsPresent, landing });
    return { ...loaded, releasedIds };
  }
  const actions = remaining.flatMap((unitId) => {
    const action = gatherAction(unitId, operation.musterH3, facts);
    return action === null ? [] : [action];
  });
  return {
    next: continueOperation(operation, { unitIds, carrierIds, phase: 'muster', phaseTurn: operation.phaseTurn }),
    actions,
    releasedIds,
    outcome: 'running',
    reason: 'muster-gather',
  };
}

/**
 * Unloads ships that have reached the landing and keeps the others sailing.
 *
 * Purpose: Cargo marches on the city, or defends when the landing is the city, and the ship leaves the operation.
 * When to use: Transit, after the turn-back check has declined.
 * Expected outcome: Unload, then the cargo order, then a defend for the ship. Other ships with no order march on.
 * Exceptions: None. A missing landing hex adds no march.
 */
function unloadAtLanding(operation: Operation, facts: OperationFacts, unitIds: readonly string[], carrierIds: readonly string[]): { readonly actions: readonly OperationAction[]; readonly carrierIds: readonly string[] } {
  const landing = operation.landingH3;
  const actions: OperationAction[] = [];
  const departed = new Set<string>();
  if (landing !== null) {
    for (const shipId of carrierIds) {
      if (facts.unitHexById.get(shipId) !== landing) continue;
      const cargo = unitIds.filter((unitId) => facts.carrierByCargoId.get(unitId) === shipId);
      for (const unitId of cargo) actions.push({ kind: 'unload', unitId });
      for (const unitId of cargo) {
        actions.push(landing === operation.objectiveH3
          ? { kind: 'defend', unitId, atH3: operation.objectiveH3 }
          : { kind: 'march', unitId, toH3: operation.objectiveH3 });
      }
      actions.push({ kind: 'defend', unitId: shipId, atH3: landing });
      departed.add(shipId);
    }
  }
  const stillSailing = carrierIds.filter((shipId) => !departed.has(shipId));
  if (landing !== null) {
    for (const shipId of stillSailing) {
      if (!facts.storedOrderById.has(shipId)) actions.push({ kind: 'march', unitId: shipId, toH3: landing });
    }
  }
  return { actions, carrierIds: stillSailing };
}

/**
 * Advances a transit: land, turn back, or keep sailing.
 *
 * Purpose: Ships that arrive unload. A voyage that loses its objective, or that runs out of time, turns back.
 * When to use: `operation.phase` is `transit`.
 * Expected outcome: `assault` when no ship remains and ground units do. `return` when the voyage turns back. An end when no ground unit remains.
 * Exceptions: None.
 */
function advanceTransit(operation: Operation, facts: OperationFacts, unitIds: readonly string[], carrierIds: readonly string[], releasedIds: readonly string[]): OperationStep {
  if (carrierIds.length === 0 && unitIds.length === 0) {
    const outcome = departureOutcome(operation, releasedIds, facts);
    return ended(outcome, outcome === 'abandoned' ? 'transit-abandoned' : 'transit-lost', [], releasedIds);
  }
  if (unitIds.length === 0) {
    const outcome = departureOutcome(operation, releasedIds, facts);
    return ended(outcome, 'transit-empty', cancelAll(carrierIds), releasedIds);
  }
  if (carrierIds.length === 0) {
    return {
      next: continueOperation(operation, { unitIds, carrierIds: [], phase: 'assault', phaseTurn: facts.turnNumber }),
      actions: [],
      releasedIds,
      outcome: 'running',
      reason: 'transit-assault',
    };
  }
  const objectiveGone = !facts.objectiveIsEnemyCity && !facts.objectiveIsOwn;
  if (objectiveGone || elapsedTurns(operation, facts) >= OPERATION_TRANSIT_TIMEOUT_TURNS) {
    const turned = turnSeaOperationBack(continueOperation(operation, { unitIds, carrierIds, phase: operation.phase, phaseTurn: operation.phaseTurn }), facts);
    return { ...turned, releasedIds };
  }
  const unloaded = unloadAtLanding(operation, facts, unitIds, carrierIds);
  if (unloaded.carrierIds.length === 0) {
    return {
      next: continueOperation(operation, { unitIds, carrierIds: [], phase: 'assault', phaseTurn: facts.turnNumber }),
      actions: unloaded.actions,
      releasedIds,
      outcome: 'running',
      reason: 'transit-assault',
    };
  }
  return {
    next: continueOperation(operation, { unitIds, carrierIds: unloaded.carrierIds, phase: 'transit', phaseTurn: operation.phaseTurn }),
    actions: unloaded.actions,
    releasedIds,
    outcome: 'running',
    reason: 'transit-sail',
  };
}

/**
 * Advances an assault: take the city, give up, or keep marching.
 *
 * Purpose: Units with no order are sent at the city until the seat owns it or the assault runs out of time.
 * When to use: `operation.phase` is `assault`.
 * Expected outcome: `completed` when the seat owns the city. `abandoned` on timeout, with no new order. `lost` when no unit remains.
 * Exceptions: None.
 */
function advanceAssault(operation: Operation, facts: OperationFacts, unitIds: readonly string[], carrierIds: readonly string[], releasedIds: readonly string[]): OperationStep {
  if (unitIds.length === 0) return ended('lost', 'assault-lost', [], releasedIds);
  if (facts.objectiveIsOwn) {
    const actions = unitIds
      .filter((unitId) => facts.unitHexById.get(unitId) === operation.objectiveH3)
      .map((unitId): OperationAction => ({ kind: 'defend', unitId, atH3: operation.objectiveH3 }));
    return ended('completed', 'assault-completed', actions, releasedIds);
  }
  if (elapsedTurns(operation, facts) >= OPERATION_ASSAULT_TIMEOUT_TURNS) {
    return ended('abandoned', 'assault-timeout', [], releasedIds);
  }
  const actions = unitIds
    .filter((unitId) => !facts.storedOrderById.has(unitId))
    .map((unitId): OperationAction => ({ kind: 'march', unitId, toH3: operation.objectiveH3 }));
  return {
    next: continueOperation(operation, { unitIds, carrierIds, phase: 'assault', phaseTurn: operation.phaseTurn }),
    actions,
    releasedIds,
    outcome: 'running',
    reason: 'assault-march',
  };
}

/**
 * Unloads ships that have reached the return port and keeps the others sailing home.
 *
 * Purpose: Cargo defends at the port and then leaves the operation with the ship.
 * When to use: Return, when at least one ship remains.
 * Expected outcome: Unload then defend for each cargo unit, then defend for the ship. Other ships with no order march home.
 * Exceptions: None.
 */
function unloadAtHome(operation: Operation, facts: OperationFacts, unitIds: readonly string[], carrierIds: readonly string[]): { readonly actions: readonly OperationAction[]; readonly unitIds: readonly string[]; readonly carrierIds: readonly string[] } {
  const actions: OperationAction[] = [];
  const departed = new Set<string>();
  const droppedCargo = new Set<string>();
  for (const shipId of carrierIds) {
    if (facts.unitHexById.get(shipId) !== operation.musterH3) continue;
    const cargo = unitIds.filter((unitId) => facts.carrierByCargoId.get(unitId) === shipId);
    for (const unitId of cargo) {
      actions.push({ kind: 'unload', unitId });
      actions.push({ kind: 'defend', unitId, atH3: operation.musterH3 });
      droppedCargo.add(unitId);
    }
    actions.push({ kind: 'defend', unitId: shipId, atH3: operation.musterH3 });
    departed.add(shipId);
  }
  const stillSailing = carrierIds.filter((shipId) => !departed.has(shipId));
  for (const shipId of stillSailing) {
    if (!facts.storedOrderById.has(shipId)) actions.push({ kind: 'march', unitId: shipId, toH3: operation.musterH3 });
  }
  return {
    actions,
    unitIds: unitIds.filter((unitId) => !droppedCargo.has(unitId)),
    carrierIds: stillSailing,
  };
}

/**
 * Advances a return: sail home and unload. There is no timeout.
 *
 * Purpose: A long voyage home continues while any ship remains, including one that still has cargo aboard.
 * When to use: `operation.phase` is `return`.
 * Expected outcome: `abandoned` once every remaining ship has unloaded. `lost` when no ship is left to come home. Otherwise `running`.
 * Exceptions: None.
 */
function advanceReturn(operation: Operation, facts: OperationFacts, unitIds: readonly string[], carrierIds: readonly string[], releasedIds: readonly string[]): OperationStep {
  if (carrierIds.length === 0) return ended('lost', 'return-lost', [], releasedIds);
  const unloaded = unloadAtHome(operation, facts, unitIds, carrierIds);
  if (unloaded.carrierIds.length === 0) return ended('abandoned', 'return-home', unloaded.actions, releasedIds);
  return {
    next: continueOperation(operation, { unitIds: unloaded.unitIds, carrierIds: unloaded.carrierIds, phase: 'return', phaseTurn: operation.phaseTurn }),
    actions: unloaded.actions,
    releasedIds,
    outcome: 'running',
    reason: 'return-sail',
  };
}

/**
 * Ends an operation because the commander called it off.
 *
 * Purpose: A cancel has to free a force that is still gathering, turn a force at sea back, and stop one that is already ashore.
 * When to use: When a reply names this operation and it is not already in `return`.
 * Expected outcome: `muster` cancels every unit and ship and stores nothing. `transit` is the return step. `assault` stores nothing and adds no order. `return` is unchanged.
 * Exceptions: None.
 */
export function cancelSeaOperation(operation: Operation, facts: OperationFacts): OperationStep {
  logDebug('seaOperationAdvance cancelSeaOperation', { id: operation.id, phase: operation.phase });
  if (operation.phase === 'muster') {
    const ids = [...operation.unitIds, ...operation.carrierIds];
    return ended('abandoned', 'cancel-muster', cancelAll(ids), ids);
  }
  if (operation.phase === 'transit') return turnSeaOperationBack(operation, facts);
  if (operation.phase === 'assault') return ended('abandoned', 'cancel-assault', [], []);
  return { next: operation, actions: [], releasedIds: [], outcome: 'running', reason: 'already returning' };
}

/**
 * Turns a transit back toward a home port.
 *
 * Purpose: A transit that cannot finish, and a later cancel, share one way to start a return.
 * When to use: When the objective is gone, or the transit timeout has fired, and at least one ship remains. Also directly when a caller already holds the remaining force.
 * Expected outcome: Phase `return`. Carried units stay. Units already ashore leave the operation and defend where they stand, and they are not released. Ships march to the port chosen from the first remaining ship. `outcome` is `running`.
 * Exceptions: None. A null port keeps the operation's current muster hex. `releasedIds` is empty; the caller merges releases.
 */
export function turnSeaOperationBack(operation: Operation, facts: OperationFacts): OperationStep {
  const ships = operation.carrierIds.filter((shipId) => facts.unitHexById.has(shipId));
  const firstShip = ships[0];
  const fromHex = firstShip === undefined ? operation.musterH3 : (facts.unitHexById.get(firstShip) ?? operation.musterH3);
  const port = ships.length === 0 ? operation.musterH3 : (facts.chooseReturnPort(fromHex) ?? operation.musterH3);
  const presentUnits = operation.unitIds.filter((unitId) => facts.unitHexById.has(unitId));
  const carried = presentUnits.filter((unitId) => isCarried(unitId, facts, ships));
  const ashore = presentUnits.filter((unitId) => !isCarried(unitId, facts, ships));
  const actions: OperationAction[] = [
    ...ships.map((shipId): OperationAction => ({ kind: 'march', unitId: shipId, toH3: port })),
    ...ashore.flatMap((unitId): OperationAction[] => {
      const atH3 = facts.unitHexById.get(unitId);
      return atH3 === undefined ? [] : [{ kind: 'defend', unitId, atH3 }];
    }),
  ];
  const next = continueOperation(operation, {
    unitIds: carried,
    carrierIds: ships,
    phase: 'return',
    phaseTurn: facts.turnNumber,
    landingH3: operation.landingH3,
    musterH3: port,
  });
  const step: OperationStep = { next, actions, releasedIds: [], outcome: 'running', reason: 'transit-return' };
  logDebug('seaOperationAdvance turnSeaOperationBack', {
    id: operation.id,
    fromHex,
    port,
    shipCount: ships.length,
    ashoreCount: ashore.length,
  });
  return step;
}

/**
 * Advances one sea operation by one planning turn.
 *
 * Purpose: The turn hook stores `next` and applies `actions` without knowing the phase rules.
 * When to use: Once per stored operation, in id order, and once for an operation just launched.
 * Expected outcome: Releases and missing units are already removed from `next`. A phase change stores `phaseTurn` as `turnNumber`.
 * Exceptions: None. A throw from a landing or port chooser propagates.
 */
export function advanceSeaOperation(operation: Operation, facts: OperationFacts): OperationStep {
  const force = remainingForce(operation, facts);
  const unitIds = dropUncarried(operation, facts, force);
  const step = operation.phase === 'muster'
    ? advanceMuster(operation, facts, unitIds, force.carrierIds, force.releasedIds)
    : operation.phase === 'transit'
      ? advanceTransit(operation, facts, unitIds, force.carrierIds, force.releasedIds)
      : operation.phase === 'assault'
        ? advanceAssault(operation, facts, unitIds, force.carrierIds, force.releasedIds)
        : advanceReturn(operation, facts, unitIds, force.carrierIds, force.releasedIds);
  logDebug('seaOperationAdvance advanceSeaOperation', {
    id: operation.id,
    phase: operation.phase,
    nextPhase: step.next?.phase ?? null,
    outcome: step.outcome,
    reason: step.reason,
    actionCount: step.actions.length,
    releasedCount: step.releasedIds.length,
  });
  return step;
}

